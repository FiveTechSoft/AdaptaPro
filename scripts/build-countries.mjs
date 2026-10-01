import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packsDir = fileURLToPath(new URL('../packs/', import.meta.url));
const indexPath = join(packsDir, 'index.json');

async function listFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile()).map((e) => e.name).sort();
}

export async function buildIndex() {
  const entries = await readdir(packsDir, { withFileTypes: true });
  const codes = entries
    .filter((e) => e.isDirectory() && /^[A-Z]{2}$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (!codes.length) throw Error('no se encontraron packs de pais en packs/');
  const countries = [];
  for (const code of codes) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(packsDir, code, 'manifest.json'), 'utf8'));
    } catch (e) {
      throw Error(`${code}: manifest.json ilegible o ausente (${e.message})`);
    }
    if (manifest.country !== code) throw Error(`${code}: manifest.country=${JSON.stringify(manifest.country)}`);
    countries.push({
      code,
      name: manifest.name,
      status: manifest.status,
      runtime_enabled: manifest.runtime_enabled,
      maintainer: manifest.maintainer,
      scope: manifest.scope,
      files: {
        data: (await listFiles(join(packsDir, code, 'data'))).map((f) => `${code}/data/${f}`),
        locale: (await listFiles(join(packsDir, code, 'locale'))).map((f) => `${code}/locale/${f}`),
        tests: (await listFiles(join(packsDir, code, 'tests'))).map((f) => `${code}/tests/${f}`),
      },
    });
  }
  return { schema_version: 1, generator: 'scripts/build-countries.mjs', countries };
}

export async function serializeIndex() {
  return JSON.stringify(await buildIndex(), null, 2) + '\n';
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const check = process.argv.includes('--check');
  try {
    const expected = await serializeIndex();
    if (check) {
      const actual = await readFile(indexPath, 'utf8').catch(() => null);
      if (actual === null) throw Error('packs/index.json no existe');
      if (actual !== expected) throw Error('packs/index.json desactualizado');
      console.log('OK: packs/index.json actualizado');
    } else {
      await writeFile(indexPath, expected, 'utf8');
      const idx = JSON.parse(expected);
      console.log(`OK: packs/index.json con ${idx.countries.length} paises`);
    }
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exitCode = 1;
  }
}
