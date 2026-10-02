export const APPacks = {
  registry: [],
  migrations: [],
  async load(){
    const idx = await fetch('packs/index.json');
    if(!idx.ok)throw Error('No se pudo cargar packs/index.json');
    const reg = await idx.json();
    if(!reg||!Array.isArray(reg.countries))throw Error('Registro de packs inválido');
    const plan = await fetch('data/migrations/index.json');
    APPacks.migrations = plan.ok ? ((await plan.json()).migrations || []) : [];
    APPacks.registry = [];
    for(const entry of reg.countries)APPacks.register(entry);
    return APPacks.registry;
  },
  register(entry){
    const e = entry || {};
    if(!/^[A-Z]{2}$/.test(e.code||''))throw Error('Código de pack inválido');
    if(typeof e.name!=='string'||!e.name.trim())throw Error('Pack sin nombre: '+e.code);
    if(!['borrador','en_revision','validado'].includes(e.status))throw Error('Estado de pack inválido: '+e.code);
    if(typeof e.runtime_enabled!=='boolean')throw Error('runtime_enabled inválido: '+e.code);
    const files = e.files || {};
    const list = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    const rec = {
      code: e.code, name: e.name, status: e.status, runtime_enabled: e.runtime_enabled,
      maintainer: typeof e.maintainer === 'string' ? e.maintainer : '',
      scope: list(e.scope), data: list(files.data), locale: list(files.locale), tests: list(files.tests),
    };
    const at = APPacks.registry.findIndex((p) => p.code === rec.code);
    if(at < 0)APPacks.registry.push(rec); else APPacks.registry[at] = rec;
    return rec;
  },
  migrationOf(code){
    return APPacks.migrations.find((m) => typeof m.file === 'string' && m.file.endsWith('_pack_' + code + '.sql')) || null;
  },
  gate(code){
    const pack = APPacks.registry.find((p) => p.code === code);
    if(!pack)return { code, registered: false, eligible: false, reasons: ['pack no registrado en el kernel'] };
    const reasons = [];
    if(pack.status !== 'validado')reasons.push('estado ' + pack.status + ': falta revisión humana');
    if(!pack.tests.length)reasons.push('sin pruebas adjuntas');
    const mig = APPacks.migrationOf(pack.code);
    if(!mig)reasons.push('sin migración asociada _pack_' + pack.code + '.sql');
    if(!pack.data.length)reasons.push('sin datos declarados');
    if(!pack.runtime_enabled)reasons.push('runtime_enabled=false');
    return { code: pack.code, registered: true, eligible: reasons.length === 0, reasons, migration: mig && mig.file, status: pack.status };
  },
};
globalThis.APPacks = APPacks;
