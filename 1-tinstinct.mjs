/*
TInstinct JS para FiveTech. Node 22, sin npm ni Harbour.
Ejecutar tests: node tinstinct.mjs --test
Demo local: ERP_ROOT=/ruta/AdaptaPro node tinstinct.mjs
Solo fixtures, no email real ni API oficial. Sin cola durable/autenticidad.
# Timings locales reales, 30 septiembre 2026

5 turnos en Chrome y Node. Relay falso loopback, no latencia de email externo o de modelo. Confirmación aceptada automáticamente SOLO en el test; el tiempo humano de revisión no está incluido.

|Turno|SMTP ms|POP/Answer ms|Puente ms|HTTP navegador ms|Visible total ms|
|---|---:|---:|---:|---:|---:|
|1|11.706|139.601|151.307|158.800|238.500|
|2|0.960|42.239|43.199|46.100|141.000|
|3|1.212|49.221|50.433|53.700|94.500|
|4|1.009|46.310|47.319|54.600|273.000|
|5|1.114|46.339|47.453|51.800|152.800|
|Media|3.200|64.742|67.942|73.000|179.960|
|Peor|11.706|139.601|151.307|158.800|273.000|

Puente incluye SMTP+POP, HTTP incluye puente y ida/vuelta local, visible total mide desde AP.ask hasta completar render, persistencia y el siguiente requestAnimationFrame. Son medidas anidadas, NO sumarlas.

Orden 1..5 y texto correlacionado comprobados, sin mezcla ni bloqueos. La batería prueba respuestas fuera de orden y cola pendiente. 1 aprobación pendiente intacta.

Esto verifica fluidez del transporte local, NO diálogo inteligente entre agentes. Solo hay eco controlado; no asistente/modelo real conectado. No hay memoria de conversación en el adaptador y el ciclo automático está detenido. La confirmación por turno y la latencia real SMTP/POP pueden entorpecer el diálogo. No afirmar que ALPHA/BETA/GAMMA conversan realmente.

*/
import http from "node:http";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
/* Email transport prototype, not an official API. Loopback relays only. */
import net from 'node:net';
import fs from 'node:fs';
import crypto from 'node:crypto';
const idOK=x=>typeof x==='string'&&/^[A-Za-z0-9._-]{1,128}$/.test(x);
const uidOK=x=>typeof x==='string'&&/^[A-Za-z0-9._:@%+-]{1,128}$/.test(x);
const mailOK=x=>typeof x==='string'&&/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(x);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class Lines {
  constructor(socket, timeout, maxBytes) {
    this.socket=socket;this.timeout=timeout;this.maxBytes=maxBytes;this.buffer=Buffer.alloc(0);this.queue=[];this.waiters=[];this.error=null;
    socket.on('data',b=>{this.buffer=Buffer.concat([this.buffer,b]);if(this.buffer.length>maxBytes&&!this.buffer.includes(10))return this.fail(Error('Line too large'));
      let at;while((at=this.buffer.indexOf(10))>=0){const line=this.buffer.subarray(0,at+1);this.buffer=this.buffer.subarray(at+1);if(line.length>maxBytes)return this.fail(Error('Line too large'));const w=this.waiters.shift();if(w){clearTimeout(w.timer);w.resolve(line);}else this.queue.push(line);}
    });socket.on('error',e=>this.fail(e));socket.on('end',()=>this.fail(Error('Connection closed')));
  }
  fail(e){this.error=e;for(const w of this.waiters.splice(0)){clearTimeout(w.timer);w.reject(e);}this.socket.destroy();}
  line(){if(this.queue.length)return Promise.resolve(this.queue.shift());if(this.error)return Promise.reject(this.error);
    return new Promise((resolve,reject)=>{const w={resolve,reject};w.timer=setTimeout(()=>this.fail(Error('Relay timeout')),this.timeout);this.waiters.push(w);});}
  write(s){this.socket.write(s);}
  close(){this.socket.destroy();}
}
async function connect(host,port,timeout,maxBytes){
  if(!['127.0.0.1','localhost'].includes(host))throw Error('Local relay required; unencrypted remote transport forbidden');
  // Resolve localhost to literal loopback, never user-controlled DNS.
  const socket=net.createConnection({host:'127.0.0.1',port});const io=new Lines(socket,timeout,maxBytes);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.destroy();reject(Error('Connection timeout'));},timeout);socket.once('connect',()=>{clearTimeout(timer);resolve();});socket.once('error',e=>{clearTimeout(timer);reject(e);});});return io;
}
async function smtpReply(io,expected){let line,code;
  do{line=(await io.line()).toString('utf8').trimEnd();if(!/^\d{3}[ -]/.test(line))throw Error('Invalid SMTP reply');code=Number(line.slice(0,3));if(code!==expected)throw Error('SMTP '+code);}while(line[3]==='-');
}
export function encodeMail(payload,from,to){
  if(!mailOK(from)||!mailOK(to))throw Error('Invalid mailbox');
  return Buffer.from(`From: ${from}\r\nTo: ${to}\r\nSubject: TInstinct ${payload.id}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(JSON.stringify(payload)).toString('base64').match(/.{1,76}/g).join('\r\n')}\r\n`);
}
function parseMail(raw,maxBytes){
  if(typeof raw==='string')raw=Buffer.from(raw);if(!Buffer.isBuffer(raw)||raw.length>maxBytes)throw Error('Missing or oversized mail');
  const text=raw.toString('utf8').replace(/\r\n/g,'\n');const at=text.indexOf('\n\n');if(at<0)throw Error('Invalid MIME');
  const headers={};for(const line of text.slice(0,at).replace(/\n[ \t]+/g,' ').split('\n')){const m=line.match(/^([^:]+):\s*(.*)$/);if(!m)throw Error('Invalid header');const key=m[1].toLowerCase();if(key in headers)throw Error('Duplicate MIME header');headers[key]=m[2];}
  const ct=headers['content-type']||'';if(!/^text\/plain(?:\s*;|$)/i.test(ct))throw Error('Simple text/plain MIME required');
  const charset=ct.match(/charset\s*=\s*"?([^;"\s]+)/i)?.[1]?.toLowerCase();if(charset&&!['utf-8','us-ascii'].includes(charset))throw Error('Unsupported charset');
  let body=text.slice(at+2),encoding=(headers['content-transfer-encoding']||'7bit').toLowerCase();
  if(encoding==='base64'){const compact=body.replace(/\s/g,'');if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact))throw Error('Invalid base64');body=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(compact,'base64'));}
  else if(encoding==='quoted-printable'){body=body.replace(/=\n/g,'');if(/=(?![A-Fa-f0-9]{2})/.test(body))throw Error('Invalid quoted printable');const bytes=[];for(let i=0;i<body.length;i++){if(body[i]==='='){bytes.push(parseInt(body.slice(i+1,i+3),16));i+=2;}else bytes.push(...Buffer.from(body[i]));}body=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes));}
  else if(!['7bit','8bit'].includes(encoding))throw Error('Unsupported MIME encoding');
  return body.trim();
}
export class TInstinct {
  constructor(from='',token='',to=''){
    Object.assign(this,{cHost:'127.0.0.1',nSmtpPort:25,nPopPort:110,cSmtpUser:'',cSmtpPassword:'',cPopUser:'',cPopPassword:'',cFrom:from,cTo:to,cToken:token,cApp:'JavaScript',nTimeout:5000,nMaxBytes:1048576,nPollEvery:500,cUidlFile:'tinstinct.uidl',cId:'',cSentAt:'',cError:'',aWarnings:[],cLog:'',hSeen:new Set(),aPending:[],bOnAnswer:null,lSeenLoaded:false});this.busy=false;
  }
  LogAdd(s){this.cLog+=new Date().toISOString()+' '+s+'\n';}
  SetError(s){this.cError=s;this.LogAdd('ERROR '+s);}
  SaveLog(file='tinstinct.log'){try{fs.writeFileSync(file,this.cLog,{mode:0o600});return true;}catch{this.SetError('Log persistence failed');return false;}}
  LoadSeen(){if(this.lSeenLoaded)return;try{if(fs.existsSync(this.cUidlFile))for(const uid of fs.readFileSync(this.cUidlFile,'utf8').split(/\r?\n/))if(uidOK(uid))this.hSeen.add(uid);this.lSeenLoaded=true;}catch{throw Error('UIDL read failed');}}
  SaveSeen(seen=this.hSeen){const tmp=this.cUidlFile+'.tmp-'+crypto.randomBytes(8).toString('hex');try{fs.writeFileSync(tmp,[...seen].join('\n')+'\n',{mode:0o600});fs.renameSync(tmp,this.cUidlFile);return true;}catch{try{fs.unlinkSync(tmp);}catch{}return false;}}
  ParseReply(raw,expected){this.cError='';try{const h=JSON.parse(parseMail(raw,this.nMaxBytes));if(!h||typeof h!=='object'||Array.isArray(h)||!idOK(h.id)||typeof h.text!=='string')throw Error('Invalid id/text');if(expected!==undefined&&h.id!==expected)throw Error('ID mismatch');return h;}catch(e){this.SetError('MIME/JSON: '+e.message);return null;}}
  async Send(text,id=crypto.randomBytes(16).toString('hex')){
    this.cError='';let io;
    try{
      if(!this.cTo)throw Error('Missing destination: configure your own Instinct');
      if(!mailOK(this.cFrom)||!mailOK(this.cTo)||typeof text!=='string'||!idOK(id))throw Error('Invalid sender, destination, text or ID');
      if(!Number.isSafeInteger(this.nMaxBytes)||this.nMaxBytes<1)throw Error('Invalid size limit');
      this.cSentAt=new Date().toISOString();const raw=encodeMail({app:this.cApp,id,text,token:this.cToken,sent_at:this.cSentAt},this.cFrom,this.cTo);if(raw.length>this.nMaxBytes)throw Error('Message too large');
      io=await connect(this.cHost,this.nSmtpPort,this.nTimeout,this.nMaxBytes);await smtpReply(io,220);io.write('EHLO localhost\r\n');await smtpReply(io,250);
      if(this.cSmtpUser){io.write('AUTH LOGIN\r\n');await smtpReply(io,334);io.write(Buffer.from(this.cSmtpUser).toString('base64')+'\r\n');await smtpReply(io,334);io.write(Buffer.from(this.cSmtpPassword).toString('base64')+'\r\n');await smtpReply(io,235);}
      io.write('MAIL FROM:<'+this.cFrom+'>\r\n');await smtpReply(io,250);io.write('RCPT TO:<'+this.cTo+'>\r\n');await smtpReply(io,250);io.write('DATA\r\n');await smtpReply(io,354);
      io.write(raw.toString().replace(/^\./gm,'..')+'.\r\n');await smtpReply(io,250);this.cId=id;this.LogAdd('SEND ok id='+id);return true;
    }catch(e){this.SetError(e.message);return false;}finally{io?.close();}
  }
  async PollOnce(limit=20){
    this.cError='';this.aWarnings=[];let io;
    if(this.busy){this.SetError('Concurrent poll forbidden');return null;}this.busy=true;
    try{
      if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('POP limit outside 1..100');
      for(const x of [this.cPopUser,this.cPopPassword])if(typeof x!=='string'||/[\r\n]/.test(x))throw Error('Invalid POP credentials');
      this.LoadSeen();const staged=new Set(this.hSeen),replies=[];
      io=await connect(this.cHost,this.nPopPort,this.nTimeout,this.nMaxBytes);
      const ok=async()=>{const line=(await io.line()).toString('utf8').trimEnd();if(!line.startsWith('+OK'))throw Error('POP command failed');return line;};
      await ok();io.write('USER '+this.cPopUser+'\r\n');await ok();io.write('PASS '+this.cPopPassword+'\r\n');await ok();io.write('STAT\r\n');const stat=await ok();if(!/^\+OK \d+ \d+$/.test(stat))throw Error('Invalid STAT');const count=Number(stat.split(' ')[1]);let processed=0;
      for(let n=1;n<=count;n++){
        io.write('UIDL '+n+'\r\n');const uidline=await ok();const uid=uidline.split(' ')[2];if(!uidOK(uid))throw Error('Invalid UIDL');if(staged.has(uid))continue;if(processed>=limit)break;processed++;
        io.write('RETR '+n+'\r\n');await ok();let size=0;const chunks=[];
        while(true){let line=await io.line();if(line.equals(Buffer.from('.\r\n')))break;if(line[0]===46&&line[1]===46)line=line.subarray(1);size+=line.length;if(size>this.nMaxBytes)throw Error('Mail too large');chunks.push(line);}
        const h=this.ParseReply(Buffer.concat(chunks));staged.add(uid);if(h)replies.push({uid,reply:h});else this.aWarnings.push({uid,error:this.cError});this.cError='';
      }
      if(staged.size!==this.hSeen.size&&!this.SaveSeen(staged))throw Error('UIDL persistence failed');
      this.hSeen=staged;this.LogAdd('POLL new='+replies.length+' warnings='+this.aWarnings.length);return replies;
    }catch(e){this.SetError(e.message);return null;}finally{io?.close();this.busy=false;}
  }
  async Answer(seconds=30,id=this.cId){
    if(!Number.isFinite(seconds)||seconds<1||seconds>3600||!idOK(id)){this.SetError('Invalid wait time or ID');return null;}
    const start=performance.now();let last='';
    while(true){const n=this.aPending.findIndex(x=>x.reply.id===id);if(n>=0){this.cError='';return this.aPending.splice(n,1)[0].reply.text;}if(performance.now()-start>=seconds*1000)break;
      const replies=await this.PollOnce();if(replies){this.aPending.push(...replies);last='';if(replies.length)continue;}else last=this.cError;
      await sleep(Math.min(this.nPollEvery,Math.max(0,seconds*1000-(performance.now()-start))));
    }this.SetError(last||'Timeout waiting for '+id);return null;
  }
  OnAnswer(fn){if(fn!==null&&typeof fn!=='function'){this.SetError('OnAnswer requires a function');return false;}this.bOnAnswer=fn;return true;}
  async Pump(){if(!this.bOnAnswer)return 0;const replies=await this.PollOnce();if(replies)this.aPending.push(...replies);let count=0;while(this.aPending.length&&this.bOnAnswer){const item=this.aPending[0];await this.bOnAnswer(item.reply.text,item.reply.id);this.aPending.shift();count++;}return count;}
}

