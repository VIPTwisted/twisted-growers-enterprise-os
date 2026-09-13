import test from 'node:test';
import assert from 'node:assert/strict';
import { readPermissionMatrix, savePermissionMatrix } from '../../app/web/src/lib/permission-matrix.js';
const page = {view_key:'settings',menu:true,can_view:true,can_edit:false,can_approve:false,can_export:false,can_delete:false};
const snapshot = () => ({role:'staff',revision:'a'.repeat(32),nav:[],roles:[],permissions:[{role:'staff',...page}],visibility:[{role:'staff',view_key:'settings',visible:true}],saved_count:1});
test('permission save uses one RPC and checks both returned tables',async()=>{
  const calls=[];const client={rpc:async(...args)=>{calls.push(args);return {data:snapshot()};}};
  await savePermissionMatrix(client,'staff','b'.repeat(32),[page]);
  assert.equal(calls.length,1);assert.equal(calls[0][0],'f_save_permission_matrix');
  assert.equal(calls[0][1].p_revision,'b'.repeat(32));
});
test('partial or mismatched permission receipts are never reported as saved',async()=>{
  for(const patch of [{saved_count:0},{permissions:[]},{visibility:[]},{role:'owner'},{revision:''},{visibility:[{role:'staff',view_key:'settings',visible:false}]}]){
    await assert.rejects(savePermissionMatrix({rpc:async()=>({data:{...snapshot(),...patch}})},'staff','b'.repeat(32),[page]));
  }
});
test('permission read and save expose server refusal',async()=>{
  const client={rpc:async()=>({error:new Error('stale revision')})};
  await assert.rejects(readPermissionMatrix(client,'staff'),/stale revision/);
  await assert.rejects(savePermissionMatrix(client,'staff','b'.repeat(32),[page]),/stale revision/);
});
test('permission reads validate role and complete snapshot',async()=>{
  assert.equal((await readPermissionMatrix({rpc:async()=>({data:snapshot()})},'staff')).role,'staff');
  await assert.rejects(readPermissionMatrix({rpc:async()=>({data:null})},'staff'),/incomplete/);
});
