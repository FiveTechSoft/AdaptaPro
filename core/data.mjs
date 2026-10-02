export const APData = {
  txDepth: 0,
  scan(sql,args=[]){ const q=AP.db.prepare(sql); try {q.bind(args); const out=[]; while(q.step())out.push(q.getAsObject()); return out;} finally {q.free();} },
  query(sql,args=[]){
    if(typeof sql!=='string'||!sql.trim())throw Error('query requiere una sentencia');
    const s=sql.trim();
    if(!/^(select|with)\b/i.test(s))throw Error('query solo admite SELECT o WITH');
    if(/;\s*\S/.test(s))throw Error('query admite una sola sentencia');
    if(!Array.isArray(args))throw Error('query exige argumentos parametrizados');
    return APData.scan(s,args);
  },
  exec(spec){
    const {sql,args=[],actor,action,entity='',id,detail={},audit=true}=spec||{};
    if(typeof sql!=='string'||!sql.trim())throw Error('exec requiere una sentencia');
    const s=sql.trim();
    if(!/^(insert|update|delete)\b/i.test(s))throw Error('exec solo admite INSERT, UPDATE o DELETE');
    if(/;\s*\S/.test(s))throw Error('exec admite una sola sentencia');
    if(!Array.isArray(args))throw Error('exec exige argumentos parametrizados');
    if(audit!==false&&(!actor||!action))throw Error('exec exige actor y action para auditar');
    return AP.tx(()=>{
      AP.db.run(s,args);
      const changes=AP.db.getRowsModified();
      if(audit!==false)AP.audit(actor,action,String(entity||''),id==null?'':String(id),detail||{});
      return changes;
    });
  },
  rows(sql,args=[]){ return APData.query(sql,args); },
  one(sql,args=[]){ return APData.query(sql,args)[0]; },
  async storage(){ return new Promise((resolve,reject)=>{const r=indexedDB.open('adaptapro-local-v1',1); r.onupgradeneeded=()=>r.result.createObjectStore('database');r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);}); },
  async loadBytes(){return new Promise((resolve,reject)=>{const t=AP.store.transaction('database','readonly');const r=t.objectStore('database').get('main');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
  async persist(){const bytes=AP.db.export();return new Promise((resolve,reject)=>{const t=AP.store.transaction('database','readwrite');t.objectStore('database').put(bytes,'main');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});},
  tx(fn){if(APData.txDepth>0){APData.txDepth++;try{return fn();}finally{APData.txDepth--;}}APData.txDepth=1;try{AP.db.run('BEGIN IMMEDIATE');const v=fn();AP.db.run('COMMIT');return v;}catch(e){try{AP.db.run('ROLLBACK');}catch{}throw e;}finally{APData.txDepth=0;}},
  async loadSeed(){const r=await fetch('data/seed/demo.json');if(!r.ok)throw Error('No se pudo cargar data/seed/demo.json');return r.json();},
  async migrationPlan(){const r=await fetch('data/migrations/index.json');if(!r.ok)throw Error('No se pudo cargar data/migrations/index.json');const plan=await r.json();if(!Array.isArray(plan.migrations)||!plan.migrations.length)throw Error('Plan de migraciones vacío');let prev=0;for(const m of plan.migrations){if(!Number.isInteger(m.n)||m.n<=prev||typeof m.file!=='string')throw Error('Entrada de migración inválida: '+JSON.stringify(m));prev=m.n;}return plan.migrations;},
  userVersion(){const r=AP.db.exec('PRAGMA user_version');return r.length?Number(r[0].values[0][0]):0;},
  async applyMigrations(){const plan=await AP.migrationPlan();const current=AP.userVersion();let applied=0;for(const m of plan){if(m.n<=current)continue;const res=await fetch(m.file);if(!res.ok)throw Error('No se pudo cargar '+m.file);const sql=await res.text();if(!sql.trim())throw Error('Migración vacía: '+m.file);AP.db.run(sql);AP.db.run('PRAGMA user_version='+m.n);applied++;}return applied;},
};
globalThis.APData = APData;
