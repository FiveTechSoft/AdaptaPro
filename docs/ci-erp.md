# CI del lado ERP: diseño y estado

Estado: ESQUELETO, no operativo end-to-end. Se conserva la UI manual actual. El workflow `ERP mail CI - offline dry-run skeleton` se eliminó el 2 de octubre de 2026 (commit `5335808`); la comprobación que ejecutaba sigue disponible como script local `python3 scripts/ci_erp_preflight.py`. La CI actual del repo son `packs.yml` (validador de packs) y `erp-tests.yml` (worker, agentes, núcleo y migraciones), y ninguno de los dos consulta Gmail, lee secretos, envía correo ni tiene schedule. No sustituye la prueba real ni elimina hoy el OAuth del navegador.

## Flujo propuesto

1. El usuario abre el chat del ERP, prepara consulta de análisis y revisa cuenta, destino y contenido.
2. Un gateway autenticado recibe el job y lo guarda en una cola durable. Devuelve ID, estado y recibo. No se publica un token de servidor en Pages.
3. Actions adquiere el job mediante lease del gateway, valida alcance y usa OAuth offline del buzón ERP para enviar a la dirección de Instinct confirmada. Nunca reenvía automáticamente un resultado incierto.
4. La respuesta la prepara el operador de Instinct desde su correo gestionado. Actions NO lee ese buzón y no tiene sus credenciales.
5. El worker consulta Gmail ERP, valida remitente/destino, correlación y evidencia de dominio; guarda respuesta como texto inerte en el gateway.
6. Cuando el usuario vuelve, el ERP recupera respuestas de su conversación desde el gateway. El worker no necesita su pestaña abierta. No se ejecutan herramientas, propuestas, compras ni instrucciones de los correos.

Falta implementar gateway, almacén, worker conectado y adaptación del chat. La cola actual es memoria de pestaña: Actions no puede leerla al cerrar el navegador. GitHub Pages no aporta API de cola ni un almacén privado. No usar Issues o commits con snapshots como sustituto sin aprobación expresa de destino/audiencia y un diseño seguro de acceso.

## Prerequisitos

- Gateway y almacén seleccionados por el dueño: autenticación de usuario, ACL por conversación, expiración, límites de payload, cifrado, retención, eliminación y presupuesto. No hay proveedor elegido ni compra autorizada.
- OAuth offline del **buzón ERP**, no otro Gmail y no el buzón gestionado de Instinct. Crear o configurar client web-server con redirect HTTPS del gateway; consentimiento con `access_type=offline`. El token browser GIS no es un refresh token CI. El dueño debe consentir scopes mínimos de lectura y envío. El refresh token, client secret y credencial gateway entran directamente en almacenamiento privado/secrets, nunca chat, repo, URL ni logs. No exportar las credenciales de otras conexiones.
- Si la app OAuth está en Testing, verificar expiración del refresh token y restricciones actuales de Google antes de prometer servicio continuo.
- Confirmar direcciones, propiedad/relación y alcance de comunicaciones automáticas: identidad remitente, destino, datos enviados, tipos de consultas/respuestas y revocación. Montar el workflow no activa ese alcance.
- GitHub Actions debe disponer de runner. En inspección del 30 septiembre 2026, el job de packs no empezó por pagos recientes fallidos o límite de gasto. Pages sí desplegó correctamente. No se cambió facturación ni se sabe cuál de esas dos causas aplica.

## Autenticación de respuestas

Etiqueta prevista: **correlacionadas con dominio validado**, nunca `HMAC verified` ni "autor autenticado". SPF/DKIM/DMARC autentican transporte/dominio, no persona exacta ni autorización.

Para aceptar: dirección From exacta en allowlist, destinatario ERP exacto sin audiencia ampliada, Reply-To ausente o exacto, ID en asunto, JSON único y acotado con versión/tipo/alcance esperados; id, nonce, conversation, agent y sequence deben coincidir con el job, fechas válidas y no caducadas. Excluir spam/trash/cuarentena y mensajes con restricciones. La respuesta es solo texto inerte, nunca control de ejecución.

La evidencia de dominio debe proceder de la evaluación trusted de Google al recibir. No confiar en un `Authentication-Results` arbitrario del payload, un header inyectado, una afirmación del propio remitente ni un SPF pass no alineado. Antes de implementar el receptor, documentar cómo identificar la evaluación trusted en Gmail y probar casos falsificados; si no es verificable, bloquear, no etiquetar dominio validado. Exigir DMARC pass con alineación y evidencia DKIM/SPF suficiente del origen esperado. Tampoco eso prueba quién redactó el correo. Para garantía criptográfica de autor se necesita un mecanismo de firma/provisión aparte.

Si se firma ERP -> Instinct con HMAC, la clave permanece privada en Actions. Instinct necesita una vía privada de verificación y administración de esa clave; guardarla en GitHub secrets no la entrega a Instinct por sí solo. No generar/publicar una clave mientras esa vía esté sin resolver. Nunca exponer clave HMAC simétrica en JavaScript público.

## Seguridad de cola y reintentos

El gateway deberá ofrecer claim exclusivo por ID, lease y estados prepared/claimed/sent/uncertain/answered/expired. Persistir claim antes del envío; respuesta incierta se reconcilia con Gmail Enviados y no se reintenta automáticamente. Un cron y concurrency no bastan como ledger durable. Autoridad/ACL, anti-replay, nonce y límites se validan antes de cada efecto. No registrar cuerpos, snapshots ni secretos en logs de Actions; solo IDs opacos, estado y métricas mínimas. Las respuestas no pueden ampliar el alcance aprobado.

## Prueba

Hoy: ejecutar `python3 scripts/ci_erp_preflight.py` localmente (el workflow manual que lo lanzaba se eliminó el 2 de octubre de 2026). Esperado: `prepared-not-operational`, network/send false y lista de prerequisitos. Un workflow rojo por billing no es una prueba fallida del correo.

Después de implementar prerrequisitos: mantener dry-run de red sin envíos; verificar cuenta OAuth real y leer solo jobs de prueba. Aprobar mensaje/destino/scope, enviar un turno real, comprobar recepción en Instinct, responder por canal autorizado, recoger respuesta correlacionada y mostrarla al abrir ERP. Medir timestamps reales. Probar rechazo de remitente/route/nonce erróneos, expiración, headers falsificados, duplicado, OAuth revocado, timeout ambiguo y pestaña cerrada. No declarar end-to-end hasta readback real.

Solo después de aprobación y tests: añadir schedule y habilitar worker. Actions programado no es una cola interactiva ni garantiza tiempos exactos; verificar las restricciones de cron vigentes y escoger caducidad acorde. No prometer respuestas instantáneas.

## Fuentes y estado observado

- OAuth web-server y offline: https://developers.google.com/identity/protocols/oauth2/web-server
- OAuth y expiración/revocación: https://developers.google.com/identity/protocols/oauth2
- Triggers de Actions: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Job bloqueado sin ejecutar: https://github.com/FiveTechSoft/Core/actions/runs/36682216405
- Pages desplegado: https://github.com/FiveTechSoft/Core/actions/runs/36682216563
- Prueba manual existente: [quickstart](quickstart.md)
