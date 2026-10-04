// Hace trabajar a ALPHA, BETA y GAMMA en un Chrome sin cabeza y guarda su registro de actividad.
// Uso: node scripts/log-agentes.mjs   (necesita: npm i playwright sql.js@1.13.0 chart.js@4.4.8)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'registro');
fs.mkdirSync(out, { recursive: true });
const URL_APP = process.env.CORE_URL || 'https://fivetechsoft.github.io/Core/'; // la web publicada: el modelo solo acepta ese origen (CORS)
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errores = [], red = [];
page.on('pageerror', (e) => errores.push({ tipo: 'pagina', mensaje: e.message }));
page.on('console', (m) => { if (m.type() === 'error') errores.push({ tipo: 'consola', mensaje: m.text().slice(0, 300) }); });
await page.route('**/*', async (route) => {
  const u = route.request().url();
  if (u.startsWith(URL_APP.slice(0, URL_APP.indexOf('/', 8))) || /api\.fivetech(soft|support)\.com/.test(u)) return route.continue();
  return route.abort(); // TradingView, YouTube, Google: ruido que no es de los agentes
});
page.on('response', (r) => { const u = r.url(); if (/api\.fivetech(soft|support)\.com/.test(u)) red.push({ url: u.replace(/\?.*/, ''), estado: r.status() }); });
await page.goto(URL_APP);
await page.waitForFunction(() => { try { return !!(window.AP && AP.db && AP.rows('SELECT count(*) AS n FROM audit_log')[0].n > 0); } catch { return false; } }, null, { timeout: 60000 });
await page.evaluate(() => {
  clearInterval(AP.cycleTimer);
  window.__llamadas = [];
  const orig = AP.modelCall.bind(AP);
  AP.modelCall = async (...a) => {
    const t = Date.now();
    try { const m = await orig(...a); window.__llamadas.push({ ms: Date.now() - t, ok: true, modelo: AP.activeModel || AP.model, respuesta: String(m.content || '').slice(0, 400), herramientas: (m.tool_calls || []).map((c) => c.function.name) }); return m; }
    catch (e) { window.__llamadas.push({ ms: Date.now() - t, ok: false, error: String(e.message).slice(0, 300) }); throw e; }
  };
});
const antes = await page.evaluate(() => AP.one('SELECT count(*) AS n FROM audit_log').n);
const pasos = [];
async function paso(nombre, fn) {
  const t = Date.now();
  try { const r = await fn(); pasos.push({ paso: nombre, ok: true, ms: Date.now() - t, resultado: r }); } catch (e) { pasos.push({ paso: nombre, ok: false, ms: Date.now() - t, error: String(e.message).slice(0, 300) }); }
}
await paso('BETA genera un pedido (ciclo autonomo)', () => page.evaluate(async () => { AP.lastModelCycleAt = Date.now(); const n = AP.one('SELECT count(*) AS n FROM sales_orders').n; await AP.cycle(); return { pedidos_nuevos: AP.one('SELECT count(*) AS n FROM sales_orders').n - n }; }));
for (const [agente, texto] of [['ALPHA', 'Revisa el stock disponible. Si hay riesgo de rotura, crea una propuesta de reposición pendiente de supervisión.'], ['BETA', 'Resume los pedidos y dime cuáles tienen riesgo de stock.'], ['GAMMA', 'Compara proveedores y plazos para las propuestas pendientes.']]) {
  await paso(agente + ' responde con el modelo real', () => page.evaluate(async ([a, t]) => { AP.busy = false; await AP.ask(t, true, a); const l = window.__llamadas; return { ultima_llamada: l[l.length - 1] || null, estado_agente: AP.query("SELECT actor,action FROM audit_log ORDER BY rowid DESC LIMIT 1")[0] }; }, [agente, texto]));
}
const final = await page.evaluate(() => ({
  total: AP.one('SELECT count(*) AS n FROM audit_log').n,
  eventos: AP.query('SELECT occurred_at,actor,action,entity_type,entity_id,details_json FROM audit_log ORDER BY rowid DESC LIMIT 300'),
  por_agente: AP.query('SELECT actor,count(*) AS n FROM audit_log GROUP BY actor ORDER BY n DESC'),
  llamadas_modelo: window.__llamadas,
  pendientes: AP.one("SELECT count(*) AS n FROM approval_queue WHERE status='pendiente'").n,
}));
await page.screenshot({ path: path.join(out, 'ultima-captura.png') });
const llamadas = final.llamadas_modelo;
const informe = {
  app: 'Core', ejecutado_en: new Date().toISOString(), origen: 'GitHub Actions (Chrome sin cabeza), no es el navegador del usuario',
  veredicto: llamadas.length && llamadas.every((l) => l.ok) && !errores.length ? 'OK' : llamadas.some((l) => l.ok) ? 'PARCIAL' : 'CON_ERRORES',
  eventos_antes: antes, eventos_despues: final.total, pendientes_aprobacion: final.pendientes,
  pasos, llamadas_modelo: llamadas, red_api_modelo: red.slice(0, 40), errores_pagina: [...new Map(errores.map((e) => [e.mensaje.slice(0, 120), e])).values()].slice(0, 20),
  por_agente: final.por_agente, eventos_recientes: final.eventos,
};
const txt = JSON.stringify(informe, null, 1) + '\n';
fs.writeFileSync(path.join(out, 'ultimo.json'), txt);
fs.writeFileSync(path.join(out, 'actividad-' + informe.ejecutado_en.slice(0, 10) + '.json'), txt);
console.log('Veredicto:', informe.veredicto, '| llamadas al modelo:', llamadas.length, 'ok:', llamadas.filter((l) => l.ok).length, '| errores de pagina:', errores.length);
await browser.close();
