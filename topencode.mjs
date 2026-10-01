/** TOpenCode — transporte directo al API Zen de OpenCode.
 * Port a JavaScript de la clase TOpenCode de FWH (source/classes/topencode.prg).
 * Sustituye al puente por email de Instinct: la llamada va directa al modelo,
 * sin OAuth, sin buzón y sin ida y vuelta por SMTP.
 * Sin secretos embebidos: Authorization es "Bearer public" (gate de nivel gratis).
 */
export const VERSION = 'adaptapro.topencode/1';
export const DEFAULT_MODEL = 'mimo-v2.6-flash-free';
export const DEFAULT_URL = 'https://opencode.ai/zen/v1/chat/completions';
export const FALLBACK_MODELS = ['mimo-v2.6-flash-free', 'mimo-v2.5-free', 'space-bunny-free', 'big-pickle', 'nemotron-3-ultra-free'];
export const USER_AGENT = 'opencode/1.18.34';
export const TIMEOUT_MS = 90000;
const NO_TOOLS = 'You have tools available but you must NEVER call them. Always reply with a plain text message.';
const GATE_TOOL_NAMES = ['bash', 'edit', 'glob', 'grep', 'read', 'skill', 'task', 'todowrite', 'webfetch', 'websearch', 'write'];
const RETRY_MARKERS = ['rate limit', 'rate_limit', '429', 'too many', 'free tier', 'freetier', '500', '502', '503', 'upstream', 'internal server', 'overloaded', 'unavailable', 'not supported', 'unsupported', 'modelerror', 'timeout', 'timed out', 'winhttp request failed', "couldn't connect", 'could not connect', "couldn't resolve", 'failure when receiving'];

export function errText(response) {
  if (!response || typeof response !== 'object') return '';
  const err = response.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && typeof err.message === 'string') return err.message;
  if (typeof response.message === 'string') return response.message;
  return '';
}

export function shouldRetry(response) {
  if (response === '' || response === null || response === undefined) return true;
  let parsed = response;
  if (typeof response === 'string') {
    try { parsed = JSON.parse(response); } catch { return false; }
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const text = errText(parsed).toLowerCase();
  if (!text && Array.isArray(parsed.choices)) return false;
  if (!text) return false;
  const type = parsed.error && typeof parsed.error === 'object' ? String(parsed.error.type || '').toLowerCase() : '';
  if (type === 'server_error') return true;
  return RETRY_MARKERS.some(m => text.includes(m));
}

export function fallbackList(skip) {
  return FALLBACK_MODELS.filter(m => m !== skip);
}

const HEX = '0123456789abcdef';
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function rand(n, alphabet) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[a[i] % alphabet.length];
  return out;
}
export function gateId(prefix) {
  return prefix + '_' + rand(12, HEX) + rand(14, B62);
}
export function gateTools() {
  return GATE_TOOL_NAMES.map(name => ({ type: 'function', function: { name, description: 'tool', parameters: { type: 'object', properties: {} } } }));
}

export function buildBody({ model, prompt, systemPrompt = '', temperature = 0.7 }) {
  const messages = [{ role: 'system', content: systemPrompt ? systemPrompt + ' ' + NO_TOOLS : NO_TOOLS }, { role: 'user', content: prompt }];
  return JSON.stringify({ model, temperature, stream: true, tools: gateTools(), messages });
}

export function parseSSE(body) {
  if (typeof body !== 'string') return body;
  const trimmed = body.trimStart();
  if (trimmed.startsWith('{') && !body.includes('data:')) return body;
  if (!body.includes('data:')) return body;
  let text = '', finish = '', usage = null, error = null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let chunk;
    try { chunk = JSON.parse(payload); } catch { continue; }
    if (chunk.error) { error = chunk.error; break; }
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices && chunk.choices[0];
    if (!choice) continue;
    if (choice.finish_reason) finish = choice.finish_reason;
    const delta = choice.delta || {};
    if (typeof delta.content === 'string') text += delta.content;
    if (choice.message && typeof choice.message.content === 'string') text += choice.message.content;
    if (!text && Array.isArray(delta.tool_calls) && delta.tool_calls.length) text = '(tool_call ' + (delta.tool_calls[0].function?.name || '') + ')';
  }
  if (error) return JSON.stringify({ type: 'error', error });
  return JSON.stringify({ id: 'oc-stream', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finish || 'stop' }], ...(usage ? { usage } : {}) });
}

let tmpSeq = 0;
const nodefs = () => (globalThis.process?.versions?.node ? { fs: true } : null);

export class TOpenCode {
  constructor({ model = DEFAULT_MODEL, url = DEFAULT_URL, temperature = 0.7, fetchImpl = globalThis.fetch, userAgent = USER_AGENT, timeoutMs = TIMEOUT_MS } = {}) {
    if (typeof model !== 'string' || !model) throw Error('Modelo inválido');
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw Error('URL inválida');
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw Error('Temperatura 0..2');
    if (typeof fetchImpl !== 'function') throw Error('fetch no disponible');
    this.model = model;
    this.url = url;
    this.temperature = temperature;
    this.fetch = fetchImpl;
    this.userAgent = userAgent;
    this.timeoutMs = timeoutMs;
    this.response = '';
    this.httpCode = 0;
    this.error = '';
    this.running = false;
    this.file = null;
    this.promise = null;
    this.lastModel = model;
  }

  setModel(model) { this.model = model; return this; }
  setTemperature(t) { if (!Number.isFinite(t) || t < 0 || t > 2) throw Error('Temperatura 0..2'); this.temperature = t; return this; }

