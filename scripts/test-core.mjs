import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const TYPES = { '.wasm': 'application/wasm', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const path = join(ROOT, normalize(rel));
    const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
    if (norm(path) !== norm(ROOT) && !norm(path).startsWith(norm(ROOT) + '/')) { res.writeHead(403); return res.end(); }
    const s = await stat(path);
    if (s.isDirectory()) throw Error('dir');
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('no'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

let fails = 0;
const ck = (l, c, e = '') => { console.log(`${c ? 'PASS  ' : 'FAIL  '}${l}${e ? '  [' + String(e).slice(0, 160) + ']' : ''}`); if (!c) fails++; };
const READY = () => { try { return !!(window.AP && AP.db && AP.userVersion() === 2 && AP.rows('SELECT count(*) AS n FROM audit_log')[0].n > 0); } catch { return false; } };

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
const consoleErrs = [];
const modelCalls = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
page.on('request', (r) => { if (r.url().includes('/chat/completions')) modelCalls.push(r.url()); });
await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1') ? route.continue() : route.abort());

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(READY, null, { timeout: 90000 });
await page.evaluate(() => { AP.cycleIntervalMs = 600000; clearInterval(AP.cycleTimer); });

const mods = await page.evaluate(() => ({
  data: typeof window.APData, policy: typeof window.APPolicy, commands: typeof window.APCommands, views: typeof window.APViews,
  packs: typeof window.APPacks,
  ready: !!window.__apCoreReady,
}));
ck('módulos del núcleo cargados', mods.data === 'object' && mods.policy === 'object' && mods.commands === 'object' && mods.views === 'object' && mods.packs === 'object' && mods.ready, JSON.stringify(mods));

const pk = await page.evaluate(async () => {
  const reg = await APPacks.load();
  const bad = (() => { try { APPacks.register({ code: 'co' }); return 'sin error'; } catch (e) { return e.message; } })();
  return {
    n: reg.length,
    codes: reg.map((p) => p.code).sort(),
    co: APPacks.gate('CO'),
    ve: APPacks.gate('VE'),
    xx: APPacks.gate('XX'),
    bad,
  };
});
ck('registro de packs en el kernel', pk.n === 2 && pk.codes.join() === 'CO,VE', JSON.stringify(pk.codes));
ck('gate de packs no habilitados', pk.co.registered && !pk.co.eligible && !pk.ve.eligible && pk.co.reasons.some((r) => /runtime_enabled/.test(r)) && pk.co.reasons.some((r) => /migraci/.test(r)) && pk.co.reasons.some((r) => /estado borrador/.test(r)), JSON.stringify(pk.co.reasons));
ck('pack no registrado y registro inválido', pk.xx.registered === false && /no registrado/.test(pk.xx.reasons.join()) && /C[oó]digo/.test(pk.bad), JSON.stringify({ xx: pk.xx, bad: pk.bad }));

const check = await page.evaluate(() => {
  const sup = AP.one("SELECT supplier_id FROM supplier_products WHERE sku='SKU-451' LIMIT 1");
  try {
    const r = APCompliance.evaluate(AP, { sku: 'SKU-451', qty: 5, supplier_id: sup ? sup.supplier_id : null });
    return { ok: !!r && typeof r.status === 'string', status: r && r.status, reason: r && r.reason, sup: sup && sup.supplier_id };
  } catch (e) { return { ok: false, err: e.message }; }
});
ck('APCompliance.evaluate recibe AP (extraído)', check.ok, JSON.stringify(check));

const val = await page.evaluate(() => {
  const r = {};
  try { AP.query('DELETE FROM audit_log'); r.qDelete = 'sin error'; } catch (e) { r.qDelete = e.message; }
  try { AP.query('SELECT 1; SELECT 2'); r.qMulti = 'sin error'; } catch (e) { r.qMulti = e.message; }
  try { AP.exec({ sql: 'SELECT 1', actor: 'TEST', action: 'x' }); r.eSelect = 'sin error'; } catch (e) { r.eSelect = e.message; }
  try { AP.exec({ sql: 'DELETE FROM audit_log WHERE rowid=-1' }); r.eNoActor = 'sin error'; } catch (e) { r.eNoActor = e.message; }
  const before = AP.one('SELECT count(*) n FROM audit_log').n;
  const changes = AP.exec({ sql: 'DELETE FROM audit_log WHERE rowid=-1', actor: 'TEST', action: 'prueba_exec', entity: 'test', id: 'x', detail: { nota: 'paso 3' } });
  const after = AP.one('SELECT count(*) n FROM audit_log').n;
  r.exec = { changes, delta: after - before, row: AP.one('SELECT actor,action FROM audit_log ORDER BY rowid DESC LIMIT 1') };
  return r;
});
ck('query rechaza escrituras', /solo admite SELECT/.test(val.qDelete), val.qDelete);
ck('query rechaza varias sentencias', /una sola sentencia/.test(val.qMulti), val.qMulti);
ck('exec rechaza SELECT', /solo admite INSERT/.test(val.eSelect), val.eSelect);
ck('exec exige actor y action', /actor y action/.test(val.eNoActor), val.eNoActor);
ck('exec audita la escritura', val.exec.delta === 1 && val.exec.row.action === 'prueba_exec' && val.exec.row.actor === 'TEST', JSON.stringify(val.exec));

const prop = await page.evaluate(async () => {
  try {
    AP.db.run("UPDATE approval_queue SET status='aprobada',decided_by='TEST',decided_at='2026-10-02T00:00:00.000Z' WHERE status='pendiente'");
    const before = AP.one('SELECT count(*) n FROM purchase_proposals').n;
    const msg = await AP.propose({ sku: 'SKU-451', reason: 'prueba de extraccion de modulos' });
    const after = AP.one('SELECT count(*) n FROM purchase_proposals').n;
    const last = AP.one("SELECT id,sku FROM purchase_proposals ORDER BY rowid DESC LIMIT 1");
    const q = AP.one('SELECT status FROM approval_queue WHERE proposal_id=?', [last.id]);
    return { before, after, last, queue: q && q.status, msg: String(msg).slice(0, 90) };
  } catch (e) { return { err: e.message }; }
});
ck('AP.propose crea propuesta pendiente', !prop.err && prop.after === prop.before + 1 && prop.queue === 'pendiente', JSON.stringify(prop));

const cyc = await page.evaluate(async () => {
  const o0 = AP.one('SELECT count(*) n FROM sales_orders').n;
  const a0 = AP.one("SELECT count(*) n FROM audit_log WHERE action='pedido_generado'").n;
  await AP.cycle();
  return { hidden: document.hidden, o0, o1: AP.one('SELECT count(*) n FROM sales_orders').n, a0, a1: AP.one("SELECT count(*) n FROM audit_log WHERE action='pedido_generado'").n };
});
ck('cycle inserta el pedido con AP.exec y audita', !cyc.hidden && cyc.o1 === cyc.o0 + 1 && cyc.a1 === cyc.a0 + 1, JSON.stringify(cyc));

const decideP = page.evaluate((id) => AP.decide(id, 'aprobada'), prop.last.id).catch((e) => 'ERROR: ' + e.message);
await page.waitForSelector('#ap-decision-form', { timeout: 15000 });
await page.fill('#ap-actor', 'TEST');
await page.fill('#ap-reason', 'Revisión humana de prueba del paso 3');
await page.click('#ap-decision-form button[type=submit]');
const dres = await decideP;
const dec = await page.evaluate((id) => ({
  q: AP.one('SELECT status,decided_by FROM approval_queue WHERE proposal_id=?', [id]),
  last: AP.one('SELECT actor,action FROM audit_log ORDER BY rowid DESC LIMIT 1'),
}), prop.last.id);
ck('decide aprueba y audita con AP.exec', dec.q && dec.q.status === 'aprobada' && dec.q.decided_by === 'TEST' && dec.last.action === 'decision_aprobada' && dec.last.actor === 'TEST' && !String(dres).startsWith('ERROR'), JSON.stringify({ dres, dec }));

const beforeRecv = await page.evaluate((id) => {
  const p = AP.one('SELECT sku,proposed_qty FROM purchase_proposals WHERE id=?', [id]);
  return { sku: p.sku, qty: p.proposed_qty, on_hand: AP.one('SELECT on_hand FROM inventory WHERE sku=?', [p.sku]).on_hand, a: AP.one("SELECT count(*) n FROM audit_log WHERE action='recepcion_registrada'").n };
}, prop.last.id);
const recvP = page.evaluate((id) => AP.receive(id), prop.last.id).catch((e) => 'ERROR: ' + e.message);
await page.waitForSelector('#ap-decision-form', { timeout: 15000 });
await page.fill('#ap-actor', 'TEST');
await page.click('#ap-decision-form button[type=submit]');
const rres = await recvP;
const afterRecv = await page.evaluate((x) => ({
  on_hand: AP.one('SELECT on_hand FROM inventory WHERE sku=?', [x.sku]).on_hand,
  a: AP.one("SELECT count(*) n FROM audit_log WHERE action='recepcion_registrada'").n,
  moves: AP.one('SELECT count(*) n FROM stock_movements WHERE proposal_id=?', [x.id]).n,
}), { id: prop.last.id, sku: beforeRecv.sku });
ck('receive registra recepción con AP.exec y audita', afterRecv.on_hand === beforeRecv.on_hand + beforeRecv.qty && afterRecv.a === beforeRecv.a + 1 && afterRecv.moves === 1 && !String(rres).startsWith('ERROR'), JSON.stringify({ beforeRecv, afterRecv, rres }));

await page.evaluate(() => APViews.show(17));
const aCost = await page.evaluate(() => AP.one("SELECT count(*) n FROM audit_log WHERE action='costo_registrado'").n);
await page.fill('#ap-cost-form [name=period]', '2026-01');
await page.selectOption('#ap-cost-form [name=structure]', 'Servicios');
await page.selectOption('#ap-cost-form [name=area]', 'Operativa');
await page.fill('#ap-cost-form [name=amount]', '100.50');
await page.click('#ap-cost-form button[type=submit]');
await page.waitForTimeout(500);
const cost = await page.evaluate((a0) => ({ a0, a1: AP.one("SELECT count(*) n FROM audit_log WHERE action='costo_registrado'").n, rows: AP.one('SELECT count(*) n FROM labor_cost_entries').n, fb: (document.getElementById('ap-cost-feedback') || {}).textContent }), aCost);
ck('formulario de costes escribe con AP.exec y audita', cost.a1 === cost.a0 + 1 && cost.rows > 0, JSON.stringify(cost));

await page.evaluate(() => APViews.show(19));
const aScr = await page.evaluate(() => AP.one("SELECT count(*) n FROM audit_log WHERE action='perfil_preevaluado'").n);
const roleOpts = await page.$$eval('#ap-candidate-form [name=role] option', (els) => els.map((e) => e.textContent));
const role = roleOpts.find((o) => ['Operaciones', 'Relaciones', 'Exploración'].includes(o)) || roleOpts[0];
await page.fill('#ap-candidate-form [name=alias]', 'Perfil PRUEBA');
await page.selectOption('#ap-candidate-form [name=role]', role);
await page.fill('#ap-candidate-form [name=evidence]', 'Trabajo en equipo, aprendizaje y responsabilidades en proyectos locales.');
await page.click('#ap-candidate-form button[type=submit]');
await page.waitForTimeout(500);
const scr = await page.evaluate((a0) => ({ a0, a1: AP.one("SELECT count(*) n FROM audit_log WHERE action='perfil_preevaluado'").n, rows: AP.one('SELECT count(*) n FROM candidate_screenings').n, fb: (document.getElementById('ap-candidate-feedback') || {}).textContent }), aScr);
ck('cribado de perfil escribe con AP.exec y audita', scr.a1 === scr.a0 + 1 && scr.rows >= 1, JSON.stringify(scr));

const cand = await page.evaluate(() => ({
  r: AP.one('SELECT id,alias,score,status FROM candidate_screenings ORDER BY rowid DESC LIMIT 1'),
  a: AP.one("SELECT count(*) n FROM audit_log WHERE action='perfil_aprobado'").n,
  p0: AP.one('SELECT count(*) n FROM recruitment_pipeline').n,
}));
if (cand.r.score < 60 || cand.r.status !== 'review') throw Error('el perfil de prueba no está en revisión: ' + JSON.stringify(cand.r));
const approveClick = await page.evaluate((id) => {
  const b = document.querySelector('[data-approve-candidate="' + id + '"]');
  if (!b) return 'SIN BOTON';
  b.click();
  return 'clicked';
}, cand.r.id);
if (approveClick !== 'clicked') throw Error(approveClick);
await page.waitForSelector('#ap-decision-form', { timeout: 15000 });
await page.click('#ap-decision-form button[type=submit]');
await page.waitForFunction((a) => { try { return AP.one("SELECT count(*) n FROM audit_log WHERE action='perfil_aprobado'").n > a; } catch { return false; } }, cand.a, { timeout: 15000 });
const appr = await page.evaluate((x) => ({
  status: AP.one('SELECT status FROM candidate_screenings WHERE id=?', [x.id]).status,
  a: AP.one("SELECT count(*) n FROM audit_log WHERE action='perfil_aprobado'").n,
  p1: AP.one('SELECT count(*) n FROM recruitment_pipeline').n,
  last: AP.one('SELECT actor,action FROM audit_log ORDER BY rowid DESC LIMIT 1'),
}), { id: cand.r.id, p0: cand.p0 });
ck('avance de perfil audita con AP.exec', appr.status === 'approved' && appr.a === cand.a + 1 && appr.p1 === cand.p0 + 1 && appr.last.action === 'perfil_aprobado', JSON.stringify(appr));

await page.waitForTimeout(800);
await page.evaluate(() => APViews.show(18));
await page.waitForSelector('#ap-recruit-form [name=kind]', { timeout: 10000 });
const aRec = await page.evaluate(() => AP.one("SELECT count(*) n FROM audit_log WHERE action='contacto_registrado'").n);
await page.selectOption('#ap-recruit-form [name=kind]', 'Aliados');
await page.fill('#ap-recruit-form [name=title]', 'Perfil de prueba paso 3');
await page.fill('#ap-recruit-form [name=signal]', 'Prueba local');
await page.fill('#ap-recruit-form [name=note]', 'Paso 3');
await page.click('#ap-recruit-form button[type=submit]');
await page.waitForTimeout(500);
const rec = await page.evaluate((a0) => ({ a0, a1: AP.one("SELECT count(*) n FROM audit_log WHERE action='contacto_registrado'").n, rows: AP.one('SELECT count(*) n FROM recruitment_pipeline').n, fb: (document.getElementById('ap-recruit-feedback') || {}).textContent }), aRec);
ck('alta en el radar escribe con AP.exec y audita', rec.a1 === rec.a0 + 1 && rec.rows >= 1, JSON.stringify(rec));

const adv0 = await page.evaluate(() => {
  const row = AP.one("SELECT id FROM recruitment_pipeline WHERE stage='Detectado' ORDER BY rowid DESC LIMIT 1");
  return { id: row && row.id, a: AP.one("SELECT count(*) n FROM audit_log WHERE action='etapa_avanzada'").n };
});
if (!adv0.id) throw Error('no hay fila en Detectado para mover');
await page.click('[data-recruit-id="' + adv0.id + '"]');
await page.waitForTimeout(500);
const adv = await page.evaluate((x) => ({ stage: AP.one('SELECT stage FROM recruitment_pipeline WHERE id=?', [x.id]).stage, a: AP.one("SELECT count(*) n FROM audit_log WHERE action='etapa_avanzada'").n }), adv0);
ck('avance de etapa audita con AP.exec', adv.stage === 'Exploración' && adv.a === adv0.a + 1, JSON.stringify(adv));

const n0 = await page.evaluate(() => document.querySelectorAll('.chat-msg.ai').length);
const audit0 = await page.evaluate(() => AP.one("SELECT count(*) n FROM audit_log WHERE action='analisis_completado'").n);
await page.evaluate(() => {
  clearInterval(AP.cycleTimer);
  AP.tab('chat');
  AP.modelCall = async () => ({ content: 'RESPUESTA LOCAL STUB' });
});
await page.fill('#chatInput', 'Hola ALPHA, responde solo: listo.');
await page.press('#chatInput', 'Enter');
let replied = false;
try {
  await page.waitForFunction((n) => { const e = [...document.querySelectorAll('.chat-msg.ai')]; return e.length > n && e[e.length - 1].textContent.trim().length > 15; }, n0, { timeout: 60000 });
  replied = true;
} catch { replied = false; }
const after = await page.evaluate(() => ({
  last: (document.querySelector('.chat-msg.ai:last-of-type') || {}).textContent?.trim().slice(0, 90),
  audit: AP.one("SELECT count(*) n FROM audit_log WHERE action='analisis_completado'").n,
  busy: AP.busy,
}));
ck('el agente responde en el chat local (ask extraído)', replied && /RESPUESTA LOCAL STUB/.test(after.last || ''), JSON.stringify(after));
ck('auditoría analisis_completado registrada', after.audit === audit0 + 1, `${audit0} -> ${after.audit}`);
ck('sin llamadas reales al modelo con el stub', modelCalls.length === 0, String(modelCalls.length));
const metaLen = await page.evaluate(() => { const m = document.querySelector('meta[name=description]'); return m ? m.content.length : 0; });
ck('meta description presente en el head', metaLen > 40, String(metaLen));
await page.evaluate(() => AP.closeChat());
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const mob = await page.evaluate(() => { const t = document.getElementById('ap-menu-toggle'); return { overflow: document.documentElement.scrollWidth - window.innerWidth, toggle: t ? getComputedStyle(t).display : 'ninguno' }; });
ck('móvil sin desplazamiento horizontal', mob.overflow <= 1, String(mob.overflow));
ck('móvil: botón de menú visible', mob.toggle !== 'none', mob.toggle);
await page.click('#ap-menu-toggle');
await page.waitForTimeout(350);
const opened = await page.evaluate(() => document.getElementById('ap-sidebar').classList.contains('is-open'));
ck('móvil: el menú abre la barra lateral', opened, String(opened));
ck('sin errores de página', errors.length === 0, errors.join(' | ').slice(0, 300));
if (consoleErrs.length) console.log('  INFO errores de consola:', consoleErrs.slice(0, 4).join(' | ').slice(0, 300));

await browser.close();
server.close();
console.log(fails === 0 ? 'NUCLEO Y CHAT LOCAL OK' : `${fails} FALLOS`);
process.exit(fails ? 1 : 0);
