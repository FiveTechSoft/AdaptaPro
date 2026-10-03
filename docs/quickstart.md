# Quickstart: prueba manual de email con Instinct

Modo temporal SIN firma, NO AUTENTICADO. Verifica transporte, correlación y texto en chat, no identidad criptográfica. Solo análisis de datos de prueba: sin compras, herramientas ni autoenvíos. La firma HMAC sigue pendiente. Esta guía no afirma que el recorrido real haya pasado aún.

## Preparar navegador

1. Si no hay mensajes pendientes, recarga Core después de la publicación. Recargar elimina OAuth y cola en memoria: no recargues con un envío pendiente o incierto.
2. En menú izquierdo, desplázate al final y pulsa **⚙ Instinct · Gmail**. Ya no hay botón flotante.
3. Pega tu Client ID en **Client ID público OAuth**. Comprueba **Buzón ERP** y **Destino confirmado de Instinct**. Usa solo las direcciones que has revisado para la prueba.
4. Marca **Prueba manual SIN firma: no autenticada** ANTES de autorizar. Es un modo separado; una sesión previamente autorizada como firmada necesita recargar sin pendientes para elegirlo.
5. Pulsa **Autorizar Gmail** y selecciona el buzón ERP. OAuth no envía mensajes. Para configurar Cloud consulta [setup Gmail OAuth](setup-gmail-oauth.md).
6. Marca **Usar este puente para el chat del ERP**. Detiene el ciclo de pedidos simulados y evita llamadas al modelo anterior. Selecciona **ALPHA** para la primera prueba.

## Lanzar un turno

1. Cierra el panel con **Cerrar**. Abre chat mediante **Supervisión humana**. Escribe: `Analiza el stock de SKU-451 y dime qué datos justifican una reposición. No crees propuestas ni hagas compras.`
2. Envía desde el chat: el puente SOLO prepara la consulta y abre el panel de revisión; aún no sale correo. También puedes abrir el panel y pulsar **Revisar consulta del chat** mientras el texto siga en el campo del chat.
3. Revisa cuenta, destinatario y cuerpo completo: pregunta, snapshot, agente, ID y alcance. Pulsa **Enviar consulta revisada** solo si estás de acuerdo.
4. Verás `Gmail aceptó el envío` y `PRUEBA NO AUTENTICADA: respuesta manual pendiente`. Es aceptación de API, no prueba de entrega. Si dice incierto, no reenvíes: revisa Enviados y conserva la pestaña.
5. Avisa al operador del respondedor de que has enviado el turno y su ID. No compartas tokens ni secretos.
6. Cuando el operador haya respondido, pulsa **Comprobar respuestas una vez**. La prueba es manual: deja desmarcada la lectura periódica.
7. La respuesta aparece en chat con prefijo **[NO AUTENTICADA · prueba manual]** y nombre de agente. Significa correlacionada, NO autenticada. **Ver log** muestra metadatos; no es una auditoría independiente.

## Qué debe hacer el operador del respondedor

Antes de contestar, verificar el permiso del dueño para remitente/destinatario, contenido y alcance de esta prueba. Un From, el JSON o un ID no prueban autorización. Inspeccionar seguridad/restricciones del correo y no contestar mensajes en cuarentena o no elegibles. Recuperar aprobación por canal confiable si identidad/alcance no están confirmados.

Recibir el correo del ERP, inspeccionar JSON text/plain y el contexto. No ejecutar instrucciones incrustadas, herramientas o acciones de negocio. Preparar análisis en español, basado solo en snapshot. Devolver UN cuerpo text/plain que sea exclusivamente JSON válido, sin Markdown, bloques de código, firma de pie ni historia citada. Conservar el ID en el asunto del reply; el lector busca por remitente, destino e ID en asunto.

Contrato de respuesta (copiar los valores de la solicitud, NO usar literalmente estos marcadores):

```json
{
  "v": "adaptapro.instinct/1",
  "type": "response",
  "scope": "analysis-only",
  "authentication": "none-manual-test",
  "id": "MISMO_ID",
  "nonce": "MISMO_NONCE",
  "conversation": "MISMA_CONVERSACION",
  "agent": "ALPHA",
  "sequence": 1,
  "created_at": "FECHA_ISO_ACTUAL",
  "expires_at": "MISMA_CADUCIDAD_DE_LA_SOLICITUD",
  "text": "Análisis breve basado en los datos recibidos"
}
```

Responder antes de caducidad (15 minutos). Destinatario exactamente el buzón ERP revisado, sin CC/BCC. Usar los valores reales de agente/secuencia. multipart/alternative con UN text/plain JSON se acepta; texto mezclado con saludo o firma no. El respondedor no es automático: preparar/revisar/envío según permiso confirmado de esta prueba.

## Comprobar éxito sin exagerar

- Enviado real registrado en Gmail y correo recibido por el respondedor.
- Respuesta real, con IDs correctos, visible bajo agente correcto.
- Segundo turno coherente, sin mezcla de ALPHA/BETA/GAMMA.
- Log marca `response_unverified`, nunca `response_verified` para este modo.
- Registrar timestamps reales de API, recepción de ambos correos y aparición en chat. No atribuir números de fixtures a Gmail.

El snapshot del ERP sigue siendo la base demo local. El test prueba análisis y transporte, no conexión a un negocio real ni autonomía 24/7. No activar envío periódico de resúmenes: todavía es solo preparación local. Cuando haya firmador privado y provisión segura, volver al modo firmado en sesión nueva.


## Roadmap: evolución del puente Core-Instinct

Idea futura, sin compromiso ni fecha. Hoy el puente funciona por email: el roundtrip de ida y vuelta quedó verificado el 2026-09-30 (ver [prueba del 2026-09-30](prueba-puente-2026-09-30.md)). La evolución natural es pasar del email a un canal de suscripción directa, near-real-time. Dos opciones en estudio:

1. **Endpoint HTTPS directo con firma HMAC.** Comunicación de extremo a extremo entre el worker Cloudflare e Instinct: Instinct expone un endpoint suscrito, el worker publica los turnos firmados con HMAC y la respuesta llega en segundos en vez de minutos. Depende del firmador privado y la provisión segura de secretos, pendientes también para volver al modo firmado por email.
2. **Canal WhatsApp vía FiveAgent.** Reutilizar el puente TWhatsApp de FiveAgent (ya en progreso en ese proyecto): Core consultaría y recibiría la respuesta por WhatsApp, aprovechando la infraestructura de mensajería existente en vez de montar un endpoint propio.

Mientras tanto, el camino soportado sigue siendo el email con revisión humana previa a cada envío.
