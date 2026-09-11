import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { transform } from '../../app/web/node_modules/esbuild/lib/main.js';
const helper=readFileSync(new URL('../../app/supabase/functions/metrc-sync/verified-pull.ts',import.meta.url),'utf8');
const {code}=await transform(helper,{loader:'ts',format:'esm'});
const moduleUrl=`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const {verifiedMetrcPull}=await import(moduleUrl);
const args={base:'https://fixture.invalid',runId:1,license:'A',spec:{key:'packages',paths:[{path:'/packages/v2/active',state:'active'},{path:'/packages/v2/inactive',state:'inactive'}]},window:{start:'2026-01-01T00:00:00Z',end:'2026-01-02T00:00:00Z'},advanceCursor:true,pageSize:20,maxPages:2,pauseMs:0};
function fixture(options={}){
 const calls=[],urls=[];let finished=0,requests=0,committed=false;
 const body='[{"Id":9007199254740993,"Label":"TAG","Quantity":1.1234567890123456789}]';
 const receipt={kind:'metrc_record_commit_v1',run_id:1,state:'api_verified',records:2,endpoint:'packages',license:'A',window_start:args.window.start,window_end:args.window.end,manifest_sha256:'a'.repeat(64)};
 const deps={outOfTime:()=>options.deadline&&requests>=options.deadline,sleep:async()=>{},get:async url=>{urls.push(url);requests++;return new Response(body,{status:options.httpError?503:200});},db:{rpc:async(name,p)=>{
  calls.push({name,p});
  if(name==='tg_metrc_begin_verification')return options.beginError?{error:{message:'lease conflict'}}:{data:{run_id:1}};
  if(name==='tg_metrc_stage_page'){
   assert.equal(p.p_response,body);assert.equal(p.p_sha256,createHash('sha256').update(body).digest('hex'));
   if(options.stageError)return{error:{message:'bad page'}};
   return{data:{records:1,terminal:!options.capped}};
  }
  if(!p.p_complete){assert.equal(committed,false,'cleanup must never succeed after commit');return{data:{state:'incomplete'}};}
  finished++;if(options.finishError)return{error:{message:'failed comparison'}};
  committed=true;if(options.lostAck&&finished===1)throw Error('response lost');
  return{data:{...receipt,...options.badReceipt}};
 }}};
 return {deps,calls,urls,execute:()=>verifiedMetrcPull(deps,args)};
}
test('all source states use exact text and bound request parameters before one atomic commit',async()=>{
 const f=fixture();assert.equal((await f.execute()).complete,true);
 assert.deepEqual(f.calls.map(c=>c.name),['tg_metrc_begin_verification','tg_metrc_stage_page','tg_metrc_stage_page','tg_metrc_finish_verification']);
 for(const url of f.urls){const q=new URL(url).searchParams;assert.equal(q.get('licenseNumber'),'A');assert.equal(q.get('lastModifiedStart'),args.window.start);assert.equal(q.get('lastModifiedEnd'),args.window.end);}
});
test('source errors, page caps and rejected source records close incomplete without successful promotion',async()=>{
 for(const options of [{httpError:true},{capped:true},{stageError:true},{finishError:true}]){
  const f=fixture(options);await assert.rejects(f.execute);assert.equal(f.calls.at(-1).p.p_complete,false);
 }
});
test('deadline exit retains staged evidence and does not claim completion',async()=>{
 const f=fixture({deadline:1});const r=await f.execute();assert.equal(r.complete,false);assert.equal(r.ranOut,true);assert.equal(f.calls.at(-1).p.p_complete,false);
});
test('an occupied lease stops before any vendor call',async()=>{
 const f=fixture({beginError:true});await assert.rejects(f.execute,/lease conflict/);assert.equal(f.urls.length,0);assert.equal(f.calls.length,1);
});
test('ambiguous completion retries the exact idempotent commit',async()=>{
 const f=fixture({lostAck:true});assert.equal((await f.execute()).complete,true);
 const commits=f.calls.filter(c=>c.name==='tg_metrc_finish_verification');assert.equal(commits.length,2);assert.deepEqual(commits[0],commits[1]);
});
test('wrong identity or coverage in the receipt cannot earn worker success',async()=>{
 for(const badReceipt of [{run_id:2},{records:3},{license:'B'},{endpoint:'plants'},{window_end:'2026-01-03'},{manifest_sha256:'invalid'}]){
  const f=fixture({badReceipt});await assert.rejects(f.execute,/not confirmed/);
 }
});

// Execute the actual worker routing too. The reference-feed legacy path remains
// separate; the five delta feeds must never reach its direct mirror upserts.
const worker=readFileSync(new URL('../../app/supabase/functions/metrc-sync/index.ts',import.meta.url),'utf8');
const body=worker.slice(worker.indexOf('async function runSpec('),worker.indexOf('Deno.serve('));
const source=`import {verifiedMetrcPull} from ${JSON.stringify(moduleUrl)};
let f:any;let OPEN_RUN:any=null;const PAGE_PAUSE_MS=0,MAX_PAGES=2;
const now=()=>new Date().toISOString(),sleep=async()=>{};
const supa={rpc:(...a:any[])=>f.deps.db.rpc(...a),from:()=>({insert:()=>({select:()=>({single:async()=>({data:{id:1}})})}),update:()=>{const q={eq:()=>q,then:(r:any)=>Promise.resolve(r({error:null}))};return q;}})};
const politeFetch=(url:string)=>f.deps.get(url);const metrcGet=()=>{throw Error('legacy get must not run');};const writeRows=()=>{throw Error('legacy write must not run');};
${body}
export function execute(fixture:any,advance:boolean){f=fixture;return runSpec('https://fixture.invalid','A','',${JSON.stringify({...args.spec,delta:true})},${JSON.stringify(args.window)},undefined,()=>false,20,undefined,advance?${JSON.stringify(args.window)}:undefined);}`;
const {code:runner}=await transform(source,{loader:'ts',format:'esm'});
const {execute}=await import(`data:text/javascript;base64,${Buffer.from(runner).toString('base64')}`);
test('actual worker routes operational and historical delta feeds through verification',async()=>{
 for(const advance of [true,false]){const f=fixture();assert.equal((await execute(f,advance)).complete,true);assert.equal(f.calls[0].p.p_advance_cursor,advance);}
});
