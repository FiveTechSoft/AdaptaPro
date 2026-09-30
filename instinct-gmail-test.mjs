import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
const {makeRequest,sign,verify,validateResponse,mime,base64url,decode64,compactContext,GmailBridge,ActivityLog,plaintext}=await import('./instinct-gmail.mjs');
let count=0;async function test(name,fn){await fn();console.log('PASS '+(++count)+' '+name);}
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-key-only-32-bytes-minimum-long-enough'),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const input={conversation:'conversation000001',agent:'ALPHA',sequence:1,text:'¿Stock?',context:{stock:[{sku:'A',available:4,email:'hidden@example.test'}],orders:[],suppliers:[],proposals:[]},replyTo:'erp@example.test'};
const req=await sign(makeRequest(input),key);const response=await sign({...req,type:'response',text:'4 unidades'},key);
await test('signature verifies',async()=>assert(await verify(req,key)));
await test('tamper rejected',async()=>assert(!await verify({...req,question:'tamper'},key)));
await test('response verified',async()=>assert.equal(await validateResponse(response,req,key),'4 unidades'));
for(const k of ['id','nonce','conversation','agent','sequence'])await test('routing '+k,async()=>assert.rejects(()=>validateResponse(signDummy(k),req,key)));
function signDummy(k){return {...response,[k]:'wrong'};}
await test('unsigned rejected',async()=>assert.rejects(()=>validateResponse({...response,signature:undefined},req,key)));
await test('expired rejected',async()=>assert.rejects(()=>validateResponse(response,req,key,Date.now()+1000000)));
await test('UTF8 round trip',()=>assert.equal(decode64(base64url('¡España!')),'¡España!'));
await test('header injection blocked',()=>assert.throws(()=>mime(req,'erp@example.test\r\nBcc:a@b.c','dest@example.test')));
await test('PII removed',()=>assert(!JSON.stringify(req).includes('hidden')));
await test('GAMMA no sales orders',()=>assert(!('orders' in compactContext('GAMMA',input.context).tables)));
await test('unknown agent rejected',()=>assert.throws(()=>makeRequest({...input,agent:'ADMIN'})));
await test('MIME multipart plain selection',()=>assert.equal(plaintext({mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:base64url('hello')}},{mimeType:'text/html',body:{data:base64url('<b>hello</b>')}}]}),'hello'));
await test('multiple plain parts rejected',()=>assert.throws(()=>plaintext({parts:[{mimeType:'text/plain',body:{data:base64url('a')}},{mimeType:'text/plain',body:{data:base64url('b')}}]})));
const store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};let log=new ActivityLog(storage,{limit:2});
log.append({event:'send_started',agent:'ALPHA',requestId:req.id,conversation:req.conversation,status:'sending'});log.append({event:'send_uncertain',agent:'ALPHA',requestId:req.id,conversation:req.conversation,status:'uncertain'});log.append({event:'response_rejected',agent:'ALPHA',requestId:req.id,conversation:req.conversation,status:'uncertain'});
await test('log retention bounded',()=>assert.equal(log.state.events.length,2));await test('log truncation disclosed',()=>assert.equal(log.summary().dropped,1));await test('log reload survives',()=>assert.equal(new ActivityLog(storage,{limit:2}).state.next,4));await test('log anomalies included',()=>assert.equal(log.summary().anomalies.length,2));await test('log secret fields omitted',()=>{log.append({event:'oauth_connected',token:'secret'});assert(!JSON.stringify(log.state).includes('secret'));});await test('log interval bounds',()=>assert.throws(()=>log.scheduleReview(()=>{},1)));
const bridge=new GmailBridge({clientId:'test.apps.googleusercontent.com',mailbox:'erp@example.test',destination:'dest@example.test',key,fetchImpl:async()=>({ok:true,json:async()=>({id:'gmail1'})})});bridge.token='test-not-real';bridge.expires=Date.now()+3600000;
await test('review required',()=>assert.rejects(()=>bridge.send(req)));await test('send accepted fixture',async()=>assert.equal((await bridge.send(req,{reviewed:true})).status,'sent'));await test('duplicate blocked',()=>assert.rejects(()=>bridge.send(req,{reviewed:true})));const second=await sign(makeRequest({...input,sequence:2}),key);await test('same conversation pending blocked',()=>assert.rejects(()=>bridge.send(second,{reviewed:true})));
console.log(count+' tests PASS. Local fixtures only, no Gmail calls.');