  async attempt(prompt, systemPrompt, model) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer public',
      'User-Agent': this.userAgent,
      'x-opencode-session': gateId('ses'),
      'x-opencode-request': gateId('msg')
    };
    let body = '', status = 0;
    try {
      const res = await this.fetch(this.url, { method: 'POST', headers, body: buildBody({ model, prompt, systemPrompt, temperature: this.temperature }), signal: AbortSignal.timeout(this.timeoutMs) });
      status = res.status;
      body = await res.text();
    } catch (e) {
      this.httpCode = 0;
      this.response = JSON.stringify({ type: 'error', error: { message: 'curl: ' + (e?.message || String(e)) } });
      this.error = 'curl';
      return this.response;
    }
    const folded = status >= 200 && status < 300 ? parseSSE(body) : body;
    this.httpCode = status;
    this.response = folded;
    this.lastModel = model;
    let parsed = null;
    try { parsed = JSON.parse(folded); } catch { parsed = null; }
    if (parsed && parsed.type === 'error') {
      this.error = errText(parsed) || ('HTTP ' + status);
    } else if (status >= 200 && status < 300 && parsed && Array.isArray(parsed.choices)) {
      this.error = '';
    } else {
      this.error = status >= 200 && status < 300 ? (errText(parsed) || 'Unknown response format') : ('HTTP ' + status);
      if (!parsed) this.response = JSON.stringify({ type: 'error', error: { message: this.error } });
    }
    return this.response;
  }

  async sendWithAuth(prompt, systemPrompt = '', useSystem = false, model = this.model) {
    await this.attempt(prompt, useSystem ? systemPrompt : '', model);
    if (shouldRetry(this.response)) {
      let n = 0;
      for (const fallback of fallbackList(model)) {
        n++;
        if (n > 2) break;
        await this.attempt(prompt, useSystem ? systemPrompt : '', fallback);
        if (!shouldRetry(this.response)) break;
      }
    }
    return this.response;
  }

  async send(prompt) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw Error('Prompt vacío');
    return this.sendWithAuth(prompt, '', false, this.model);
  }

  async sendWithSystem(systemPrompt, userPrompt) {
    if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) throw Error('System prompt vacío');
    if (typeof userPrompt !== 'string' || !userPrompt.trim()) throw Error('Prompt vacío');
    return this.sendWithAuth(userPrompt, systemPrompt, true, this.model);
  }

  async sendStream(prompt, callback) {
    const body = await this.send(prompt);
    if (typeof callback === 'function') callback(this.getValue());
    return body;
  }

  async sendAsync(prompt) {
    if (this.running) return this.file;
    this.running = true;
    this.response = '';
    this.error = '';
    const tmp = await this.tmpName();
    this.file = tmp;
    this.promise = (async () => {
      let body = '';
      try {
        body = await this.send(prompt);
        await this.writeFile(tmp.final, body);
      } finally {
        this.promise = null;
      }
      return body;
    })();
    return this.file;
  }

  isRunning() {
    if (!this.running) return false;
    if (!nodefs() || !this._fsp || !this.file?.final) return this.promise !== null;
    const fs = this._fsp;
    if (!fs.existsSync(this.file.final)) return true;
    const body = fs.readFileSync(this.file.final, 'utf8');
    try { fs.unlinkSync(this.file.final); } catch { }
    this.response = body;
    this.running = false;
    this.file = null;
    return false;
  }

  async wait() {
    if (this.promise) await this.promise;
    if (this.running && this.file?.final && this._fsp) {
      const fs = this._fsp;
      if (fs.existsSync(this.file.final)) {
        this.response = fs.readFileSync(this.file.final, 'utf8');
        try { fs.unlinkSync(this.file.final); } catch { }
      }
    }
    this.running = false;
    this.file = null;
    return this.response;
  }

  getValue() {
    let parsed = null;
    try { parsed = JSON.parse(this.response); } catch { parsed = null; }
    if (!parsed) return 'ERROR: Unknown response format: ' + String(this.response).slice(0, 200);
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.length) return content;
    const text = errText(parsed);
    return text ? 'ERROR: ' + text : 'ERROR: Unknown response format: ' + String(this.response).slice(0, 200);
  }

  getUsage() {
    try { return JSON.parse(this.response)?.usage ?? null; } catch { return null; }
  }

  getHttpStatus() { return this.httpCode; }
  getError() { return this.error; }
  getModel() { return this.lastModel; }

  async end() {
    if (this.promise) await this.promise;
    this.running = false;
    this.file = null;
    this.response = '';
    this.error = '';
  }

  async tmpName() {
    if (!nodefs()) return { final: null };
    const ms = Date.now();
    const seq = ++tmpSeq;
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    this._fsp = fs;
    const dir = os.tmpdir();
    return { final: path.join(dir, `oc_${ms}_${seq}.json`), part: path.join(dir, `oc_${ms}_${seq}.json.part`) };
  }

  async writeFile(finalPath, body) {
    if (!finalPath) return;
    const fs = await import('node:fs');
    const part = finalPath + '.part';
    await fs.promises.writeFile(part, body, 'utf8');
    try { await fs.promises.unlink(finalPath); } catch { }
    await fs.promises.rename(part, finalPath);
  }
}

export async function ping(url = DEFAULT_URL.replace('/chat/completions', '/models'), fetchImpl = globalThis.fetch) {
  const t0 = Date.now();
  const res = await fetchImpl(url, { headers: { Authorization: 'Bearer public' }, signal: AbortSignal.timeout(20000) });
  const ms = Date.now() - t0;
  if (!res.ok) return { ok: false, status: res.status, ms };
  const data = await res.json();
  return { ok: true, status: res.status, ms, models: (data.data || []).map(m => m.id) };
}
