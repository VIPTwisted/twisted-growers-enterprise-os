import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import assert from 'node:assert/strict';
const spec=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/package-precision-schema.json.gz',import.meta.url))));
let db,admin,other,database;
if(process.env.PRECISION_PGLITE_MODULE){
  assert.ok(!process.env.CI,'CI must exercise PostgreSQL 17 and concurrent sessions');
  const {PGlite}=await import(pathToFileURL(process.env.PRECISION_PGLITE_MODULE).href);
  const {pg_trgm}=await import(pathToFileURL(process.env.PRECISION_PGLITE_MODULE.replace(/index\.js$/,'contrib/pg_trgm.js')).href);
  db=new PGlite({extensions:{pg_trgm}});
}else{
  assert.ok(process.env.PRECISION_TEST_PGURL,'PRECISION_TEST_PGURL must name a disposable loopback PostgreSQL service');
  const url=new URL(process.env.PRECISION_TEST_PGURL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Refusing non-loopback fixture database');
  admin=new pg.Client({connectionString:url.href});await admin.connect();
  const version=(await admin.query('show server_version_num')).rows[0].server_version_num;
  assert.equal(Math.floor(Number(version)/10000),17,'Native fixture must use production major version 17');
  database='quantity_fixture_'+randomUUID().replaceAll('-','');await admin.query('create database '+database);url.pathname='/'+database;
  const client=new pg.Client({connectionString:url.href});await client.connect();
  other=new pg.Client({connectionString:url.href});await other.connect();
  db={exec:s=>client.query(s),query:s=>client.query(s),close:()=>client.end()};
}
let phase='setup';let position=0;
const results=[];
const exec=sql=>db.exec(sql);
const one=async sql=>(await db.query(sql)).rows;
const timed=async(name,fn)=>{const started=Date.now();await fn();results.push({name,pass:true,elapsed_ms:Date.now()-started});console.log(name+' passed');};
async function iterate(items){
  let pending=[...items];
  while(pending.length){
    let next=[],errors=[];
    for(const item of pending){try{await exec(item.sql);}catch(e){next.push(item);errors.push({name:item.name,error:e.message});}}
    if(next.length===pending.length){throw Error('Unresolved schema definitions '+JSON.stringify(errors));}
    pending=next;
  }
}
try{
  await exec('create extension pg_trgm');
  await timed('Reconstruct full captured view/function contracts in disposable database',async()=>{
    for(position=0;position<spec.setup.length;position++)await exec(spec.setup[position]);
    phase='functions and matviews';
    await iterate([...spec.functions.map((sql,i)=>({name:'function_'+i,sql})),...spec.matviews]);
    phase='real view definitions';
    for(const v of spec.views){position=v.name;await exec(v.sql);}
    phase='cycle bootstrap';
    for(const s of spec.bootstrap)await exec(s);
    phase='populate fixture';
    await iterate(spec.matviews.map(v=>({name:v.name,sql:'refresh materialized view public."'+v.name+'";'})));
    await exec(spec.restore_cert);
    for(const s of spec.cleanup_bootstrap)await exec(s);
    phase='original security metadata';
    for(position=0;position<spec.metadata.length;position++)await exec(spec.metadata[position]);
  });
  const targetNames=spec.relations.filter(r=>r.kind!=='r').map(r=>"'"+r.name+"'").join(',');
  const snapshot=async()=>one(`select c.relname,c.relkind,pg_get_userbyid(c.relowner) owner,c.reloptions,c.relacl::text,c.relispopulated,pg_get_viewdef(c.oid,true) definition,
    (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attacl::text,col_description(c.oid,a.attnum),pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns,
    (select jsonb_agg(jsonb_build_array(ci.relname,pg_get_indexdef(i.indexrelid),obj_description(ci.oid,'pg_class'),i.indisclustered,i.indisvalid,i.indisready,ci.reloptions,pg_get_userbyid(ci.relowner)) order by ci.relname) from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid) indexes,
    obj_description(c.oid,'pg_class') comment from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${targetNames}) order by c.relname`);
  const functionSnapshot=()=>one("select pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl::text,p.proconfig,p.prosecdef,p.proleakproof,p.provolatile,p.proparallel,p.proisstrict,p.procost,p.prorows,obj_description(p.oid,'pg_proc') comment from pg_proc p where p.oid='public.f_drill_stays(text,date,date)'::regprocedure");
  phase='synthetic source fixture';
  await exec(`alter table metrc_packages enable row level security;
    create policy precision_fixture_reader on metrc_packages for select to tg_desktop_reader using (true);
    grant select on metrc_packages to tg_desktop_reader;
    insert into public.metrc_packages(id,license,tag,item_name,quantity,uom,location,packaged_on,lab_testing_state,finished,raw,synced_at,source_state,provenance)
    select i,'fixture-license','fixture-tag-'||i,'Synthetic source item',q,'g','Fixture room','2026-09-01','NotSubmitted',false,
    jsonb_build_object('Quantity',q,'Id',i,'SourcePackageLabels','','SourceHarvestNames',''),now(),'active','synthetic test'
    from (values (1,123.4567::numeric),(2,2.3456),(3,3.4567),(4,4.5678),(5,5.6789),(6,6.7891)) f(i,q);`);
  // Keep the pre-repair matview snapshot consistent with its synthetic base row.
  await iterate(spec.matviews.map(v=>({name:v.name,sql:'refresh materialized view public."'+v.name+'";'})));
  const before=await snapshot();
  const functionBefore=await functionSnapshot();
  assert.equal((await one("select count(*)::int n from metrc_packages where quantity is distinct from (raw->>'Quantity')::numeric"))[0].n,6);
  const baseSnapshot=()=>one("select c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,(select jsonb_agg(jsonb_build_array(polname,polcmd,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) order by polname) from pg_policy where polrelid=c.oid) policies from pg_class c where c.oid='public.metrc_packages'::regclass");
  const baseBefore=await baseSnapshot();
  if(other)await timed('An active reader prevents structural change and the lock timeout preserves the original graph',async()=>{
    await other.query('begin; select quantity from public.metrc_packages limit 1;');
    try{
      await assert.rejects(async()=>{for(const sql of spec.upgrade)await exec(sql);},/lock timeout/);
      await exec('rollback');assert.deepEqual(await snapshot(),before);
    }finally{await other.query('rollback');}
  });
  await timed('An uncaptured dependent blocks RESTRICT and preserves all original objects',async()=>{
    await exec('create view public.precision_fixture_untracked as select * from public.v_stock_on_hand;');
    try{
      await assert.rejects(async()=>{for(const sql of spec.upgrade)await exec(sql);},/other objects depend/);
      await exec('rollback');assert.deepEqual(await snapshot(),before);
      assert.notEqual((await one("select to_regclass('public.precision_fixture_untracked') as v"))[0].v,null);
    }finally{await exec('drop view public.precision_fixture_untracked restrict;');}
  });
  phase='injected failure';
  await timed('Full graph rolls back after widening and injected failure',async()=>{
    for(position=0;position<spec.upgrade.length;position++)await exec(spec.upgrade[position]);
    await assert.rejects(()=>exec('select 1/0'),/division by zero/);
    await exec('rollback');
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual(await functionSnapshot(),functionBefore);
    assert.equal((await one('select quantity::text from metrc_packages where id=1'))[0].quantity,'123.457');
    assert.deepEqual(await baseSnapshot(),baseBefore);
    assert.equal((await one("select to_regnamespace('tg_precision_fixture_bootstrap') as ns"))[0].ns,null);
  });
  phase='successful widening';
  await timed('Full graph widens and restores its exact definitions and access metadata',async()=>{
    for(position=0;position<spec.upgrade.length;position++)await exec(spec.upgrade[position]);
    const after=await snapshot();
    assert.equal(after.length,204);
    for(let i=0;i<before.length;i++){
      const a=structuredClone(after[i]),b=structuredClone(before[i]);
      for(const c of b.columns)if(c[1]==='numeric(14,3)')c[1]='numeric';
      assert.deepEqual(a,b,b.relname);
    }
    assert.equal((await one('select quantity::text from metrc_packages where id=1'))[0].quantity,'123.4567');
    assert.equal((await one("select count(*)::int n from metrc_packages where quantity is distinct from (raw->>'Quantity')::numeric"))[0].n,0);
    assert.deepEqual(await baseSnapshot(),baseBefore);
    assert.equal((await one("select count(*)::int as n from pg_class where relkind='m' and not relispopulated"))[0].n,0);
    assert.deepEqual(await functionSnapshot(),functionBefore);
    assert.equal((await one("select to_regnamespace('tg_precision_fixture_bootstrap') as ns"))[0].ns,null);
    await exec('commit');
  });
  await timed('Lossless recovery rejects narrowing the repaired quantity',async()=>{
    assert.equal((await one('select count(*)::int n from metrc_packages where quantity is distinct from quantity::numeric(14,3)'))[0].n,6);
  });
  const output={status:'fixture_passed_not_production_certification',server:(await one('select version()'))[0].version,results,scope:spec.source};
  if(process.env.PRECISION_RESULTS_FILE)writeFileSync(process.env.PRECISION_RESULTS_FILE,JSON.stringify(output,null,2));
  console.log(JSON.stringify(output));
}catch(e){
  const output={status:'failed',phase,position,error:e.message,detail:e.detail,results};
  if(process.env.PRECISION_RESULTS_FILE)writeFileSync(process.env.PRECISION_RESULTS_FILE,JSON.stringify(output,null,2));console.error(JSON.stringify(output));process.exitCode=1;
}finally{if(other)await other.end();await db.close();if(admin){try{await admin.query('drop database '+database);}finally{await admin.end();}}}
