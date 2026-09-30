import assert from 'node:assert/strict';
import {validateQuery,validateReply,domainEvidence,BridgeQueue} from './worker.mjs';
import {readFile} from 'node:fs/promises';
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
const sample={consent:true,reviewed:true,agent:'ALPHA',question:'Stock?',context:{tables:{stock:[{sku:'SKU-451',available:6,customer_name:'Private'}]}}};
test('allowlist removes customer field',()=>assert.equal(validateQuery(sample).context.tables.stock[0].customer_name,undefined));
test('requires tester consent',()=>assert.throws(()=>validateQuery({...sample,consent:false})));
test('requires message review',()=>assert.throws(()=>validateQuery({...sample,reviewed:false})));
test('agent routing',()=>assert.throws(()=>validateQuery({...sample,agent:'OTHER'})));
test('bounded snapshot',()=>assert.throws(()=>validateQuery({...sample,context:{tables:{stock:Array(81).fill({})}}})));
test('no nested fields',()=>assert.throws(()=>validateQuery({...sample,context:{tables:{stock:[{sku:{data:'private'}}]}}})));
test('fake Authentication-Results never trusted',()=>assert.equal(domainEvidence({headers:[{name:'Authentication-Results',value:'mx.google.com; dmarc=pass; dkim=pass'}]}).trusted,false));
const now=Date.now(),r={v:'adaptapro.instinct/1',type:'response',scope:'analysis-only',id:'i',nonce:'n',conversation:'c',agent:'ALPHA',sequence:1,created_at:new Date(now).toISOString(),expires_at:new Date(now+10000).toISOString(),text:'Stock'};
const job={request:{...r}};
test('route matches',()=>assert.equal(validateReply(r,job,now),'Stock'));
test('wrong nonce',()=>assert.throws(()=>validateReply({...r,nonce:'wrong'},job,now)));
test('expired response',()=>assert.throws(()=>validateReply({...r,expires_at:new Date(now-1).toISOString()},job,now)));
test('invalid timestamp',()=>assert.throws(()=>validateReply({...r,created_at:'bad'},job,now)));
const cfg=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
test('send off no schedule',()=>{assert.equal(cfg.vars.SEND_ENABLED,'false');assert.equal(cfg.triggers.crons.length,0);});
const queue=new BridgeQueue({}, {SEND_ENABLED:'true'});const reply=await queue.tick();assert.equal(reply.status,403);count++;console.log('PASS response mode disabled blocks send before OAuth');
console.log(count+' fixture tests PASS; no live network or email');
// Durable storage API fixture, not Cloudflare runtime.
const data=new Map();const store={async get(k){return data.get(k);},async put(k,v){data.set(k,structuredClone(v));},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])data.delete(k);},async list({prefix=''}={}){return new Map([...data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));},async getAlarm(){return null;},async setAlarm(){}};
const object=new BridgeQueue({storage:store,blockConcurrencyWhile:fn=>fn()}, {SEND_ENABLED:'false',ERP_MAILBOX:'erp@example.com'});
const session=await (await object.fetch(new Request('https://queue/sessions',{method:'POST'}))).json();
const headers={Authorization:'Bearer '+session.capability,'Content-Type':'application/json'};
const accepted=await object.fetch(new Request('https://queue/jobs',{method:'POST',headers,body:JSON.stringify(sample)}));assert.equal(accepted.status,201);
const result=await (await object.fetch(new Request('https://queue/jobs',{headers}))).json();assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].status,'queued');
const other=await object.fetch(new Request('https://queue/jobs',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}));assert.equal(other.status,401);
await object.fetch(new Request('https://queue/session',{method:'DELETE',headers}));assert.equal(data.size,1); // only global daily budget remains
console.log('PASS storage fixture: admission/job/read/other capability/deletion; not runtime validated');
const {default:worker}=await import('./worker.mjs');const savedFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({success:true,hostname:'fivetechsoft.github.io',action:'adaptapro-session'}),{status:200});
let forwarded=false;
const env={PAGES_ORIGIN:'https://fivetechsoft.github.io',TURNSTILE_SECRET:'fixture-only',TURNSTILE_HOSTNAME:'fivetechsoft.github.io',QUEUE:{idFromName:()=>0,get:()=>({fetch:async req=>{const cloned=new Request(req);assert.equal((await cloned.json()).consent,true);forwarded=true;return new Response(JSON.stringify({fixture:true}),{status:201});}})}};
try{const reply=await worker.fetch(new Request('https://fixture/sessions',{method:'POST',headers:{Origin:env.PAGES_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({consent:true,turnstileToken:'fixture'})}),env);assert.equal(reply.status,201);assert.equal(forwarded,true);console.log('PASS validated request body forwards unconsumed to queue');}finally{globalThis.fetch=savedFetch;}
const fakeEnv={SEND_ENABLED:'true',RESPONSE_MODE:'unverified-test',TEST_JOB_ID:'b'.repeat(32),ERP_MAILBOX:'erp@example.com'};
const guarded=new BridgeQueue({storage:store,blockConcurrencyWhile:fn=>fn()},fakeEnv);
data.set('session:'+await (async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('a'.repeat(64))))].map(x=>x.toString(16).padStart(2,'0')).join(''))(),{id:'fixture-session',expires:Date.now()+10000});
data.set('job:fixture-session:'+'c'.repeat(32),{request:{id:'c'.repeat(32)},status:'queued',expires:Date.now()+10000});
const guardedResponse=await guarded.fetch(new Request('https://fixture/run',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64)},body:JSON.stringify({id:'c'.repeat(32),reviewed:true})}));assert.equal(guardedResponse.status,403);console.log('PASS unselected job cannot run, no Gmail call');
const runId='d'.repeat(32),runKey='job:fixture-session:'+runId;const runEnv={...fakeEnv,TEST_JOB_ID:runId,INSTINCT_MAILBOX:'brain@example.com',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_REFRESH_TOKEN:'fixture'};
data.set(runKey,{request:{id:runId,agent:'ALPHA',expires_at:new Date(Date.now()+100000).toISOString(),question:'demo',context:{}},status:'queued',expires:Date.now()+100000});
let sends=0;globalThis.fetch=async(url,options={})=>{const u=String(url);if(u.includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'fixture'}));if(u.endsWith('/profile'))return new Response(JSON.stringify({emailAddress:runEnv.ERP_MAILBOX}));if(u.endsWith('/messages/send')){sends++;return new Response(JSON.stringify({id:'fixture-send'}));}if(u.includes('/messages?'))return new Response(JSON.stringify({messages:[]}));throw Error('Unexpected network fixture');};
try{const one=new BridgeQueue({storage:store,blockConcurrencyWhile:fn=>fn()},runEnv);const request=()=>new Request('https://fixture/run',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64)},body:JSON.stringify({id:runId,reviewed:true})});const first=await one.fetch(request());assert.equal(first.status,200);assert.equal((await first.json()).status,'sent');await one.fetch(request());assert.equal(sends,1);await one.fetch(new Request('https://fixture/check',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64)},body:JSON.stringify({id:runId})}));assert.equal(sends,1);console.log('PASS selected job sends once; repeated run/check never resend');}finally{globalThis.fetch=savedFetch;}
