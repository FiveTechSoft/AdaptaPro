// PREPARED, NOT DEPLOYED. Send and response acceptance disabled by default.
const VERSION='adaptapro.instinct/1', TTL=24*60*60*1000;
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=()=>crypto.randomUUID().replaceAll('-','');
const validId=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const encode=x=>btoa(String.fromCharCode(...new TextEncoder().encode(x))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=x=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(x.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-x.length%4)%4)),c=>c.charCodeAt(0)));
async function hash(x){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function capability(req){const x=req.headers.get('Authorization')||'';if(!/^Bearer [a-f0-9]{64}$/.test(x))throw Error('Access denied');return x.slice(7);}
export function validateQuery(x){
 if(!x||x.consent!==true||x.reviewed!==true||!['ALPHA','BETA','GAMMA'].includes(x.agent)||typeof x.question!=='string'||!x.question.trim()||x.question.length>6000)throw Error('Review and consent required');
 // Explicit table/field allowlist; no customer names, personnel, credentials or full DB.
 const tables=x.context?.tables;if(!tables||typeof tables!=='object')throw Error('Snapshot required');
 const fields={stock:['sku','on_hand','reserved','available','reorder_point','target_stock','needs_restock'],orders:['order_id','sku','quantity','status','region'],proposals:['id','sku','proposed_qty','status'],suppliers:['id','sku','name','lead_days','unit_cost_cents','min_order_qty']};
 const clean={};for(const [t,keys]of Object.entries(fields)){
  const rows=tables[t]||[];if(!Array.isArray(rows)||rows.length>80)throw Error('Too many rows');
  clean[t]=rows.map(r=>{if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Bad row');const out={};for(const k of keys)if(r[k]!==undefined){const v=r[k];if(!['string','number','boolean'].includes(typeof v)||typeof v==='string'&&v.length>150||typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>1e12))throw Error('Bad field');out[k]=v;}return out;});
 }
 if(JSON.stringify(clean).length>30000)throw Error('Snapshot too large');
 return {agent:x.agent,question:x.question,context:{mode:'supervisado',currency:'USD',snapshot_at:new Date().toISOString(),tables:clean},consent:true,reviewed:true};
}
export function plain(payload){const parts=[];function walk(p){if(p.mimeType==='text/plain'&&p.body?.data)parts.push(decode(p.body.data));for(const c of p.parts||[])walk(c);}walk(payload);if(parts.length!==1||parts[0].length>60000)throw Error('Unique plain JSON required');return parts[0];}
export function validateReply(value,job,now=Date.now()){
 if(value?.v!==VERSION||value.type!=='response'||value.scope!=='analysis-only')throw Error('Protocol');
 for(const k of ['id','nonce','conversation','agent','sequence'])if(value[k]!==job.request[k])throw Error('Correlation');
 const created=Date.parse(value.created_at),expires=Date.parse(value.expires_at);
 if(!Number.isFinite(created)||!Number.isFinite(expires)||created>now+60000||expires<now||expires>Date.parse(job.request.expires_at)||now>Date.parse(job.request.expires_at))throw Error('Expiry');
 if(typeof value.text!=='string'||!value.text.trim()||value.text.length>16000)throw Error('Reply text');return value.text;
}
export function domainEvidence(payload){
 // Diagnostic only. Raw Authentication-Results can be forged or duplicated.
 // Never turn a parsed string into trusted author/domain proof.
 const headers=(payload.headers||[]).filter(h=>h.name.toLowerCase()==='authentication-results');
 return {trusted:false,count:headers.length,reason:'trusted Google evaluation adapter not implemented'};
}
async function token(env){
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('OAuth unavailable');const x=await r.json();if(!x.access_token)throw Error('OAuth unavailable');return x.access_token;
}
async function gmail(access,path,options={}){const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{...options,headers:{Authorization:'Bearer '+access,...options.headers},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Gmail unavailable');return r.json();}
export default {
 async fetch(req,env){
  const origin=req.headers.get('Origin');if(origin!==env.PAGES_ORIGIN)return json({error:'Origin not allowed'},403);
  const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  let result,stage='input';
  try{
   const url=new URL(req.url);if(!['/sessions','/jobs','/session','/run','/check'].includes(url.pathname))return json({error:'Not found'},404);
   const length=Number(req.headers.get('Content-Length')||0);if(length>45000)throw Error('Payload too large');
   if(req.method==='POST'&&url.pathname==='/sessions'){
    const body=await req.clone().text();if(body.length>3000)throw Error('Payload too large');const x=JSON.parse(body);
    if(x.consent!==true||!env.TURNSTILE_SECRET)throw Error('Consent and admission required');
    stage='admission';const checked=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:x.turnstileToken||'',remoteip:req.headers.get('CF-Connecting-IP')||''}),signal:AbortSignal.timeout(15000)});
    const verdict=await checked.json();if(!verdict.success||verdict.hostname!==env.TURNSTILE_HOSTNAME||verdict.action!=='adaptapro-session')throw Error('Admission failed');
   }else capability(req);
   stage='queue';result=await env.QUEUE.get(env.QUEUE.idFromName('central-private-v1')).fetch(req);
  }catch{result=json({error:'Request rejected',stage},400);}
  const out=new Response(result.body,result);for(const[k,v]of Object.entries(cors))out.headers.set(k,v);return out;
 },
 async scheduled(event,env,ctx){ctx.waitUntil(env.QUEUE.get(env.QUEUE.idFromName('central-private-v1')).fetch(new Request('https://queue.internal/tick',{method:'POST'})));}
};
export class BridgeQueue{
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(req){return this.ctx.blockConcurrencyWhile(async()=>{
  try{
   const url=new URL(req.url),now=Date.now();await this.purge(now);
   if(url.pathname==='/tick')return await this.tick();
   if(url.pathname==='/sessions'&&req.method==='POST'){
    // Central daily budget prevents per-session reset abuse; Turnstile at outer boundary.
    const day=new Date().toISOString().slice(0,10),budget=await this.ctx.storage.get('budget:'+day)||{sessions:0,sends:0};
    if(budget.sessions>=30)return json({error:'Daily session limit'},429);
    const cap=uuid()+uuid(),sid=uuid(),key=await hash(cap);budget.sessions++;
    await this.ctx.storage.put('budget:'+day,budget);
    await this.ctx.storage.put('session:'+key,{id:sid,created:now,expires:now+TTL,count:0,last:0});const alarm=await this.ctx.storage.getAlarm();await this.ctx.storage.setAlarm(Math.min(alarm||now+TTL,now+TTL));
    return json({capability:cap,session:sid,expires_at:new Date(now+TTL).toISOString(),retention_hours:24},201);
   }
   const key=await hash(capability(req)),session=await this.ctx.storage.get('session:'+key);if(!session||session.expires<=now)return json({error:'Session expired'},401);
   const prefix='job:'+session.id+':';
   if(req.method==='POST'&&['/run','/check'].includes(url.pathname)){
    const raw=await req.text();if(raw.length>2000)throw Error('Size');const x=JSON.parse(raw);if(!validId(x.id))throw Error('ID');
    const job=await this.ctx.storage.get(prefix+x.id);if(!job)return json({error:'Job not found'},404);
    if(url.pathname==='/run'&&(x.reviewed!==true||this.env.TEST_JOB_ID!==x.id))return json({error:'Only the owner-selected reviewed test job may run'},403);
    return this.tick({selectedKey:prefix+x.id,allowSend:url.pathname==='/run'});
   }
   if(req.method==='DELETE'&&url.pathname==='/session'){const jobs=await this.ctx.storage.list({prefix});await this.ctx.storage.delete([...jobs.keys(),'session:'+key]);return json({deleted:true,note:'Mailbox copies are retained separately'});}
   if(req.method==='GET'&&url.pathname==='/jobs'){const jobs=await this.ctx.storage.list({prefix});return json({jobs:[...jobs.values()].map(j=>({id:j.request.id,agent:j.request.agent,status:j.status,text:j.text||null,authentication:j.authentication||null,created_at:j.request.created_at,expires_at:j.request.expires_at})),expires_at:new Date(session.expires).toISOString()});}
   if(req.method==='POST'&&url.pathname==='/jobs'){
    if(session.count>=10||now-session.last<60000)return json({error:'Session rate limit'},429);
    const raw=await req.text();if(raw.length>45000)throw Error('Size');const x=validateQuery(JSON.parse(raw));
    const old=await this.ctx.storage.list({prefix});if([...old.values()].some(j=>['queued','sending','sent','uncertain'].includes(j.status)))return json({error:'Pending or uncertain turn'},409);
    const id=uuid(),request={v:VERSION,type:'request',scope:'analysis-only',authentication:'central-test-unverified',id,nonce:uuid(),conversation:session.id,agent:x.agent,sequence:session.count+1,created_at:new Date(now).toISOString(),expires_at:new Date(now+60*60*1000).toISOString(),reply_to:this.env.ERP_MAILBOX,question:x.question,context:x.context,history:[]};
    await this.ctx.storage.put(prefix+id,{request,status:'queued',expires:session.expires,created:now});session.count++;session.last=now;await this.ctx.storage.put('session:'+key,session);
    return json({id,status:'queued',mode:this.env.SEND_ENABLED==='true'?'send-enabled':'dry-run'},201);
   }
   return json({error:'Not found'},404);
  }catch{return json({error:'Operation failed'},400);}
 });}
 async purge(now){const items=await this.ctx.storage.list();const keys=[];for(const[k,v]of items)if((k.startsWith('session:')||k.startsWith('job:'))&&v.expires<=now||k.startsWith('budget:')&&k.slice(7)<new Date(now-TTL).toISOString().slice(0,10))keys.push(k);if(keys.length)await this.ctx.storage.delete(keys);}
 async alarm(){await this.purge(Date.now());const items=await this.ctx.storage.list({prefix:'session:'});if(items.size)await this.ctx.storage.setAlarm(Math.min(...[...items.values()].map(s=>s.expires)));}
 async tick({selectedKey=null,allowSend=false}={}){
  // Scheduled events are serialized inside the single object; additionally block
  // interleaving during Gmail awaits. No retries of sending/uncertain states.
  if(this.running)return json({busy:true});this.running=true;
  try{
   if(allowSend&&this.env.SEND_ENABLED!=='true')return json({dry_run:true,send:false});
   if(!selectedKey)return json({error:'No scheduled sending: select a single test job'},403);
   // Readiness gate cannot be bypassed with a configuration flag.
   if(this.env.RESPONSE_MODE!=='unverified-test')return json({error:'No approved response mode; sending blocked'},503);
   const access=await token(this.env),profile=await gmail(access,'profile');if(profile.emailAddress!==this.env.ERP_MAILBOX)throw Error('Wrong OAuth account');
   const selected=await this.ctx.storage.get(selectedKey);if(!selected)return json({error:'Job not found'},404);
   const jobs=new Map([[selectedKey,selected]]),now=Date.now();
   const day=new Date().toISOString().slice(0,10),budget=await this.ctx.storage.get('budget:'+day)||{sessions:0,sends:0};
   let sent=0,blocked=0;
   let polled=0;
   for(const[key,j]of jobs){
    if(Date.parse(j.request.expires_at)<now){if(j.status!=='answered'){j.status='expired';await this.ctx.storage.put(key,j);}continue;}
    if(allowSend&&j.request.id===this.env.TEST_JOB_ID&&j.status==='queued'&&budget.sends<30&&sent<1){
     budget.sends++;await this.ctx.storage.put('budget:'+day,budget);
     j.status='sending';await this.ctx.storage.put(key,j);
     try{
      const body=encode(JSON.stringify(j.request)).replaceAll('-','+').replaceAll('_','/');const padded=body+'='.repeat((4-body.length%4)%4);
      const mime=`From: ${this.env.ERP_MAILBOX}\r\nTo: ${this.env.INSTINCT_MAILBOX}\r\nSubject: AdaptaPro ${j.request.agent} ${j.request.id}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${padded}\r\n`;
      const r=await gmail(access,'messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:encode(mime)})});j.status='sent';j.gmailId=r.id;j.sentAt=new Date().toISOString();sent++;
     }catch{j.status='uncertain';}
     await this.ctx.storage.put(key,j);
    }
    if(!['sent','uncertain'].includes(j.status)||polled>=2)continue;polled++;
    const query=`from:${this.env.INSTINCT_MAILBOX} to:${this.env.ERP_MAILBOX} subject:${j.request.id}`;
    const list=await gmail(access,'messages?maxResults=3&q='+encodeURIComponent(query));
    for(const m of list.messages||[]){
     const mail=await gmail(access,'messages/'+m.id+'?format=full');if((mail.labelIds||[]).some(x=>['SPAM','TRASH'].includes(x)))continue;
     // Fail closed: no string/header-based verification presented as trusted.
     const evidence=domainEvidence(mail.payload);
     if(this.env.RESPONSE_MODE!=='unverified-test'){blocked++;continue;}
     const headers=mail.payload.headers||[];
     const exact=(name,address)=>{const values=headers.filter(h=>h.name.toLowerCase()===name).map(h=>h.value.trim());return values.length===1&&(values[0]===address||new RegExp('^[^<>\\r\\n,]*<'+address.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'>$').test(values[0]));};
     if(!exact('from',this.env.INSTINCT_MAILBOX)||!exact('to',this.env.ERP_MAILBOX)||headers.some(h=>['cc','bcc'].includes(h.name.toLowerCase())&&h.value.trim())||headers.some(h=>h.name.toLowerCase()==='reply-to')&&!exact('reply-to',this.env.INSTINCT_MAILBOX)){blocked++;continue;}
     const subjects=headers.filter(h=>h.name.toLowerCase()==='subject');if(subjects.length!==1||!subjects[0].value.includes(j.request.id)){blocked++;continue;}
     // Future trusted adapter must also bind exact From/To/Reply-To and audience.
     let text;try{text=validateReply(JSON.parse(plain(mail.payload)),j);}catch{blocked++;continue;}j.status='answered';j.text=text;j.authentication='NO AUTENTICADA · prueba central';j.responseGmailId=m.id;delete j.request.context;delete j.request.question;await this.ctx.storage.put(key,j);break;
    }
   }
   const current=await this.ctx.storage.get(selectedKey);return json({sent,blocked,id:current.request.id,status:current.status,text:current.text||null,authentication:current.authentication||null,domain_adapter:'not-implemented'});
  }catch{return json({error:'Worker stopped; reconcile Gmail before retry'},503);}
  finally{this.running=false;}
 }
  }
