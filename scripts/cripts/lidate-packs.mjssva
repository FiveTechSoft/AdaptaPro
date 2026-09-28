import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../packs/', import.meta.url);
const entries = await readdir(root, { withFileTypes: true });
let errors = 0;
for (const entry of entries.filter(e => e.isDirectory())) {
  const code = entry.name;
  try {
    if (!/^[A-Z]{2}$/.test(code)) throw Error('directorio: usar código ISO alfa-2 en mayúsculas');
    const data = JSON.parse(await readFile(join(root.pathname, code, 'manifest.json'), 'utf8'));
    const keys = ['schema_version', 'country', 'name', 'status', 'runtime_enabled', 'maintainer', 'scope', 'sources', 'notes'];
    if (Object.keys(data).sort().join() !== keys.sort().join()) throw Error('campos obligatorios o extraños en manifiesto');
    if (data.schema_version !== 1 || data.country !== code || !['borrador','en_revision','validado'].includes(data.status) || data.runtime_enabled !== false) throw Error('versión, país, estado o activación inválidos');
    for (const k of ['name','maintainer','notes']) if (typeof data[k] !== 'string' || !data[k].trim()) throw Error(`${k} vacío`);
    if (!Array.isArray(data.scope) || !data.scope.length || data.scope.some(s=>typeof s!=='string'||!s.trim()) || !Array.isArray(data.sources)) throw Error('scope o sources inválidos');
    for (const s of data.sources) {
      if (!s || typeof s !== 'object' || !['title','url','checked_on','effective_on','review_status'].every(k=>Object.hasOwn(s,k)) || typeof s.title !== 'string' || !/^https:\/\//.test(s.url) || !/^\d{4}-\d{2}-\d{2}$/.test(s.checked_on) || (s.effective_on !== null && !/^\d{4}-\d{2}-\d{2}$/.test(s.effective_on)) || !['pendiente','revisada'].includes(s.review_status)) throw Error('fuente incompleta o inválida');
    }
    console.log(`OK: ${code}`);
  } catch (e) { errors++; console.error(`ERROR: ${code}: ${e.message}`); }
}
          if (errors) process.exitCode = 1;
