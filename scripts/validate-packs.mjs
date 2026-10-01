import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeIndex } from './build-countries.mjs';

const packsDir = fileURLToPath(new URL('../packs/', import.meta.url));
const MANIFEST_KEYS = ['schema_version', 'country', 'name', 'status', 'runtime_enabled', 'maintainer', 'scope', 'sources', 'notes'];
const DATA_KEYS = ['schema_version', 'country', 'kind', 'note', 'payload'];
const LOCALE_KEYS = ['schema_version', 'country', 'locale', 'currency', 'formats', 'jurisdiction', 'notes'];
const ALLOWED_TOP = ['README.md', 'index.json', 'schemas'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCALE_RE = /^[a-z]{2}-[A-Z]{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

let errors = 0;
const fail = (msg) => {
  errors++;
  console.error(`ERROR: ${msg}`);
};

const sameKeys = (obj, keys) =>
  Object.keys(obj).sort().join() === [...keys].sort().join();

const readJson = async (path, label) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    fail(`${label}: ilegible (${e.message})`);
    return null;
  }
};

const schemaCheck = async () => {
  const dir = join(packsDir, 'schemas');
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
  if (files.length < 3) fail(`schemas: se esperaban al menos 3 esquemas, hay ${files.length}`);
  for (const f of files) await readJson(join(dir, f), `schemas/${f}`);
  const manifest = await readJson(join(dir, 'manifest.schema.json'), 'schemas/manifest.schema.json');
  if (manifest && (!Array.isArray(manifest.required) || sameKeys({ a: 1, ...Object.fromEntries(manifest.required.map((k) => [k, 1])) }, MANIFEST_KEYS))) {
    fail('schemas/manifest.schema.json required no coincide con las claves validadas');
  }
  if (manifest?.properties?.runtime_enabled?.const !== false) fail('schemas/manifest.schema.json: runtime_enabled debe const false');
  if (manifest?.properties?.schema_version?.const !== 1) fail('schemas/manifest.schema.json: schema_version debe const 1');
};

const checkManifest = (code, data) => {
  if (!data) return;
  if (!sameKeys(data, MANIFEST_KEYS)) return fail(`${code}/manifest.json: campos obligatorios o extraños`);
  if (data.schema_version !== 1 || data.country !== code || !['borrador', 'en_revision', 'validado'].includes(data.status) || data.runtime_enabled !== false) {
    return fail(`${code}/manifest.json: versión, país, estado o activación inválidos`);
  }
  for (const k of ['name', 'maintainer', 'notes']) if (typeof data[k] !== 'string' || !data[k].trim()) return fail(`${code}/manifest.json: ${k} vacío`);
  if (!Array.isArray(data.scope) || !data.scope.length || data.scope.some((s) => typeof s !== 'string' || !s.trim()) || !Array.isArray(data.sources)) {
    return fail(`${code}/manifest.json: scope o sources inválidos`);
  }
  for (const s of data.sources) {
    const ok = s && typeof s === 'object' && sameKeys(s, ['title', 'url', 'checked_on', 'effective_on', 'review_status']) &&
      typeof s.title === 'string' && s.title.trim() && /^https:\/\//.test(s.url) &&
      DATE.test(s.checked_on) && (s.effective_on === null || DATE.test(s.effective_on)) &&
      ['pendiente', 'revisada'].includes(s.review_status);
    if (!ok) return fail(`${code}/manifest.json: fuente incompleta o inválida`);
  }
  console.log(`OK: ${code}/manifest.json`);
};

const checkDataFile = (code, file, data) => {
  const label = `${code}/data/${file}`;
  if (!data) return;
  if (!sameKeys(data, DATA_KEYS)) return fail(`${label}: claves del envoltorio deben ser ${DATA_KEYS.join(',')}`);
  if (data.schema_version !== 1 || data.country !== code) return fail(`${label}: schema_version o country inválidos`);
  if (!['reference', 'example'].includes(data.kind)) return fail(`${label}: kind debe ser reference o example`);
  if (typeof data.note !== 'string' || !data.note.trim()) return fail(`${label}: note vacío`);
  if (!data.payload || typeof data.payload !== 'object' || Array.isArray(data.payload) || !Object.keys(data.payload).length) {
    return fail(`${label}: payload debe ser un objeto no vacío`);
  }
  console.log(`OK: ${label}`);
};

