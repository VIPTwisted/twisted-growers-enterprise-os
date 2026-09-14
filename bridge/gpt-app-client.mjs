import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

// Local stdio adapter only. No HTTP listener, database access, provider fallback,
// process launch, or credential handling. The desktop host owns those boundaries.
export class GptAppClient extends EventEmitter {
  constructor({ input, output, timeoutMs = 30000, approveMcp = null }) {
    super();
    this.input = input;
    this.pending = new Map();
    this.nextId = 0;
    this.timeoutMs = timeoutMs;
    this.approveMcp = approveMcp;
    this.closed = false;
    this.started = false;
    this.ready = false;
    this.threads = new Set();
    this.turnState = new Map();
    this.lines = createInterface({ input: output });
    this.lines.on('line', line => this.receive(line));
    this.lines.on('close', () => this.close());
    input.on('error', () => this.close());
    output.on('error', () => this.close());
  }

  send(message) {
    if (this.closed) throw new Error('GPT connection is closed');
    this.input.write(JSON.stringify(message) + '\n');
  }

  request(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('GPT connection is closed'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A timed-out mutation may still have executed. Never retry it blindly.
        this.close(new Error(`GPT ${method} timed out; outcome unknown`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch (error) { this.close(error); }
    });
  }

  receive(line) {
    let message;
    try { message = JSON.parse(line); }
    catch { this.close(new Error('Invalid GPT protocol message')); return; }
    if (!message || typeof message !== 'object') {
      this.close(new Error('Invalid GPT protocol message')); return;
    }
    if (message.method && message.id !== undefined) {
      if (message.method === 'mcpServer/elicitation/request' &&
          this.approveMcp?.(message.params || {}) === true) {
        this.send({ id: message.id, result: { action: 'accept', content: {} } });
        this.emit('mcpApproved', { method: message.method, params: message.params || {} });
        return;
      }
      // Probe adapter cannot grant tool approvals. Fail explicitly rather than
      // auto-approving or leaving the server waiting forever.
      this.send({ id: message.id, error: { code: -32601,
        message: 'Interactive approvals are not connected in this probe' } });
      this.emit('approvalUnavailable', { method: message.method, params: message.params || {} });
      return;
    }
    if (message.method) {
      if (message.method === 'account/updated' && message.params?.authMode !== 'chatgpt') {
        this.close(new Error('GPT subscription authentication changed')); return;
      }
      const p = message.params || {};
      const turnId = p.turnId || p.turn?.id;
      if (turnId) {
        const state = this.turnState.get(turnId) || { reply: '', completed: null };
        if (message.method === 'item/agentMessage/delta' && typeof p.delta === 'string') {
          state.reply += p.delta;
        }
        if (message.method === 'item/completed' && p.item?.type === 'agentMessage' && p.item?.text) {
          state.reply = String(p.item.text);
        }
        if (message.method === 'turn/completed') state.completed = message;
        this.turnState.set(turnId, state);
      }
      this.emit('notification', message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(`GPT request failed (${message.error.code})`));
    else if (!Object.hasOwn(message, 'result')) {
      pending.reject(new Error('GPT response has no result'));
    } else pending.resolve(message.result);
  }

  async initialize() {
    if (this.started) throw new Error('GPT initialization already attempted');
    this.started = true;
    try {
      await this.request('initialize', {
        clientInfo: { name: 'tg_os_codex_bridge', title: 'TG OS desktop Codex bridge', version: '3.0.0' },
      });
      this.send({ method: 'initialized', params: {} });
      const account = await this.request('account/read', { refreshToken: false });
      if (account?.account?.type !== 'chatgpt') {
        throw new Error('Sign into Codex with ChatGPT; API authentication is not allowed');
      }
      this.ready = true;
      return { authentication: 'chatgpt' };
    } catch (error) { this.close(error); throw error; }
  }

  async openThread({ threadId, cwd, model } = {}) {
    if (!this.ready) throw new Error('GPT subscription is not verified');
    // Preview is read-only until the host wires owner approvals and tool scope.
    const params = { sandbox: 'read-only', approvalPolicy: 'on-request',
      modelProvider: 'openai', allowProviderModelFallback: false,
      threadSource: 'tg-os', ...(cwd ? { cwd } : {}), ...(model ? { model } : {}) };
    const result = await this.request(threadId ? 'thread/resume' : 'thread/start',
      { ...params, ...(threadId ? { threadId } : {}) });
    const provider = result?.modelProvider || result?.thread?.modelProvider;
    if (!result?.thread?.id || provider !== 'openai' ||
        (threadId && result.thread.id !== threadId)) {
      this.close(new Error('GPT thread identity/provider could not be verified'));
      throw new Error('GPT thread identity/provider could not be verified');
    }
    this.threads.add(result.thread.id);
    return result.thread.id;
  }

  async startTurn(threadId, text, model) {
    if (!this.ready || !this.threads.has(threadId)) throw new Error('Unknown GPT thread');
    if (typeof text !== 'string' || !text.trim()) throw new Error('A message is required');
    // This returns acceptance, NOT completion. Host must observe turn/completed
    // for this thread/turn and independently verify any persisted OS writes.
    return this.request('turn/start', {
      threadId,
      input: [{ type: 'text', text }],
      ...(model ? { model } : {}),
    });
  }

  async waitForTurn(threadId, turnId, timeoutMs = 5 * 60 * 1000) {
    const current = this.turnState.get(turnId);
    if (current?.completed) return this.#completedTurn(threadId, turnId, current);
    return new Promise((resolve, reject) => {
      const finish = (message) => {
        const p = message.params || {};
        if (message.method !== 'turn/completed' || p.threadId !== threadId || p.turn?.id !== turnId) return;
        clearTimeout(timer);
        this.off('notification', finish);
        try { resolve(this.#completedTurn(threadId, turnId, this.turnState.get(turnId))); }
        catch (e) { reject(e); }
      };
      const timer = setTimeout(() => {
        this.off('notification', finish);
        reject(new Error(`GPT turn ${turnId} did not complete before the timeout`));
      }, timeoutMs);
      this.on('notification', finish);
    });
  }

  #completedTurn(threadId, turnId, state) {
    const p = state?.completed?.params || {};
    const status = p.turn?.status;
    if (p.threadId !== threadId) throw new Error('GPT completion belongs to another thread');
    if (status !== 'completed') {
      throw new Error(p.turn?.error?.message || `GPT turn ended ${status || 'without a status'}`);
    }
    const reply = String(state?.reply || '').trim();
    if (!reply) throw new Error('GPT turn completed without an assistant message');
    this.turnState.delete(turnId);
    return { threadId, turnId, status, reply };
  }

  async runTurn(threadId, text, timeoutMs) {
    const accepted = await this.startTurn(threadId, text);
    const turnId = accepted?.turn?.id;
    if (!turnId) throw new Error('GPT did not return a turn receipt');
    return this.waitForTurn(threadId, turnId, timeoutMs);
  }

  async interruptTurn(threadId, turnId) {
    if (!this.ready || !this.threads.has(threadId)) throw new Error('Unknown GPT thread');
    return this.request('turn/interrupt', { threadId, turnId });
  }

  close(error = new Error('GPT connection closed; pending outcomes unknown')) {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.threads.clear();
    this.turnState.clear();
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.lines.close();
    this.emit('disconnected', { message: error.message });
  }
}
