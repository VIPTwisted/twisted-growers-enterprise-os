import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { GptAppClient } from './gpt-app-client.mjs';

function fixture(t, accountType = 'chatgpt', timeoutMs = 1000, approveMcp = null) {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  let respond = true;
  input.on('data', chunk => {
    const message = JSON.parse(chunk.toString());
    messages.push(message);
    if (!respond || !message.method || message.id === undefined) return;
    let result = {};
    if (message.method === 'account/read') result = { account: { type: accountType } };
    if (message.method.startsWith('thread/')) result = {
      modelProvider: 'openai', thread: { id: message.params.threadId || 'thread-1', modelProvider: 'openai' },
    };
    if (message.method === 'turn/start') result = { turn: { id: 'turn-1', status: 'inProgress' } };
    queueMicrotask(() => output.write(JSON.stringify({ id: message.id, result }) + '\n'));
  });
  const client = new GptAppClient({ input, output, timeoutMs, approveMcp });
  t.after(() => { client.close(); input.destroy(); output.destroy(); });
  return { client, output, messages, stopResponses: () => { respond = false; } };
}

test('subscription handshake, resume, and streaming do not report completion early', async t => {
  const { client, messages, output } = fixture(t);
  assert.deepEqual(await client.initialize(), { authentication: 'chatgpt' });
  assert.deepEqual(messages.slice(0, 3).map(m => m.method), ['initialize', 'initialized', 'account/read']);
  const thread = await client.openThread({ cwd: '/test' });
  assert.equal(await client.openThread({ threadId: thread }), thread);
  assert.equal(messages.find(m => m.method === 'thread/start').params.sandbox, 'read-only');
  assert.equal(messages.find(m => m.method === 'thread/start').params.approvalPolicy, 'on-request');
  assert.equal(messages.find(m => m.method === 'thread/start').params.allowProviderModelFallback, false);
  const events = [];
  client.on('notification', event => events.push(event));
  const accepted = await client.startTurn(thread, 'hello', 'gpt-6-astra');
  assert.equal(accepted.turn.status, 'inProgress');
  assert.equal(messages.find(m => m.method === 'turn/start').params.model, 'gpt-6-astra');
  const delta = { method: 'item/agentMessage/delta', params: { threadId: thread, turnId: 'turn-1', delta: 'Hello' } };
  output.write(JSON.stringify(delta) + '\n');
  assert.deepEqual(events, [delta]);
  assert.equal(events.some(e => e.method === 'turn/completed'), false);
});

test('completion is tied to the exact thread and turn and returns the persisted final message', async t => {
  const { client, output } = fixture(t);
  await client.initialize();
  const thread = await client.openThread({ cwd: '/test' });
  const waiting = client.runTurn(thread, 'hello');
  await new Promise(resolve => setImmediate(resolve));
  output.write(JSON.stringify({ method: 'item/agentMessage/delta', params: {
    threadId: thread, turnId: 'turn-1', itemId: 'a-1', delta: 'Hel',
  } }) + '\n');
  output.write(JSON.stringify({ method: 'item/completed', params: {
    threadId: thread, turnId: 'turn-1', completedAtMs: Date.now(),
    item: { id: 'a-1', type: 'agentMessage', text: 'Hello from Top G' },
  } }) + '\n');
  output.write(JSON.stringify({ method: 'turn/completed', params: {
    threadId: thread, turn: { id: 'turn-1', status: 'completed', items: [] },
  } }) + '\n');
  assert.deepEqual(await waiting, {
    threadId: thread, turnId: 'turn-1', status: 'completed', reply: 'Hello from Top G',
  });
  assert.equal(client.turnState.has('turn-1'), false);
});

test('interrupt uses the installed turn/interrupt contract', async t => {
  const { client, messages } = fixture(t);
  await client.initialize();
  const thread = await client.openThread();
  await client.interruptTurn(thread, 'turn-1');
  const message = messages.find(m => m.method === 'turn/interrupt');
  assert.deepEqual(message.params, { threadId: thread, turnId: 'turn-1' });
});

for (const type of ['apiKey', null, 'amazonBedrock']) {
  test(`refuses ${type} authentication without starting a thread`, async t => {
    const { client, messages } = fixture(t, type);
    await assert.rejects(client.initialize(), /API authentication is not allowed/);
    assert.equal(client.closed, true);
    assert.equal(messages.some(m => m.method === 'thread/start'), false);
  });
}

test('auth changes close the connection', async t => {
  const { client, output } = fixture(t);
  await client.initialize();
  output.write(JSON.stringify({ method: 'account/updated', params: { authMode: 'apikey' } }) + '\n');
  assert.equal(client.closed, true);
  await assert.rejects(client.openThread(), /not verified/);
});

test('unhandled approval requests receive explicit errors', async t => {
  const { client, output, messages } = fixture(t);
  await client.initialize();
  output.write(JSON.stringify({ id: 91, method: 'item/commandExecution/requestApproval', params: {} }) + '\n');
  assert.equal(messages.at(-1).id, 91);
  assert.equal(messages.at(-1).error.code, -32601);
});

test('only an explicitly allowlisted MCP elicitation is accepted', async t => {
  const approveMcp = params =>
    params.serverName === 'twisted-growers' && params?._meta?.tool_params?.sql === 'select 1';
  const { client, output, messages } = fixture(t, 'chatgpt', 1000, approveMcp);
  await client.initialize();
  output.write(JSON.stringify({
    id: 77,
    method: 'mcpServer/elicitation/request',
    params: { serverName: 'twisted-growers', _meta: { tool_params: { sql: 'select 1' } } },
  }) + '\n');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(messages.at(-1), { id: 77, result: { action: 'accept', content: {} } });
});

test('timeout rejects pending calls and does not retry', async t => {
  const { client, messages, stopResponses } = fixture(t, 'chatgpt', 10);
  await client.initialize();
  stopResponses();
  await assert.rejects(client.openThread(), /outcome unknown/);
  assert.equal(messages.filter(m => m.method === 'thread/start').length, 1);
  assert.equal(client.closed, true);
});

test('malformed protocol and unknown threads fail closed', async t => {
  const { client, output } = fixture(t);
  await client.initialize();
  await assert.rejects(client.startTurn('other', 'hello'), /Unknown GPT thread/);
  output.write('not json\n');
  assert.equal(client.closed, true);
});