const BASE=path.dirname(fileURLToPath(import.meta.url));
export async function createBridge({root,port=8765,transport}={}){
 if(process.env.INSTINCT_MODE!=='local-fixture')throw Error('Prototype limited to local fixtures');
 if(!transport)throw Error('Start with the fixture launcher, not a real mailbox');
 const resolved=root&&path.resolve(root);let busy=false;const owner=new TInstinct('app@example.test','LOCAL-DEMO-NOT-A-SECRET','reply@example.test');
 Object.assign(owner,transport,{cApp:'AdaptaPro'});
 const server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  let timings;const reply=(status,p)=>{if(timings)res.setHeader('Server-Timing',Object.entries(timings).map(([k,v])=>k+';dur='+v.toFixed(3)).join(', '));res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(p));};
  if(req.headers.host!==origin.slice(7))return reply(403,{error:'Host rejected'});
  if(req.method==='GET'){
   let filename;
   if(req.url==='/integrations/instinct/erp-adapter.js')filename=path.join(BASE,'erp-adapter.js');
   else if(resolved&&['/','/index.html'].includes(req.url)){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(resolved,'index.html'),'utf8')+'\n<script src="/integrations/instinct/erp-adapter.js"></script>\n');
   }else if(resolved&&/^\/(data|assets)\//.test(req.url)){
    let clean;try{clean=decodeURIComponent(req.url.split('?')[0]);}catch{return reply(400,{error:'Invalid path'});}filename=path.resolve(resolved,'.'+clean);
    if(!['data','assets'].some(dir=>filename.startsWith(path.join(resolved,dir)+path.sep)))return reply(403,{error:'Path rejected'});
   }else return reply(404,{error:'Not found'});
   try{const raw=filename===path.join(BASE,'erp-adapter.js')?Buffer.from(ERP_ADAPTER):fs.readFileSync(filename);res.writeHead(200,{'Content-Type':filename.endsWith('.js')?'text/javascript':filename.endsWith('.json')?'application/json':'text/plain'});return res.end(raw);}catch{return reply(404,{error:'Not found'});}
  }
  if(req.method!=='POST'||req.url!=='/api/instinct/messages')return reply(404,{error:'Not found'});
  if(req.headers.origin!==origin)return reply(403,{error:'Origin rejected'});
  if(req.headers['content-type']!=='application/json')return reply(415,{error:'JSON required'});
  if(!/^\d+$/.test(req.headers['content-length']||'')||Number(req.headers['content-length'])>65536||Number(req.headers['content-length'])<1)return reply(413,{error:'Size limit'});
  let p;try{const chunks=[];let n=0;for await(const b of req){n+=b.length;if(n>65536)throw Error();chunks.push(b);}p=JSON.parse(Buffer.concat(chunks));if(!p||Object.keys(p).join()!=='text'||typeof p.text!=='string'||!p.text.length||p.text.length>20000)throw Error();}catch{return reply(400,{error:'Invalid request'});}
  if(busy)return reply(409,{error:'One request at a time'});busy=true;
  try{const start=performance.now();const accepted=await owner.Send(p.text);const sent=performance.now();timings={smtp:sent-start};if(!accepted)return reply(202,{status:'uncertain'});const id=owner.cId,text=await owner.Answer(10,id);const answered=performance.now();timings.pop_answer=answered-sent;timings.bridge=answered-start;return reply(text===null?202:200,text===null?{id,status:'accepted_pending'}:{id,status:'answered',text});}
  catch{return reply(202,{status:'uncertain'});}finally{busy=false;}
 });
 server.requestTimeout=25000;server.headersTimeout=10000;
 await new Promise(r=>server.listen(port,'127.0.0.1',r));return {server,owner,url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};
}
export async function fixtures({concise=false}={}){
 const boxes=[{uid:'fixture-001',raw:Buffer.from('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n{"id":"fixture-001","text":"respuesta POP3"}\r\n')},{uid:'not-json',raw:Buffer.from('Content-Type: text/plain\r\n\r\nnot json\r\n')}];
 let fault=false;const servers=[];
 for(const kind of ['smtp','reject','pop']){
  const server=net.createServer(socket=>{let buffer='',data=null;const snapshot=[...boxes];socket.write(kind==='pop'?'+OK fixture\r\n':'220 fixture\r\n');
   socket.on('data',chunk=>{buffer+=chunk.toString();let i;while((i=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+2);
    if(data!==null){if(line!=='.'){data+=line+'\r\n';continue;}const json=JSON.parse(Buffer.from(data.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString());boxes.push({uid:'echo-'+json.id,raw:encodeMail({id:json.id,text:'eco local: '+(concise?(json.text.split('Solicitud: ').at(-1)):json.text)},'reply@example.test','app@example.test')});data=null;socket.write('250 accepted\r\n');continue;}
    const [cmd,arg]=line.split(' ');
    if(kind!=='pop'){
     if(cmd==='EHLO')socket.write('250-local fixture\r\n250 OK\r\n');else if(['MAIL','RCPT','RSET'].includes(cmd))socket.write('250 OK\r\n');else if(cmd==='DATA'){if(kind==='reject')socket.write('451 temporary\r\n');else{data='';socket.write('354 go\r\n');}}else socket.write('500 unsupported\r\n');
    }else{
     if(['USER','PASS','RSET'].includes(cmd))socket.write('+OK\r\n');
     else if(cmd==='STAT')socket.write(`+OK ${snapshot.length} 999\r\n`);
     else if(cmd==='UIDL')socket.write(`+OK ${arg} ${snapshot[Number(arg)-1].uid}\r\n`);
     else if(cmd==='RETR'){
      if(fault&&Number(arg)===snapshot.length){socket.write('-ERR fault\r\n');continue;}
      socket.write('+OK\r\n');socket.write(snapshot[Number(arg)-1].raw.toString().replace(/^\./gm,'..'));socket.write('.\r\n');
     }else socket.write('-ERR unsupported\r\n');
    }
   }});socket.on('error',()=>{});
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);
 }
 return {smtp:servers[0].address().port,reject:servers[1].address().port,pop:servers[2].address().port,boxes,setFault(x){fault=x;},close:()=>Promise.all(servers.map(s=>new Promise(r=>s.close(r))))};
}
const ERP_ADAPTER="/* Local FiveTech integration. Replies are inert text, never tool calls. */\n(() => {\n  if (location.hostname !== '127.0.0.1' || location.protocol !== 'http:') throw Error('Local bridge only');\n  if (typeof AP === 'undefined') throw Error('AdaptaPro AP interface missing');\n  // Stop automatic mail generation. Local ERP proposals and approvals are unchanged.\n  clearInterval(AP.cycleTimer);\n  AP.startCycle = function () { clearInterval(this.cycleTimer); const label=document.getElementById('ap-cycle'); if(label) label.textContent='Transporte de correo local de prueba \u00b7 ciclo autom\u00e1tico detenido'; };\n  AP.modelCall = async function (messages) {\n    const text = messages.map(m => `[${m.role}]\\n${m.content || ''}`).join('\\n\\n');\n    if (text.length > 20000) throw Error('Mensaje demasiado grande');\n    if (!window.confirm('Transporte de correo local de prueba. Se enviar\u00e1 el texto y el contexto del ERP al destino configurado en el servidor. Rev\u00edsalo antes de continuar:\\n\\n'+text)) throw Error('Env\u00edo cancelado');\n    const response = await fetch('/api/instinct/messages', {\n      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text})\n    });\n    const result = await response.json();\n    if (!response.ok || result.status !== 'answered' || typeof result.text !== 'string')\n      throw Error('Sin respuesta confirmada. No reintentes a ciegas; revisa el relay.');\n    this.activeModel = 'transporte-correo-local';\n    return {role:'assistant',content:result.text};\n  };\n})();\n";

async function testTransport(){
const f=await fixtures(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'tinstinct-'));let checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++;console.log('PASS '+label);};
const make=()=>Object.assign(new TInstinct('app@example.test','LOCAL-DEMO-NOT-A-SECRET','reply@example.test'),{nSmtpPort:f.smtp,nPopPort:f.pop,cPopUser:'local-user',cPopPassword:'local-password',cUidlFile:path.join(dir,'seen'),nPollEvery:10,nTimeout:1000});
try{
const o=make(),empty=new TInstinct('app@example.test','fake');
check(!await empty.Send('x'),'No destination no send');check(empty.cError.includes('own Instinct'),'Destination error');
const text='Hola Instinct: "JavaScript" euro €\n.segunda linea';
check(await o.Send(text,'test-001'),'SMTP accepted');check(o.cId==='test-001','Saved ID');check(!Number.isNaN(Date.parse(o.cSentAt))&&o.cSentAt.endsWith('Z'),'UTC timestamp');
check(!await o.Send('x','bad\r\nBcc:x'),'ID injection');o.cFrom='bad\ninjection';check(!await o.Send('x'),'Header injection');o.cFrom='app@example.test';
o.cHost='smtp.example.test';check(!await o.Send('x'),'Remote SMTP rejected');o.cHost='127.0.0.1';o.nSmtpPort=f.reject;check(!await o.Send('x','test-451'),'SMTP 451 not success');check(o.cLog.includes('451'),'451 log');o.nSmtpPort=1;check(!await o.Send('x'),'Unavailable connection');o.nSmtpPort=f.smtp;
const raw=encodeMail({id:'test-001',text:'respuesta local'},'reply@example.test','app@example.test');let h=o.ParseReply(raw,'test-001');check(!!h,'MIME base64');check(h.text==='respuesta local','Exact reply');check(o.ParseReply(raw,'other')===null,'Correlation mismatch');
for(const body of ['{"id":"test-001","text":"x"} garbage','{"id":42,"text":[]}','{"id":"test-001"}'])check(o.ParseReply('Content-Type: text/plain\r\n\r\n'+body)===null,'Malformed JSON/types rejected');
let a=await o.PollOnce();check(Array.isArray(a),'POP connects');check(a.length===2,'Two valid replies');check(a[0].uid==='fixture-001','UIDL');check(a[0].reply.text==='respuesta POP3','Quoted printable');check(a[1].uid==='echo-test-001','Echo ID');check(a[1].reply.text==='eco local: '+text,'UTF8 exact');check(o.aWarnings.length===1,'Invalid mail warning');check((await o.PollOnce()).length===0,'Repeated poll empty');check(fs.existsSync(o.cUidlFile),'UIDL persisted');check((await make().PollOnce()).length===0,'Dedup across instances');
check(await o.Send(text,'test-777'),'Second send');check(await o.Answer(5)==='eco local: '+text,'Answer correlation');check(await o.Answer(1,'no-reply')===null&&!!o.cError,'Timeout');check(await o.Send('automatic'),'Automatic send');check(/^[a-f0-9]{32}$/.test(o.cId),'Automatic ID');check(await o.Answer(5)==='eco local: automatic','Auto ID roundtrip');
check(!o.OnAnswer('not function'),'Bad callback');let got='';check(o.OnAnswer((t,id)=>{got=t+'@'+id;}),'Register callback');check(await o.Send(text,'async'),'Callback send');check(await o.Pump()===1&&got==='eco local: '+text+'@async','Pump callback');
for(let n=1;n<=25;n++)check(await o.Send('page '+n,'page-'+n),'Page send '+n);
a=await o.PollOnce(20);check(a.length===20,'First page beyond old mail');a=await o.PollOnce(20);check(a.length===5,'Second page five');
check(await o.Send('reply B','order-B'),'Send B');check(await o.Send('reply A','order-A'),'Send A');check(await o.Answer(5,'order-A')==='eco local: reply A','Answer A');check(await o.Answer(5,'order-B')==='eco local: reply B','Retain B');check(await o.Send('callback','queue-P'),'Send queued callback');check(await o.Send('waited','queue-A'),'Send waited');check(await o.Answer(5,'queue-A')==='eco local: waited','Keep callback');check(await o.Pump()===1&&got==='eco local: callback@queue-P','Drain pending');check(o.OnAnswer(null),'Clear callback');check(await o.Send('no callback','none'),'Send no callback');check(await o.Pump()===0,'No receiver no consume');check(await o.Answer(5,'none')==='eco local: no callback','Answer unconsumed');
for(const n of [0,101,'20',1.5,NaN])check(await o.PollOnce(n)===null,'Invalid POP limit '+n);o.cHost='pop.example.test';check(await o.PollOnce()===null,'Remote POP rejected');o.cHost='127.0.0.1';check(o.SaveLog(path.join(dir,'test.log')),'SaveLog');
// Additional loss regression: partial failure must not commit any UIDL.
check(await o.Send('partial first','partial-1'),'Partial first send');check(await o.Send('partial second','partial-2'),'Partial second send');f.setFault(true);check(await o.PollOnce()===null,'Partial RETR fails');check(!o.hSeen.has('echo-partial-1'),'No partial dedup commit');f.setFault(false);check((await o.PollOnce()).length===2,'Recover both replies');
o.cUidlFile=path.join(dir,'missing','seen');check(await o.Send('persist','persist'),'Persistence test send');check(await o.PollOnce()===null,'Persistence failure surfaced');check(!o.hSeen.has('echo-persist'),'Failed save not committed');
check(o.ParseReply('Content-Type: multipart/mixed\r\n\r\n{}')===null,'Multipart rejected');check(o.ParseReply('Content-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n!!!')===null,'Invalid base64');
console.log(`ALL ${checks} CHECKS PASSED`);
}finally{await f.close();fs.rmSync(dir,{recursive:true,force:true});}
}

