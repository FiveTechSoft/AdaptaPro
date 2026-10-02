export const APPolicy = {
  updateMode(){const b=document.getElementById('ap-mode');b.textContent=AP.mode==='autonomo'?'⚡ Autónomo':'👤 Supervisado';b.setAttribute('aria-pressed',AP.mode==='autonomo');b.title=AP.mode==='autonomo'?'Autónomo: analiza y crea propuestas locales nuevas; la capa de cumplimiento actual exige revisión y no las autoaprueba. No compra ni recibe mercancía.':'Supervisado: las propuestas esperan revisión humana.';},
  async toggleMode(){const next=AP.mode==='autonomo'?'supervisado':'autonomo';if(next==='autonomo'&&!await AP.confirmAction('Activar modo autónomo','El modo autónomo ejecuta análisis y crea propuestas locales nuevas, pero la capa de cumplimiento actual exige revisión y no las aprueba automáticamente. No compra ni registra recepciones; las propuestas anteriores siguen pendientes.'))return;const prev=AP.mode;AP.mode=next;localStorage.setItem('adaptapro-mode',next);AP.audit('SISTEMA','modo_cambiado','settings','mode',{from:prev,to:next});AP.updateMode();AP.note('Modo '+next+' activado.');},
  confirmAction(title,detail){return AP.decisionForm(title,detail,false,true).then(Boolean);},
  decisionForm(title,detail,reasonRequired,confirmOnly=false){
    return new Promise(resolve=>{
      const box=document.getElementById('ap-dialog');AP.dialogReturnFocus=document.activeElement;box.hidden=false;
      box.innerHTML=`<form id="ap-decision-form"><h3>${AP.esc(title)}</h3><p>${AP.esc(detail)}</p>${confirmOnly?'':`<label>Responsable<input id="ap-actor" required maxlength="80" autocomplete="name"></label>${reasonRequired?'<label>Motivo<textarea id="ap-reason" required maxlength="500"></textarea></label>':''}`}<div class="ap-dialog-buttons"><button type="button" id="ap-cancel">Cancelar</button><button type="submit">Confirmar</button></div></form>`;
      const close=v=>{box.hidden=true;box.innerHTML='';AP.dialogReturnFocus?.focus();resolve(v);};
      box.querySelector('#ap-cancel').onclick=()=>close(null);box.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close(null)}};
      box.querySelector('form').onsubmit=e=>{e.preventDefault();close(confirmOnly?{}:{actor:box.querySelector('#ap-actor').value.trim(),reason:reasonRequired?box.querySelector('#ap-reason').value.trim():''});};
      (box.querySelector('input')||box.querySelector('#ap-cancel')).focus();
    });
  },
  audit(actor,action,type,id,details){AP.db.run('INSERT INTO audit_log VALUES(?,?,?,?,?,?,?)',[crypto.randomUUID(),new Date().toISOString(),actor,action,type,id,JSON.stringify(details)]);},
};
globalThis.APPolicy = APPolicy;