const checkLocaleFile = (code, file, data) => {
  const label = `${code}/locale/${file}`;
  if (!data) return;
  if (!sameKeys(data, LOCALE_KEYS)) return fail(`${label}: claves del envoltorio deben ser ${LOCALE_KEYS.join(',')}`);
  if (data.schema_version !== 1 || data.country !== code) return fail(`${label}: schema_version o country inválidos`);
  if (typeof data.locale !== 'string' || !LOCALE_RE.test(data.locale)) return fail(`${label}: locale debe ser xx-XX`);
  if (typeof data.currency !== 'string' || !CURRENCY_RE.test(data.currency)) return fail(`${label}: currency debe ser ISO-4217`);
  if (!data.formats || !sameKeys(data.formats, ['ui', 'number', 'money'])) return fail(`${label}: formats debe tener ui, number y money`);
  if (!data.jurisdiction || !sameKeys(data.jurisdiction, ['code', 'name', 'tax_label', 'core_status'])) return fail(`${label}: jurisdiction incompleta`);
  if (data.jurisdiction.code !== code) return fail(`${label}: jurisdiction.code no coincide con el directorio`);
  for (const k of ['name', 'tax_label', 'core_status']) if (typeof data.jurisdiction[k] !== 'string' || !data.jurisdiction[k].trim()) return fail(`${label}: jurisdiction.${k} vacío`);
  if (typeof data.notes !== 'string' || !data.notes.trim()) return fail(`${label}: notes vacío`);
  console.log(`OK: ${label}`);
};

const pack = async (code) => {
  const base = join(packsDir, code);
  checkManifest(code, await readJson(join(base, 'manifest.json'), `${code}/manifest.json`));
  for (const [sub, check] of [['data', checkDataFile], ['locale', checkLocaleFile]]) {
    const dir = join(base, sub);
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
    for (const f of files) check(code, f, await readJson(join(dir, f), `${code}/${sub}/${f}`));
  }
  const testsDir = join(base, 'tests');
  const tests = (await readdir(testsDir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isFile());
  if (!tests.length && (await readdir(testsDir).catch(() => null))) fail(`${code}/tests: directorio vacío`);
  if (tests.length) console.log(`OK: ${code}/tests (${tests.length} archivos)`);
};

const topCheck = async () => {
  for (const e of await readdir(packsDir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!/^[A-Z]{2}$/.test(e.name) && !ALLOWED_TOP.includes(e.name)) fail(`packs/${e.name}: entrada inesperada`);
    } else if (!ALLOWED_TOP.includes(e.name)) {
      fail(`packs/${e.name}: entrada inesperada`);
    }
  }
};

const indexCheck = async () => {
  const actual = await readFile(join(packsDir, 'index.json'), 'utf8').catch(() => null);
  if (actual === null) return fail('packs/index.json ausente: ejecuta node scripts/build-countries.mjs');
  if (actual !== (await serializeIndex())) return fail('packs/index.json desactualizado: ejecuta node scripts/build-countries.mjs');
  const idx = JSON.parse(actual);
  if (!idx.countries?.length) return fail('packs/index.json sin países');
  console.log(`OK: packs/index.json (${idx.countries.length} países)`);
};

await schemaCheck();
const entries = await readdir(packsDir, { withFileTypes: true });
const codes = entries.filter((e) => e.isDirectory() && /^[A-Z]{2}$/.test(e.name)).map((e) => e.name).sort();
if (!codes.length) fail('packs/: no hay directorios de país');
for (const code of codes) await pack(code);
await topCheck();
await indexCheck();

if (errors) {
  console.error(`${errors} error(es)`);
  process.exitCode = 1;
} else {
  console.log('packs válidos');
}
