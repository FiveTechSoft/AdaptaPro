const APCatalog = {
  propuesta_crear: { modes: ['supervisado', 'autonomo'], keys: ['sku', 'reason'], run: p => AP.propose(p) },
  propuesta_decidir: { modes: ['supervisado', 'autonomo'], keys: ['id', 'status'], run: p => AP.decide(p.id, p.status) },
  recepcion_registrar: { modes: ['supervisado'], keys: ['id'], run: p => AP.receive(p.id) },
  pedido_generar: { modes: ['supervisado', 'autonomo'], keys: [], run: () => AP.cycle() },
};
const APCmdModes = ['supervisado', 'autonomo'];
const APCmdStr = (v, min, max, label) => {
  if (typeof v !== 'string' || v.length < min || v.length > max) throw Error(label + ' debe ser texto de ' + min + '..' + max + ' caracteres');
  return v;
};
const APBus = {
  async command(spec) {
    const { cmd, payload, actor, mode } = spec || {};
    const entry = APCatalog[String(cmd || '')];
    if (!entry) throw Error('Comando no admitido: ' + String(cmd));
    if (!APCmdModes.includes(AP.mode)) throw Error('Modo activo no reconocido: ' + AP.mode);
    if (mode !== undefined && mode !== AP.mode) throw Error('El modo indicado no corresponde al modo activo (' + AP.mode + ')');
    if (!entry.modes.includes(AP.mode)) throw Error(AP.mode === 'autonomo' && cmd === 'recepcion_registrar' ? 'Autónomo no registra recepciones; cambia a Supervisado para recepcionar' : 'El modo ' + AP.mode + ' no admite ' + cmd);
    if (actor !== undefined) APCmdStr(actor, 1, 80, 'actor');
    let data = payload === undefined || payload === null ? {} : payload;
    if (typeof data !== 'object' || Array.isArray(data)) throw Error('payload debe ser un objeto');
    for (const k of Object.keys(data)) if (!entry.keys.includes(k)) throw Error('payload no admite la clave ' + k + '; válidas: ' + (entry.keys.join(', ') || '(ninguna)'));
    if (cmd === 'propuesta_crear') {
      APCmdStr(data.sku, 1, 128, 'payload.sku');
      if (data.reason !== undefined) APCmdStr(data.reason, 1, 500, 'payload.reason');
    }
    if (cmd === 'propuesta_decidir') {
      APCmdStr(data.id, 1, 64, 'payload.id');
      if (!['aprobada', 'rechazada'].includes(data.status)) throw Error('payload.status debe ser aprobada o rechazada');
    }
    if (cmd === 'recepcion_registrar') APCmdStr(data.id, 1, 64, 'payload.id');
    return entry.run(data);
  },
};
globalThis.APBus = APBus;
