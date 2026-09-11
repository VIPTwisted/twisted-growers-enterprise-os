import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import pg from 'pg';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=read('../repairs/gpt-metrc-record-verification.sql');
const states={packages:['active','onhold','inactive','intransit'],plants:['vegetative','flowering','onhold','inactive'],harvests:['active','onhold','inactive'],plantbatches:['active','inactive'],transfers:['incoming','outgoing','rejected']};
const sha=s=>createHash('sha256').update(s).digest('hex');
test('Metrc source records: admission, evidence, concurrency and recovery',async t=>{
 let admin,client,other,database,embedded;
 if(process.env.METRC_RECORD_PGLITE){
  assert.ok(!process.env.CI);const {PGlite}=await import(pathToFileURL(process.env.METRC_RECORD_PGLITE).href);embedded=new PGlite();
  client={query:(s,p)=>p?embedded.query(s,p):embedded.exec(s).then(r=>r.at(-1))};
 }else{
  assert.ok(process.env.METRC_TEST_PGURL);const url=new URL(process.env.METRC_TEST_PGURL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Fixtures must never run in production');
  admin=new pg.Client({connectionString:url.href});await admin.connect();database='metrc_records_'+randomUUID().replaceAll('-','');
  await admin.query(`create database ${database}`);url.pathname='/'+database;
  client=new pg.Client({connectionString:url.href});other=new pg.Client({connectionString:url.href});await client.connect();await other.connect();
 }
 try{
  for(const role of ['anon','authenticated','service_role'])await client.query(`do $$ begin create role ${role}; exception when duplicate_object then null; end $$;`);
  await client.query(`create table configurations(key text primary key,value jsonb not null,updated_at timestamptz default now());
   create table metrc_sync_runs(id bigserial primary key,endpoint text,license text,started_at timestamptz default now(),finished_at timestamptz,status text default 'running',records integer default 0,error text,note text);
   ${read('./fixtures/metrc-mirror-schema.sql')}
   grant usage on schema public to service_role,anon,authenticated;
   grant select,insert,update on all tables in schema public to service_role;
   grant usage,select on all sequences in schema public to service_role;`);
  await client.query(read('../repairs/gpt-metrc-atomic-cursor.sql'));await client.query(sql);await client.query(read('../repairs/gpt-metrc-pagination-size.sql'));
  const q=(s,p)=>client.query(s,p).then(r=>r.rows);
  const reset=async()=>client.query(`reset role;truncate metrc_record_verification,metrc_sync_page_receipt,metrc_sync_verification,metrc_sync_runs,metrc_packages,metrc_plants,metrc_harvests,metrc_plant_batches,metrc_transfers,configurations restart identity;
   insert into configurations(key,value) values('metrc_sync_cursors','{"A:packages":"2026-01-01T00:00:00Z","A:plants":"2026-01-01T00:00:00Z","A:harvests":"2026-01-01T00:00:00Z","A:plantbatches":"2026-01-01T00:00:00Z","A:transfers":"2026-01-01T00:00:00Z","other":"keep"}');`);
  const newRun=async(e='packages')=>(await q('insert into metrc_sync_runs(endpoint,license) values($1,$2) returning id',[e+' (delta)','A']))[0].id;
  const begin=(id,e='packages',advance=true,c=client)=>c.query('select tg_metrc_begin_verification($1,$2,$3,$4,$5,$6,$7) result',[id,e,'A','2026-01-01','2026-01-02',20,advance]).then(r=>r.rows[0].result);
  const stage=(id,state,body='[]',page=1,e='packages',patch={})=>{
   const text=typeof body==='string'?body:JSON.stringify(body);
   return q('select tg_metrc_stage_page($1,$2,$3,$4,$5,$6,$7) result',[id,state,page,`/${e}/v2/${state}`,{licenseNumber:'A',pageNumber:page,pageSize:20,lastModifiedStart:'2026-01-01',lastModifiedEnd:'2026-01-02',...patch},text,sha(text)]).then(r=>r[0].result);
  };
  const finish=(id,complete=true,error=null,c=client)=>c.query('select tg_metrc_finish_verification($1,$2,$3) result',[id,complete,error]).then(r=>r.rows[0].result);
  const check=id=>q('select tg_metrc_check_record_receipt($1) result',[id]).then(r=>r[0].result);
  const complete=async(id,e='packages',raw={Id:1,Label:'T1',Quantity:1.125})=>{for(const s of states[e])await stage(id,s,s===states[e][0]?[raw]:[],1,e);};
  const count=async table=>(await q(`select count(*)::int n from ${table}`))[0].n;
  const cursor=async()=>(await q("select value from configurations where key='metrc_sync_cursors'"))[0].value;

  await t.test('all five existing mappings preserve source identity, fields and before/after evidence',async()=>{
   for(const e of Object.keys(states)){
    await reset();const id=await newRun(e);await client.query('set role service_role');await begin(id,e);
    await complete(id,e,{Id:9001,Label:'TAG',Name:'BATCH',Quantity:1.125,UnitOfMeasureName:'Grams',TotalWetWeight:10.123,TotalWasteWeight:1,PackageCount:2,UntrackedCount:3,ManifestNumber:'MANIFEST',RecipientFacilityName:'Receiver',PlantedDate:'2026-01-01T01:00:00Z'});
    assert.equal(await count('metrc_record_verification'),0,'staging does not certify');
    const receipt=await finish(id);assert.equal(receipt.records,1);assert.equal(receipt.state,'api_verified');
    assert.equal((await check(id)).current_match,true);assert.equal((await cursor()).other,'keep');
    const row=(await q('select mirror_before,mirror_after,source_id from metrc_record_verification'))[0];assert.equal(row.mirror_before,null);assert.equal(row.source_id,'9001');assert.ok(row.mirror_after.id);
   }
  });
  await t.test('exact response text and large numeric IDs survive without JavaScript round trips',async()=>{
   await reset();const id=await newRun();await begin(id);await stage(id,'active','[ { "Id": 9007199254740993, "Label": "BIG", "Quantity": 1.125, "UnknownDecimal":0.123456789012345678901 } ]');
   for(const s of states.packages.slice(1))await stage(id,s);await finish(id);
   const r=(await q("select source_id,source_raw->>'UnknownDecimal' decimal,source_sha256=encode(sha256(convert_to(source_raw::text,'UTF8')),'hex') valid from metrc_record_verification"))[0];
   assert.equal(r.source_id,'9007199254740993');assert.equal(r.decimal,'0.123456789012345678901');assert.equal(r.valid,true);
  });
  await t.test('missing lifecycle pages and partial pulls cannot change live rows or cursors',async()=>{
   await reset();const id=await newRun(),before=await cursor();await begin(id);await stage(id,'active',[{Id:1,Label:'T1'}]);
   await assert.rejects(()=>finish(id),/coverage is incomplete/);assert.equal(await count('metrc_packages'),0);assert.deepEqual(await cursor(),before);
   await finish(id,false,'fixture incomplete');assert.equal(await count('metrc_sync_page_receipt'),1);assert.equal((await check(id)).current_match,false);
  });
  await t.test('missing arrays, invalid identities, wrong coverage and page gaps fail closed',async()=>{
   for(const kind of ['array','id','tag','coverage','gap']){
    await reset();const id=await newRun();await begin(id);
    const run=()=>kind==='array'?stage(id,'active','{}'):kind==='id'?stage(id,'active',[{Label:'T'}]):kind==='tag'?stage(id,'active',[{Id:1}]):kind==='coverage'?stage(id,'active',[],1,'packages',{lastModifiedEnd:'2026-01-03'}):stage(id,'active',[],2);
    await assert.rejects(run);assert.equal(await count('metrc_sync_page_receipt'),0);assert.equal(await count('metrc_packages'),0);
   }
  });
  await t.test('source page counts reconcile and changing totals are refused',async()=>{
   await reset();const id=await newRun();await begin(id);
   await assert.rejects(()=>stage(id,'active',{Data:[],Total:1,TotalRecords:1,Page:1,CurrentPage:1,PageSize:20,RecordsOnPage:0,TotalPages:1}),/total does not reconcile/);
   await assert.rejects(()=>stage(id,'active',{Data:[],Page:2}),/metadata mismatch/);
   await assert.rejects(()=>stage(id,'active',{Data:[],PageSize:7}),/metadata mismatch/);
   const raw=Array.from({length:20},(_,i)=>({Id:i+1,Label:'T'+i}));
   assert.equal((await stage(id,'active',{Data:raw,Total:21,TotalPages:2,Page:1,PageSize:20})).terminal,false);
   await assert.rejects(()=>stage(id,'active',{Data:[{Id:21,Label:'T21'}],Total:22,TotalPages:2,Page:2},2),/changed during pull/);
   await stage(id,'active',{Data:[{Id:21,Label:'T21'}],Total:21,TotalPages:2,Page:2,PageSize:1},2);
   for(const s of states.packages.slice(1))await stage(id,s,{Data:[],Total:0,TotalRecords:0,TotalPages:0,Page:1,CurrentPage:1,PageSize:0,RecordsOnPage:0});assert.equal((await finish(id)).records,21);
  });
  await t.test('identical page retry is idempotent and altered replay is rejected',async()=>{
   await reset();const id=await newRun();await begin(id);const body=[{Id:1,Label:'T'}];const a=await stage(id,'active',body);
   assert.deepEqual(await stage(id,'active',body),a);await assert.rejects(()=>stage(id,'active',[{Id:2,Label:'T'}]),/replay changed/);assert.equal(await count('metrc_sync_page_receipt'),1);
  });
  await t.test('duplicate identities across states roll back the entire promotion',async()=>{
   await reset();const id=await newRun();await begin(id);for(const s of states.packages)await stage(id,s,[{Id:1,Label:'T'}]);
   await assert.rejects(()=>finish(id),/duplicate key/);assert.equal(await count('metrc_packages'),0);assert.equal(await count('metrc_record_verification'),0);
  });
  await t.test('nonrepresentable numeric values are held without rounding or cursor advancement',async()=>{
   await reset();const id=await newRun(),before=await cursor();await begin(id);await complete(id,'packages',{Id:1,Label:'T',Quantity:1.1234});
   await assert.rejects(()=>finish(id),/loses information/);assert.equal(await count('metrc_packages'),0);assert.deepEqual(await cursor(),before);
  });
  await t.test('cursor commit failure rolls back mirror writes and per-record certification',async()=>{
   await reset();const id=await newRun();await begin(id);await complete(id);
   await client.query("update configurations set value=jsonb_set(value,'{A:packages}','\"bad\"') where key='metrc_sync_cursors'");
   await assert.rejects(()=>finish(id));assert.equal(await count('metrc_packages'),0);assert.equal(await count('metrc_record_verification'),0);assert.equal(await count('metrc_sync_page_receipt'),4);
  });
  await t.test('later valid data is protected and an old receipt cannot certify a changed row',async()=>{
   await reset();const id=await newRun();await begin(id);await complete(id);await finish(id);
   await client.query("update metrc_packages set raw=raw||'{\"Quantity\":9}',quantity=9 where tag='T1'");
   const c=await check(id);assert.equal(c.current_match,false);assert.equal(c.raw_changed,1);assert.equal(c.mapped_changed,1);
   const next=await newRun();await begin(next);await complete(next);
   await client.query("update metrc_packages set raw=raw||'{\"Quantity\":10}',quantity=10,synced_at=clock_timestamp() where tag='T1'");
   await assert.rejects(()=>finish(next),/changed after verification began/);assert.equal((await q("select quantity::text n from metrc_packages"))[0].n,'10.000');
  });
  await t.test('source ID follows a tag change in receipts without destroying the former tag',async()=>{
   await reset();const id=await newRun();await begin(id);await complete(id);await finish(id);
   const next=await newRun();await begin(next);await complete(next,'packages',{Id:1,Label:'T2',Quantity:2});await finish(next);
   assert.equal(await count('metrc_packages'),2);assert.equal((await q("select count(distinct mirror_key)::int n from metrc_record_verification where source_id='1'"))[0].n,2);
  });
  await t.test('lost acknowledgment returns the original commit and cannot be demoted by cleanup',async()=>{
   await reset();const id=await newRun();await begin(id);await complete(id);const r=await finish(id);
   assert.deepEqual(await finish(id),r);await assert.rejects(()=>finish(id,false,'late failure'),/different outcome/);assert.equal((await check(id)).current_match,true);
  });
  await t.test('historical window verification does not advance the operational cursor',async()=>{
   await reset();const id=await newRun(),before=await cursor();await begin(id,'packages',false);await complete(id);const r=await finish(id);assert.equal(r.cursor,null);assert.deepEqual(await cursor(),before);
  });
  await t.test('empty complete delivery proves no current record population',async()=>{
   await reset();const id=await newRun();await begin(id);for(const s of states.packages)await stage(id,s);await finish(id);assert.equal((await check(id)).current_match,false);
  });
  await t.test('one writer wins a simultaneous feed lease', {skip:!other},async()=>{
   await reset();const a=await newRun(),b=await newRun();const results=await Promise.allSettled([begin(a),begin(b,'packages',true,other)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  });
  await t.test('a second feed is independent of the first feed lease',async()=>{
   await reset();const a=await newRun(),b=await newRun('plants');await begin(a);await begin(b,'plants');
   assert.equal(await count('metrc_sync_verification'),2);
  });
  await t.test('browser roles cannot read source evidence or invoke verification APIs',async()=>{
   await reset();const id=await newRun();
   for(const role of ['anon','authenticated']){await client.query('set role '+role);await assert.rejects(()=>begin(id),/permission denied/);await assert.rejects(()=>count('metrc_sync_page_receipt'),/permission denied/);await client.query('reset role');}
  });
  await t.test('evidence is immutable and reverting worker use preserves old and new valid rows',async()=>{
   await reset();const id=await newRun();await begin(id);await complete(id);await finish(id);
   for(const table of ['metrc_sync_page_receipt','metrc_record_verification','metrc_sync_verification'])await assert.rejects(()=>client.query(`delete from ${table}`),/immutable/);
   await client.query("insert into metrc_packages(license,tag,raw) values('A','NEW','{\"Id\":2,\"Label\":\"NEW\"}')");
   const before=await cursor();await client.query('revoke execute on function tg_metrc_begin_verification(bigint,text,text,timestamptz,timestamptz,integer,boolean) from service_role');
   assert.equal(await count('metrc_packages'),2);assert.deepEqual(await cursor(),before);assert.equal((await check(id)).current_match,true);
  });
 }finally{if(embedded)await embedded.close();else{await other?.end();await client?.end();if(database)await admin.query(`drop database ${database} with(force)`);await admin?.end();}}
});
