#!/usr/bin/env node
// Mide latencia contra la API de OpenCode Zen (misma que TOpenCode de FWH).
// Uso: node scripts/mide-latencia.mjs [--runs N] [--modelo ID] [--prompt TEXTO] [--json]

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const RUNS = Number(opt('--runs', 5));
const MODELO = opt('--modelo', 'mimo-v2.6-flash-free');
const PROMPT = opt('--prompt', 'Responde con una sola palabra: listo');
const URL = 'https://opencode.ai/zen/v1/chat/completions';
const NO_TOOLS = 'You have tools available but you must NEVER call them. Always reply with a plain text message.';
const TOOLS = ['bash', 'edit', 'glob', 'grep', 'read', 'skill', 'task', 'todowrite', 'webfetch', 'websearch', 'write']
  .map(name => ({ type: 'function', function: { name, description: 'tool', parameters: { type: 'object', properties: {} } } }));

const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(Math.ceil(n / 2))), b => b.toString(16).padStart(2, '0')).join('').slice(0, n);
const b62 = n => {
  const c = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, b => c[b % c.length]).join('');
};
const gateId = p => `${p}_${hex(12)}${b62(14)}`;

function buildBody(model, prompt) {
  return JSON.stringify({
    model,
    temperature: 0.7,
    stream: true,
    tools: TOOLS,
    messages: [
      { role: 'system', content: NO_TOOLS },
      { role: 'user', content: prompt }
    ]
  });
}

async function once() {
  const body = buildBody(MODELO, PROMPT);
  const t0 = performance.now();
  let tHeaders = null, tFirst = null, tEnd = null;
  let chars = 0, chunks = 0, text = '', usage = null, finish = null, http = 0;

  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer public',
      'User-Agent': 'opencode/1.18.34',
      'x-opencode-session': gateId('ses'),
      'x-opencode-request': gateId('msg')
    },
    body
  });
  http = res.status;
  tHeaders = performance.now();

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, http, error: errText.slice(0, 300), total: tHeaders - t0 };
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (tFirst === null) tFirst = performance.now();
    chunks++;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let j;
      try { j = JSON.parse(payload); } catch { continue; }
      if (j.usage) usage = j.usage;
      if (j.error) return { ok: false, http, error: j.error.message || 'stream error', total: performance.now() - t0 };
      const d = j.choices?.[0]?.delta ?? {};
      if (typeof d.content === 'string') { chars += d.content.length; text += d.content; }
      if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
    }
  }
  tEnd = performance.now();

  return {
    ok: true, http, chars, chunks, finish, usage, text,
    total: tEnd - t0,
    ttfHeaders: tHeaders - t0,
    ttfb: tFirst === null ? null : tFirst - t0,
    streamMs: tFirst === null ? null : tEnd - tFirst
  };
}

const samples = [];
const failures = [];
for (let i = 0; i < RUNS; i++) {
  try {
    const r = await once();
    if (r.ok) {
      samples.push(r);
      console.log(`#${String(i + 1).padStart(2)} ok  total=${r.total.toFixed(0).padStart(6)}ms  ttfb=${(r.ttfb ?? 0).toFixed(0).padStart(6)}ms  stream=${(r.streamMs ?? 0).toFixed(0).padStart(6)}ms  chars=${String(r.chars).padStart(4)}  ${r.finish ?? ''}`);
    } else {
      failures.push(r);
      console.log(`#${String(i + 1).padStart(2)} FAIL http=${r.http} ${String(r.error).slice(0, 120)}`);
    }
  } catch (e) {
    failures.push({ error: e.message });
    console.log(`#${String(i + 1).padStart(2)} ERR  ${e.message}`);
  }
}

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const stats = arr => arr.length ? {
  n: arr.length,
  min: Math.min(...arr),
  p50: pct(arr, 50),
  p95: pct(arr, 95),
  max: Math.max(...arr),
  avg: arr.reduce((a, b) => a + b, 0) / arr.length
} : null;

const report = {
  modelo: MODELO,
  url: URL,
  runs: RUNS,
  ok: samples.length,
  failed: failures.length,
  total_ms: stats(samples.map(s => s.total)),
  ttfb_ms: stats(samples.map(s => s.ttfb).filter(v => v !== null)),
  stream_ms: stats(samples.map(s => s.streamMs).filter(v => v !== null)),
  chars: stats(samples.map(s => s.chars)),
  usage: samples.map(s => s.usage).filter(Boolean),
  samples: samples.map(s => ({ total: +s.total.toFixed(1), ttfb: s.ttfb && +s.ttfb.toFixed(1), chars: s.chars, finish: s.finish }))
};

if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\n=== Resumen ===');
  console.log(JSON.stringify({ ...report, usage: report.usage.slice(0, 2) }, null, 2));
}
