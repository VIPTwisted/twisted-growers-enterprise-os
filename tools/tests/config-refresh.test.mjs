import test from 'node:test';
import assert from 'node:assert/strict';
import { watchConfiguration } from '../../app/web/src/lib/config-refresh.js';
test('configuration refresh subscribes only to config and recovers missed events with cleanup',()=>{
  const handlers=[];const listeners=new Map();const timeouts=new Map();let next=0;let tick;let refreshed=0;let removed=false;
  const host={setTimeout:f=>{timeouts.set(++next,f);return next;},clearTimeout:id=>timeouts.delete(id),setInterval:f=>{tick=f;return 9;},clearInterval:id=>assert.equal(id,9),addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
  const channel={on:(type,filter,fn)=>{handlers.push({type,filter,fn});return channel;},subscribe:fn=>fn('SUBSCRIBED')};
  const client={channel:()=>channel,removeChannel:c=>{assert.equal(c,channel);removed=true;}};
  const stop=watchConfiguration(client,'user-1',()=>refreshed++,host);
  assert.deepEqual(handlers.map(h=>h.filter.table),['nav_registry','nav_role_visibility','page_permissions','app_users']);
  assert.equal(handlers[3].filter.filter,'user_id=eq.user-1');
  handlers[0].fn();handlers[1].fn();assert.equal(timeouts.size,1);
  [...timeouts.values()][0]();assert.equal(refreshed,1);
  tick();listeners.get('focus')();listeners.get('online')();assert.equal(timeouts.size,1);
  const late=handlers[0].fn;stop();late();assert.equal(timeouts.size,0);assert.equal(listeners.size,0);assert.equal(removed,true);
});
