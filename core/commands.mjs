export const APCommands = {
  async reset(){if(!await AP.confirmAction('Restablecer solo esta demo','Esto borra permanentemente pedidos, propuestas, decisiones, perfiles y movimientos locales de este navegador y vuelve a cargar el escenario ficticio de julio de 2030. No afecta otros equipos ni sistemas reales.'))return;await new Promise((resolve,reject)=>{const t=AP.store.transaction('database','readwrite');t.objectStore('database').delete('main');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});AP.db?.close();AP.db=null;localStorage.removeItem('adaptapro-notices-read');await AP.init();AP.audit('SISTEMA','demo_restablecida','settings','reset',{origen:'boton_menu'});await AP.persist();AP.note('Datos locales restablecidos.');},
  async decide(id,status){
    const p=AP.one('SELECT * FROM purchase_proposals WHERE id=?',[id]);if(!p)return;
    const check=APCompliance.evaluate(AP,{sku:p.sku,qty:p.proposed_qty,supplier_id:p.supplier_id});if(status==='aprobada'&&check.status==='block'){AP.note('La propuesta sigue bloqueada. '+check.reason,true);return;}
    const input=await AP.decisionForm(`${status==='aprobada'?'Revisión humana y aprobación local':'Rechazar'} ${id}`,`${p.proposed_qty} unidades de ${p.sku} · ${AP.money(p.proposed_qty*p.unit_cost_cents)}. Estado de cumplimiento: ${check.status==='review'?'REVISAR (no conforme certificado)':check.status}. ${check.norm_id||'Sin norma'}: ${check.reason}. Si apruebas, solo cambia el estado de esta propuesta local: no certifica legalidad, no compra ni registra recepción. Indica responsable y motivo de tu revisión.`,true);if(!input)return;if(!input.actor||!input.reason){AP.note('Es obligatorio indicar responsable y motivo de la revisión humana.',true);return;}
    try{const refreshed=APCompliance.evaluate(AP,{sku:p.sku,qty:p.proposed_qty,supplier_id:p.supplier_id});if(status==='aprobada'&&refreshed.status==='block')throw Error('Bloqueo de cumplimiento vigente');AP.tx(()=>{AP.db.run('UPDATE approval_queue SET status=?,decided_by=?,decided_at=?,decision_reason=? WHERE proposal_id=? AND status=?',[status,input.actor,new Date().toISOString(),input.reason,id,'pendiente']);if(!AP.db.getRowsModified())throw Error('La propuesta ya se había decidido');AP.audit(input.actor,'decision_'+status,'purchase_proposal',id,{reason:input.reason,compliance_status:refreshed.status,compliance_norm_id:refreshed.norm_id,compliance_reason:refreshed.reason,human_review:status==='aprobada'&&refreshed.status==='review'});});await AP.persist();AP.render();AP.note('Decisión local registrada: '+status+(status==='aprobada'&&refreshed.status==='review'?' tras revisión humana; no certifica cumplimiento jurídico.':'.'));if(status==='aprobada')APSound.play('approval');}catch(e){AP.note(e.message,true);}
  },
  async receive(id){
    const p=AP.one(`SELECT p.* FROM purchase_proposals p JOIN approval_queue q ON q.proposal_id=p.id WHERE p.id=? AND q.status='aprobada'`,[id]);if(!p)return;
    const input=await AP.decisionForm('Registrar recepción',`${p.proposed_qty} unidades de ${p.sku}. Esto aumentará el stock local; registra la recepción solo cuando la entrega se haya comprobado.`,false);if(!input)return;
    try{AP.tx(()=>{if(AP.one('SELECT id FROM stock_movements WHERE proposal_id=?',[id]))throw Error('Recepción ya registrada');const now=new Date().toISOString();AP.db.run('UPDATE inventory SET on_hand=on_hand+?,updated_at=? WHERE sku=?',[p.proposed_qty,now,p.sku]);AP.db.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?)',['MOV-'+id,p.sku,p.proposed_qty,'recepcion_registrada',id,now]);AP.audit(input.actor,'recepcion_registrada','purchase_proposal',id,{sku:p.sku,quantity:p.proposed_qty});});await AP.persist();AP.render();AP.note('Recepción registrada; existencias actualizadas.');}catch(e){AP.note(e.message,true);}
  },
  async propose(args){
    const sku=String(args.sku||'');const x=AP.one('SELECT * FROM stock_status WHERE sku=?',[sku]);if(!x||!x.needs_restock)throw Error('SKU inexistente o sin necesidad de reposición');
    if(AP.one("SELECT p.id FROM purchase_proposals p JOIN approval_queue q ON q.proposal_id=p.id WHERE p.sku=? AND q.status='pendiente'",[sku]))return 'Ya hay una propuesta pendiente para '+sku;
    AP.setAgentState('gamma','Comparando proveedores',true);
    const supplier=AP.one('SELECT sp.*,s.name,s.lead_days FROM supplier_products sp JOIN suppliers s ON s.id=sp.supplier_id WHERE sp.sku=? AND s.active=1 ORDER BY s.lead_days ASC,sp.unit_cost_cents ASC LIMIT 1',[sku]);AP.setAgentState('gamma',supplier?`Plazo ${supplier.lead_days} días`:'Sin proveedor',false);if(!supplier)throw Error('No hay proveedor activo');
    const qty=Math.max(x.target_stock-x.available,supplier.min_order_qty);const id='PROP-'+Date.now();
    const compliance=APCompliance.evaluate(AP,{sku,qty,supplier_id:supplier.supplier_id});if(compliance.status==='block')throw Error('Propuesta detenida por cumplimiento: '+compliance.reason);const auto=AP.mode==='autonomo'&&compliance.status==='pass';AP.tx(()=>{const now=new Date().toISOString();AP.db.run('INSERT INTO purchase_proposals VALUES(?,?,?,?,?,?,?,?,?)',[id,sku,supplier.supplier_id,qty,supplier.unit_cost_cents,'USD','ALPHA',String(args.reason||'Stock por debajo del punto de reposición').slice(0,500),now]);AP.db.run('INSERT INTO approval_queue(proposal_id,status,decided_by,decided_at,decision_reason) VALUES(?,?,?,?,?)',[id,auto?'aprobada':'pendiente',auto?'modo_automatico':null,auto?now:null,auto?'Aprobación automática local: cumplimiento pass':null]);AP.audit('GAMMA','proveedor_seleccionado','supplier',supplier.supplier_id,{sku,lead_days:supplier.lead_days,unit_cost_cents:supplier.unit_cost_cents});AP.audit('ALPHA','propuesta_creada','purchase_proposal',id,{sku,quantity:qty});AP.db.run('INSERT INTO compliance_checks(proposal_id,status,norm_id,reason,checked_at) VALUES(?,?,?,?,?)',[id,compliance.status,compliance.norm_id,compliance.reason,now]);AP.audit('CUMPLIMIENTO','revision_normativa','purchase_proposal',id,{status:compliance.status,norm_id:compliance.norm_id,reason:compliance.reason});if(auto)AP.audit('modo_automatico','aprobacion_automatica','purchase_proposal',id,{sku,quantity:qty,compliance_status:compliance.status,compliance_reason:compliance.reason});});await AP.persist();AP.render();if(auto)APSound.play('autonomous');return `Propuesta ${id} creada: ${qty} unidades de ${sku} por ${AP.money(qty*supplier.unit_cost_cents)}. ${auto?'Aprobada automáticamente en la base local tras cumplimiento pass.':'Pendiente de aprobación humana y revisión de cumplimiento;'} No se ha efectuado compra ni recepción.`;
  },
  // Único punto de conexión del modelo: cambiar endpoints, modelo o autenticación aquí.
  async modelCall(messages,tools){
    const request=async(endpoint,model)=>{
      const body={model,messages,temperature:0.2,stream:false};if(tools)body.tools=tools;
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
      try{
        const r=await fetch(endpoint+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer public'},body:JSON.stringify(body),signal:controller.signal});
        if(!r.ok)throw Error('Servicio no disponible (HTTP '+r.status+')');
        const j=await r.json();if(!j.choices?.[0]?.message)throw Error('Respuesta vacía');return j.choices[0].message;
      }finally{clearTimeout(timeout);}
    };
    let last;
    for(const endpoint of AP.endpoints){
      let available=[];
      try{const r=await fetch(endpoint+'/models',{headers:{'Authorization':'Bearer public'}});if(r.ok){const j=await r.json();available=(j.data||[]).map(x=>x.id).filter(x=>x.endsWith('-free'));}}catch(e){last=e;}
      const candidates=AP.activeModel?[AP.activeModel,...available.filter(x=>x!==AP.activeModel)]:[AP.model,...available.filter(x=>x!==AP.model)];
      for(const model of candidates){try{const response=await request(endpoint,model);AP.activeModel=model;return response;}catch(e){last=e;}}
    }
    throw last||Error('Servicio no disponible');
  },
  context(){return {stock:AP.rows('SELECT * FROM stock_status'),orders:AP.rows("SELECT l.order_id,l.sku,l.quantity,o.status,o.region FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id"),proposals:AP.rows('SELECT p.id,p.sku,p.proposed_qty,p.rationale,q.status FROM purchase_proposals p JOIN approval_queue q ON p.id=q.proposal_id')};},
  async ask(text,quiet=false){if(AP.busy||!AP.db)return;AP.busy=true;if(!quiet){AP.tab('chat');AP.append(text,'user');}AP.setAgentState('alpha','Analizando',true);AP.note('Analizando con ALPHA...');
    try{
      const tools=[{type:'function',function:{name:'proponer_reposicion',description:'Crear una propuesta local de reposición. La revisión de cumplimiento actual la deja pendiente incluso en Autónomo; no compra ni cambia stock.',parameters:{type:'object',properties:{sku:{type:'string'},reason:{type:'string'}},required:['sku','reason']}}}];
      const messages=[{role:'system',content:'Eres ALPHA, agente de inventario de FiveTech. Responde en español con hechos del contexto. Puedes proponer reposición con la herramienta si el stock está bajo. Nunca digas que has comprado ni recibido mercancía. Describe exactamente el estado de la propuesta en SQLite y el modo actual. No inventes datos ni atribuyas acciones a BETA/GAMMA si no constan en la auditoría. En modo Autónomo el cumplimiento actual exige revisión humana de toda propuesta local nueva; nunca se compra ni se recibe mercancía. No reveles proveedores de modelos.'},{role:'user',content:'Modo actual: '+AP.mode+'. Datos vigentes: '+JSON.stringify(AP.context())+'\nSolicitud: '+text}];
      let m=await AP.modelCall(messages,tools);
      if(m.tool_calls?.length){messages.push(m);for(const c of m.tool_calls.slice(0,2)){let result;try{if(c.function.name!=='proponer_reposicion')throw Error('Herramienta no admitida');result=await AP.propose(JSON.parse(c.function.arguments));}catch(e){result='Error: '+e.message;}messages.push({role:'tool',tool_call_id:c.id,content:result});}m=await AP.modelCall(messages);}
      if(!quiet)AP.append(m.content||'No hubo respuesta del agente.','ai');AP.audit('ALPHA','analisis_completado','agent','ALPHA',{model:AP.activeModel||AP.model});await AP.persist();AP.render();AP.setAgentState('alpha','Disponible',false);AP.note('Análisis finalizado · '+AP.rows("SELECT count(*) AS n FROM approval_queue WHERE status='pendiente'")[0].n+' pendientes');
    }catch(e){if(!quiet)AP.append('No se pudo contactar al agente. Tus datos y propuestas locales siguen disponibles.','ai');AP.setAgentState('alpha','Sin respuesta',false);AP.note('Agente no disponible: '+e.message,true);}finally{AP.busy=false;}
  },
  async cycle(){
    if(!AP.db||AP.cycleBusy||AP.busy||document.hidden||!AP.agentsOn)return;
    const count=AP.one("SELECT count(*) AS n FROM audit_log WHERE action='pedido_generado'").n;
    AP.cycleBusy=true;AP.setAgentState('beta','Registrando pedido',true);
    try{
      const sku=count%2?'SKU-713':'SKU-451',qty=2+(count%3),id='PED-'+(1001+AP.one('SELECT count(*) AS n FROM sales_orders').n),at=new Date().toISOString();
      const product=AP.one('SELECT sale_price_cents FROM products WHERE sku=?',[sku]);
      AP.tx(()=>{AP.db.run('INSERT INTO sales_orders VALUES(?,?,?,?,?)',[id,'Canal digital','España',at,'pendiente']);AP.db.run('INSERT INTO sales_order_lines VALUES(?,?,?,?,?)',[id,1,sku,qty,product.sale_price_cents]);AP.audit('BETA','pedido_generado','sales_order',id,{sku,quantity:qty,source:'motor_local'});});
      await AP.persist();AP.render();AP.setAgentState('beta','Pedido registrado',false);
      if(AP.one('SELECT needs_restock FROM stock_status WHERE sku=?',[sku]).needs_restock){
        AP.setAgentState('alpha','Revisando pedido',true);
        const pending=AP.one("SELECT p.id FROM purchase_proposals p JOIN approval_queue q ON q.proposal_id=p.id WHERE p.sku=? AND q.status IN ('pendiente','aprobada') LIMIT 1",[sku]);
        if(!pending&&Date.now()-AP.lastModelCycleAt>=60000){AP.lastModelCycleAt=Date.now();await AP.ask(`Nuevo pedido ${id}: ${qty} unidades de ${sku}. Revisa stock y decide si hace falta propuesta de reposición.`,true);}
        else AP.setAgentState('alpha',pending?'Propuesta en seguimiento':'En espera',false);
      }
    }finally{AP.cycleBusy=false;}
  },
  startCycle(){
    if(AP.cycleTimer)clearInterval(AP.cycleTimer);
    const el=document.getElementById('ap-cycle');
    if(!AP.agentsOn){AP.cycleTimer=null;if(el)el.textContent='Motor de agentes detenido · sin consumo automático';return;}
    AP.cycleTimer=setInterval(()=>AP.cycle().catch(e=>AP.note('Motor de eventos: '+e.message,true)),AP.cycleIntervalMs);
    if(el)el.textContent='Motor de eventos demo · cada 30 s con la pestaña visible';
  },
  toggleAgents(){AP.agentsOn=!AP.agentsOn;localStorage.setItem('adaptapro-agents',AP.agentsOn?'on':'off');AP.startCycle();AP.updateAgents();AP.note(AP.agentsOn?'Motor de agentes activado.':'Motor de agentes detenido. El chat sigue disponible.');},
  updateAgents(){const b=document.getElementById('ap-agents');if(b){b.textContent=AP.agentsOn?'🤖 Agentes':'⏸ Agentes';b.setAttribute('aria-pressed',String(AP.agentsOn));b.title=AP.agentsOn?'Motor automático activo: analiza y propone con el modelo cuando hace falta. Deténlo para no consumir cuota; el chat sigue respondiendo si escribes.':'Motor automático detenido: ninguna llamada automática al modelo. El chat sigue respondiendo si escribes.';}const c=document.getElementById('ap-cycle');if(c)c.textContent=AP.agentsOn?'Motor de eventos demo · cada 30 s con la pestaña visible':'Motor de agentes detenido · sin consumo automático';},
};
globalThis.APCommands = APCommands;
