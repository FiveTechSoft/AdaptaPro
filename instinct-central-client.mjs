// Unwired browser client. Never auto-installs over the manual UI.
// Embed the reviewed Worker URL and public Turnstile site key only after deployment.
export class CentralBridge {
 constructor(url,{storage=localStorage,fetchImpl=fetch}={}){const u=new URL(url);if(u.protocol!=='https:')throw Error('HTTPS required');this.url=u.origin;this.storage=storage;this.fetch=(...args)=>fetchImpl(...args);this.key='adaptapro-central-capability:'+u.origin;}
 async call(path,method='GET',value){const cap=this.storage.getItem(this.key);const r=await this.fetch(this.url+path,{method,headers:{'Content-Type':'application/json',...(cap?{Authorization:'Bearer '+cap}:{})},body:value===undefined?undefined:JSON.stringify(value)});const x=await r.json();if(!r.ok)throw Error(x.error||'Bridge failed');return x;}
 async start({consent=false,turnstileToken}){if(!consent)throw Error('Explain temporary message storage and mailbox copies before consent');const x=await this.call('/sessions','POST',{consent,turnstileToken});this.storage.setItem(this.key,x.capability);return {session:x.session,expires_at:x.expires_at};}
 async submit({agent,question,context,reviewed=false,consent=false}){return this.call('/jobs','POST',{agent,question,context,reviewed,consent});}
 async check(){return this.call('/jobs');}
 async run(id){return this.call('/run','POST',{id,reviewed:true});}
 async collect(id){return this.call('/check','POST',{id});}
 async clear(){const r=await this.call('/session','DELETE');this.storage.removeItem(this.key);return r;}
}
