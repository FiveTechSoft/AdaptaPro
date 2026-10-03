import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const TYPES = { '.wasm': 'application/wasm', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
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
const ck = (l, c, e = '') => { console.log(`${c ? 'PASS  ' : 'FAIL  '}${l}${e ? '  [' + String(e).slice(0, 150) + ']' : ''}`); if (!c) fails++; };
const READY = () => { try { return !!(window.AP && AP.db && AP.userVersion() === 2 && AP.rows('SELECT count(*) AS n FROM audit_log')[0].n > 0); } catch { return false; } };

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
const fetched = [];
page.on('request', (r) => { const u = r.url().split('?')[0]; if (/migrations|schema\.sql|demo\.json/.test(u)) fetched.push(u.split('/').slice(-2).join('/')); });
await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1') ? route.continue() : route.abort());
await page.addInitScript(() => { try { localStorage.setItem('adaptapro-agents', 'off'); } catch {} });

console.log('--- 1. primera carga (base nueva) ---');
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(READY, null, { timeout: 60000 });
await page.evaluate(() => { AP.cycleIntervalMs = 600000; clearInterval(AP.cycleTimer); });
const v1 = await page.evaluate(() => ({
  v: AP.userVersion(),
  c: {
    subagents: AP.one('SELECT count(*) AS n FROM legal_subagents').n,
    juris: AP.one('SELECT count(*) AS n FROM legal_jurisdictions').n,
    screen: AP.one('SELECT count(*) AS n FROM candidate_screenings').n,
    payroll: AP.one('SELECT count(*) AS n FROM payroll_rules').n,
    norms: AP.one('SELECT count(*) AS n FROM compliance_norms').n,
    orders: AP.one('SELECT count(*) AS n FROM sales_orders').n,
  },
  check: APCompliance.evaluate(AP, {}),
  audit: AP.one('SELECT count(*) AS n FROM audit_log').n,
}));
ck('user_version = 2 tras la primera carga', v1.v === 2, String(v1.v));
ck('tablas de cumplimiento con las filas esperadas', v1.c.subagents === 7 && v1.c.juris === 2 && v1.c.screen === 2 && v1.c.payroll === 5 && v1.c.norms === 13, JSON.stringify(v1.c));
ck('la semilla de pedidos se cargó', v1.c.orders > 0, String(v1.c.orders));
ck('el chequeo de cumplimiento devuelve review con motivo', v1.check.status === 'review' && /Faltan fuentes jurídicas/.test(v1.check.reason), JSON.stringify(v1.check));
ck('la migración 0002 se pidió una vez', fetched.filter((u) => u.endsWith('0002_compliance.sql')).length === 1, fetched.join(' | '));

console.log('\n--- 2. vistas que usan esas tablas ---');
const views = await page.evaluate(() => {
  const out = [];
  for (const id of [13, 14, 16, 17, 18]) {
    try { APViews.show(id); out.push([id, document.getElementById('ap-view').innerText.length]); }
    catch (e) { out.push([id, 'ERROR ' + e.message]); }
  }
  APViews.show(0);
  return out;
});
ck('vistas 13,14,16,17,18 renderizan con contenido', views.every((v) => typeof v[1] === 'number' && v[1] > 200), JSON.stringify(views));

console.log('\n--- 3. recarga con la base ya versionada ---');
fetched.length = 0;
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(READY, null, { timeout: 60000 });
const v2 = await page.evaluate(() => ({ v: AP.userVersion(), norms: AP.one('SELECT count(*) AS n FROM compliance_norms').n, audit: AP.one('SELECT count(*) AS n FROM audit_log').n }));
ck('user_version sigue en 2', v2.v === 2, String(v2.v));
ck('no se vuelve a bajar schema.sql ni la migración', !fetched.some((u) => u.endsWith('schema.sql') || u.endsWith('0002_compliance.sql')), fetched.join(' | ') || '(sin peticiones)');
ck('la migración no duplica filas en la recarga', v2.norms === v1.c.norms, `${v1.c.norms} -> ${v2.norms}`);
ck('la auditoría sobrevive a la recarga', v2.audit === v1.audit, `${v1.audit} -> ${v2.audit}`);

console.log('\n--- 4. restablecer demo (base nueva otra vez) ---');
fetched.length = 0;
  const resetP = page.evaluate(() => AP.reset()).catch(() => {});
  await page.waitForSelector('#ap-decision-form', { timeout: 20000 });
  await page.click('#ap-decision-form button[type=submit]');
  await resetP;
  await page.waitForFunction((n) => { try { return AP.db && AP.userVersion() === 2 && AP.one('SELECT count(*) AS n FROM compliance_norms').n === n; } catch { return false; } }, v1.c.norms, { timeout: 60000 });
const v3 = await page.evaluate(() => ({ v: AP.userVersion(), norms: AP.one('SELECT count(*) AS n FROM compliance_norms').n }));
ck('tras restablecer, versión y filas correctas', v3.v === 2 && v3.norms === v1.c.norms, JSON.stringify(v3));
ck('restablecer reaplica la migración 0002', fetched.some((u) => u.endsWith('0002_compliance.sql')), fetched.join(' | '));

ck('sin errores de página', errors.length === 0, errors.slice(0, 2).join(' | '));
console.log(fails === 0 ? 'MIGRACION EN NAVEGADOR OK' : `${fails} FALLOS`);
await browser.close();
server.close();
process.exit(fails ? 1 : 0);
