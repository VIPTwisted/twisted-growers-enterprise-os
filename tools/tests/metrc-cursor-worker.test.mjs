import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { transform } from '../../app/web/node_modules/esbuild/lib/main.js';
const {code}=await transform(readFileSync(new URL('../../app/supabase/functions/metrc-sync/cursor.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'});
const {readMetrcCursors,finishMetrcCursor,deltaCursorWindow}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const args={p_run_id:1,p_endpoint:'packages',p_license:'A',p_window_start:'2026-01-01T00:00:00Z',p_window_end:'2026-01-02T00:00:00Z',p_records:3};
const receipt={kind:'metrc_cursor_commit_v1',run_id:1,cursor_key:'A:packages',window_start:args.p_window_start,window_end:args.p_window_end,cursor_after:args.p_window_end,records:3,committed_at:'2026-01-03T00:00:00Z',outcome:'advanced'};
const db=(value,rpc=async()=>({data:receipt,error:null}))=>({rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>value})})})});
test('missing operational coverage fails before starting an unresumable history sweep',()=>{
 assert.throws(()=>deltaCursorWindow({},'A:packages',args.p_window_end),/verified historical bootstrap is required/);
 for(const start of ['bad','2027-01-01T00:00:00Z'])assert.throws(()=>deltaCursorWindow({'A:packages':start},'A:packages',args.p_window_end),/Invalid/);
 assert.deepEqual(deltaCursorWindow({'A:packages':args.p_window_start},'A:packages',args.p_window_end),{start:args.p_window_start,end:args.p_window_end});
});
test('cursor reads refuse database errors and malformed coverage',async()=>{
 await assert.rejects(()=>readMetrcCursors(db({error:{message:'unavailable'}})),/Cannot read/);
 for(const value of [null,[],{'A:packages':'bad'},{'A:packages':null}])await assert.rejects(()=>readMetrcCursors(db({data:{value}})),/invalid/);
 assert.deepEqual(await readMetrcCursors(db({data:null})),{});
 assert.deepEqual(await readMetrcCursors(db({data:{value:{'A:packages':args.p_window_start}}})),{'A:packages':args.p_window_start});
});
test('only a matching completion receipt confirms the cursor write',async()=>{
 await finishMetrcCursor(db(null,async(name,got)=>{assert.equal(name,'tg_metrc_finish_cursor');assert.deepEqual(got,args);return {data:receipt};}),args);
 for(const patch of [{run_id:2},{cursor_key:'B:packages'},{records:4},{cursor_after:args.p_window_start},{window_end:args.p_window_start},{committed_at:null},{outcome:'ok'}]){
  await assert.rejects(()=>finishMetrcCursor(db({data:null},async()=>({data:{...receipt,...patch}})),args),/not confirmed/);
 }
});
test('lost HTTP acknowledgment resolves only through the exact persisted run receipt',async()=>{
 const saved={status:'ok',records:3,error:null,note:JSON.stringify(receipt),finished_at:receipt.committed_at};
 const failure=async()=>{throw new Error('connection lost');};
 await finishMetrcCursor(db({data:saved},failure),args);
 for(const patch of [{status:'running'},{records:0},{error:'failed'},{finished_at:null},{note:'bad'}])await assert.rejects(()=>finishMetrcCursor(db({data:{...saved,...patch}},failure),args),/not confirmed/);
 await assert.rejects(()=>finishMetrcCursor(db({error:{message:'cannot read'}},failure),args),/connection lost/);
});

// Operational and historical runSpec routing is exercised in metrc-verified-pull.test.mjs.