async function testHTTP(){
process.env.INSTINCT_MODE='local-fixture';const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-'));const f=await fixtures();const b=await createBridge({port:0,transport:{nSmtpPort:f.smtp,nPopPort:f.pop,cUidlFile:path.join(dir,'seen'),cPopUser:'local-user',cPopPassword:'local-password'}});let n=0;
const req=(body,extra={})=>new Promise((resolve,reject)=>{const r=http.request(b.url+'/api/instinct/messages',{method:'POST',headers:{Origin:b.url,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),...extra}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(Buffer.concat(chunks))}));});r.on('error',reject);r.end(body);});
const check=(x,label)=>{assert.ok(x,label);n++;console.log('PASS '+label);};
try{
 let r=await req(JSON.stringify({text:'AdaptaPro € "local"\n.segunda'}));check(r.status===200,'Bridge status');let p=await r.json();check(p.text==='eco local: AdaptaPro € "local"\n.segunda','Bridge exact roundtrip');check(/^[a-f0-9]{32}$/.test(p.id),'Bridge ID');
 for(const [body,headers,status,label]of [ ['{"text":"x"}',{Origin:'https://evil.invalid'},403,'Origin'],['{"text":"x"}',{Host:'evil.invalid'},403,'Host'],['bad',{},400,'JSON'],['{"text":"x","to":"other@example.test"}',{},400,'No destination override'],['x'.repeat(65537),{},413,'Size'],['{"text":"x"}',{'Content-Type':'text/plain'},415,'Content type']])check((await req(body,headers)).status===status,label);
 const old=b.owner.Send;b.owner.Send=async()=>{await new Promise(r=>setTimeout(r,100));return false;};const first=req('{"text":"one"}');await new Promise(r=>setTimeout(r,20));check((await req('{"text":"two"}')).status===409,'Concurrent request');await first;b.owner.Send=old;
 console.log(`ALL ${n} HTTP CHECKS PASSED`);
}finally{await b.close();await f.close();fs.rmSync(dir,{recursive:true,force:true});}
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 if(process.argv.includes('--test')) { await testTransport();await testHTTP(); }
 else {
  if(!process.env.ERP_ROOT)throw Error('Set ERP_ROOT to a local FiveTech checkout');
  process.env.INSTINCT_MODE='local-fixture';const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adaptapro-mail-'));
  const f=await fixtures({concise:process.env.INSTINCT_TEST_CONCISE==='1'});const b=await createBridge({root:process.env.ERP_ROOT,transport:{nSmtpPort:f.smtp,nPopPort:f.pop,cPopUser:'local-user',cPopPassword:'local-password',cUidlFile:path.join(dir,'seen')}});
  console.log('Local fixture ERP: '+b.url+' (no real mail)');
  async function close(){await b.close();await f.close();fs.rmSync(dir,{recursive:true,force:true});process.exit();}
  process.on('SIGINT',close);process.on('SIGTERM',close);
 }
                                                                                                                                                                                                                                                              }
