import {CentralBridge} from './instinct-central-client.mjs';
import {CENTRAL_CONFIG} from './instinct-central-config.mjs';
export function mountCentralUI(AP){
 const shown=new Set();const prior=AP.ask.bind(AP);let client=null,enabled=false,draft=null,proof=null,timer=null,busy=false,widget=null;
 const button=document.createElement('button');button.className='nav-item';button.id='central-open';button.textContent='☁ Instinct · puente de pruebas';document.getElementById('ap-sidebar').append(button);
 const panel=document.createElement('section');panel.id='central-panel';panel.hidden=true;panel.setAttribute('aria-label','Puente central de pruebas');
 const style=document.createElement('style');style.textContent='#central-panel{position:fixed;inset:8%;z-index:100001;background:var(--bg,#0b1220);color:var(--text,#edf3ff);border:1px solid #677b91;border-radius:16px;padding:22px;overflow:auto}#central-panel label{display:block;margin:12px 0}#central-panel button,#central-panel select{padding:8px;margin:4px;font:inherit}#central-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:32vh;overflow:auto;background:#101a2e;color:#e9f1ff;padding:12px}#central-open{margin-top:8px}';document.head.append(style);
 panel.innerHTML=`<h2>Instinct · prueba central</h2><button id="ic-close">Cerrar</button><p>Solo datos ficticios. Respuestas NO AUTENTICADAS: texto inerte, sin acciones. No prueba identidad del remitente.</p><p>La consulta y el snapshot mínimo se guardan en la cola hasta 24h y se envían desde fivetech2@gmail.com a 3xdy4j@mail.instinct.com. Gmail y el destinatario conservan copias aparte. Los datos ERP siguen en este navegador (IndexedDB).</p><label><input type="checkbox" id="ic-consent"> Acepto enviar solo datos demo con esta retención y audiencia.</label><div id="ic-challenge"></div><button id="ic-enable" disabled>Usar Instinct en este chat</button><button id="ic-disable">Pausar puente</button><label>Agente <select id="ic-agent"><option>ALPHA</option><option>BETA</option><option>GAMMA</option></select></label><p id="ic-status" role="status">Pendiente de despliegue. No envía ni cambia el chat.</p><pre id="ic-preview">Sin consulta preparada.</pre><button id="ic-send" disabled>Enviar consulta revisada a la cola</button><button id="ic-check" disabled>Comprobar respuestas</button><button id="ic-clear" disabled>Borrar sesión de la cola</button><p>Revisa cada consulta antes de enviarla. No se ejecutan herramientas. Cerrar la pestaña no borra la cola; al reabrir este dispositivo usa de nuevo el puente para recuperar. No compartas tu sesión.</p>`;document.body.append(panel);
 const el=id=>panel.querySelector('#'+id),status=x=>el('ic-status').textContent=x,show=()=>panel.hidden=false;
 const ready=()=>!!CENTRAL_CONFIG.workerURL&&!!CENTRAL_CONFIG.turnstileSiteKey;
 function enableState(){el('ic-enable').disabled=!ready()||!el('ic-consent').checked||!proof;}
 button.onclick=async()=>{show();if(!ready())return;try{await loadTurnstile();if(widget===null)widget=turnstile.render(el('ic-challenge'),{sitekey:CENTRAL_CONFIG.turnstileSiteKey,action:'adaptapro-session',callback:t=>{proof=t;enableState();},'expired-callback':()=>{proof=null;enableState();}});status('Completa la comprobación y acepta solo datos demo.');}catch{status('No se pudo cargar la comprobación. Puente pausado.');}};
 el('ic-close').onclick=()=>panel.hidden=true;el('ic-consent').onchange=enableState;
 function pause(){enabled=false;clearInterval(timer);draft=null;el('ic-send').disabled=true;status('Puente pausado. El ciclo automático sigue detenido.');}
 el('ic-disable').onclick=pause;
 el('ic-enable').onclick=async()=>{try{
  if(!ready()||!el('ic-consent').checked||!proof)throw Error('Falta consentimiento o comprobación');
  client=new CentralBridge(CENTRAL_CONFIG.workerURL);
  if(!client.storage.getItem(client.key))await client.start({consent:true,turnstileToken:proof});
  proof=null;el('ic-enable').disabled=true;if(widget!==null)turnstile.reset(widget);
  const manual=document.getElementById('ig-enabled');if(manual?.checked)manual.click();
  enabled=true;clearInterval(AP.cycleTimer);AP.startCycle=function(){clearInterval(this.cycleTimer);};
  el('ic-check').disabled=false;el('ic-clear').disabled=false;status('Chat central activo, sin OAuth por tester. Datos demo; cada mensaje se revisa.');
  await check();clearInterval(timer);timer=setInterval(()=>{if(enabled&&!document.hidden)check();},60000);
 }catch(e){pause();status(e.message);}};
 // Selecting the manual bridge pauses this one; no double sends.
 document.getElementById('ig-enabled')?.addEventListener('change',e=>{if(e.target.checked)pause();});
 AP.ask=async function(text,quiet=false){if(!enabled)return prior(text,quiet);if(quiet)return;try{
  if(!el('ic-consent').checked)throw Error('Consentimiento retirado');if(!AP.db)throw Error('ERP no listo');
  const c=AP.context();const tables={stock:c.stock||[],orders:c.orders||[],proposals:c.proposals||[],suppliers:AP.rows('SELECT s.id,s.name,s.lead_days,sp.sku,sp.unit_cost_cents,sp.min_order_qty FROM suppliers s JOIN supplier_products sp ON sp.supplier_id=s.id WHERE s.active=1')};
  const fields={stock:['sku','on_hand','reserved','available','reorder_point','target_stock','needs_restock'],orders:['order_id','sku','quantity','status','region'],proposals:['id','sku','proposed_qty','status'],suppliers:['id','sku','name','lead_days','unit_cost_cents','min_order_qty']};
  const clean={};for(const[t,keys]of Object.entries(fields))clean[t]=tables[t].slice(0,80).map(r=>Object.fromEntries(keys.filter(k=>r[k]!==undefined).map(k=>[k,r[k]])));
  draft={agent:el('ic-agent').value,question:String(text),context:{tables:clean},reviewed:true,consent:true};
  el('ic-preview').textContent='Desde: fivetech2@gmail.com\nDestino: 3xdy4j@mail.instinct.com\nNO AUTENTICADA · solo análisis demo\n\n'+JSON.stringify(draft,null,2);el('ic-send').disabled=false;status('Revisa cuenta, destinatario, pregunta y snapshot. Nada enviado.');show();
 }catch(e){status(e.message);show();}};
 el('ic-send').onclick=async()=>{if(busy)return;busy=true;el('ic-send').disabled=true;try{if(!enabled||!draft||!el('ic-consent').checked)throw Error('Revisión/consentimiento pendiente');const r=await client.submit(draft);AP.tab('chat');AP.append(draft.question,'user');draft=null;status('Cola aceptó '+r.id+' ('+r.mode+'). No prueba envío ni entrega.');}catch(e){draft=null;status('Resultado de cola pendiente de verificar: '+e.message+'. Comprueba estado; no reenvíes a ciegas.');}finally{busy=false;}};
 async function check(){if(!client)return;try{const x=await client.check();const seen=shown;for(const j of x.jobs||[]){if(j.status==='answered'&&typeof j.text==='string'&&!seen.has(j.id)){
   AP.tab('chat');const node=document.createElement('div');node.className='chat-msg ai';node.textContent='[NO AUTENTICADA · prueba central] '+j.agent+': '+j.text;document.querySelector('.chat-body').append(node);seen.add(j.id);}}
   status('Estado: '+(x.jobs||[]).map(j=>j.agent+' '+j.id.slice(0,8)+' '+j.status).join('; '));
  }catch(e){status(e.message);}}
 el('ic-check').onclick=check;el('ic-clear').onclick=async()=>{if(!confirm('Borrar consulta/respuesta de esta sesión de la cola? No borra las copias de correo.'))return;try{await client.clear();pause();el('ic-check').disabled=true;el('ic-clear').disabled=true;status('Sesión de cola borrada. Copias de correo no borradas.');}catch(e){status(e.message);}};
 globalThis.AdaptaProCentral={show,check,getState:()=>({enabled,configured:ready(),prepared:!!draft})};
}
let turnstileLoad;
function loadTurnstile(){if(globalThis.turnstile)return Promise.resolve();return turnstileLoad||=(new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.onload=resolve;s.onerror=reject;document.head.append(s);}));}
