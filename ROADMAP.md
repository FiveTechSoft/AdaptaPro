# ROADMAP: agentes AdaptaPro con Instinct

Actualizado: 30 septiembre 2026. Plan aprobado: ALPHA/BETA/GAMMA del ERP ↔ email firmado ↔ Instinct como cerebro. No confundir este transporte de aplicación con una API pública oficial ni con el relay de pruebas local.

## Estado real

- [x] Diseño por agente, IDs, nonce, conversación, secuencia y respuesta inerte.
- [x] Módulo navegador `instinct-gmail.mjs`: llamadas Gmail API, OAuth GIS, perfil de cuenta, scopes mínimos para enviar/leer, MIME, firma/verificación WebCrypto, minimización y límites, correlación de respuestas, bloqueo de reenvío ambiguo.
- [x] Biblioteca de log localStorage y resumen por ventana con anomalías, límites y pérdida de retención declarada.
- [x] 27 comprobaciones locales en `instinct-gmail-test.mjs`, solo fixtures. Ejecutar `node instinct-gmail-test.mjs` (Node 22).
- [ ] Integrar controles visibles de configuración, OAuth, revisión/envío y respuesta en el chat ERP. El módulo no se carga aún desde index.html y no cambia la interfaz actual.
- [ ] Crear/configurar OAuth client Google y habilitar Gmail API.
- [ ] Autorizar y verificar cuenta ERP elegida por el dueño (Gmail). Confirmar destino de Instinct antes del primer envío. Las direcciones se configuran en sesión, no se incrustan en código.
- [ ] Provisión segura de HMAC en ambos extremos y respondedor real que valide solicitudes y firme respuestas.
- [ ] Primer correo real, respuesta inteligente, diálogo multiturno, captura del chat y timings reales. NO realizados todavía.
- [ ] Cablear todos los eventos del transporte y agentes al log y la verificación periódica a respuestas reales de Instinct. Existe biblioteca, no un monitor conectado.

## Fase 1: Pages + Gmail OAuth, navegador abierto

El ERP sigue en GitHub Pages. El navegador obtiene consentimiento OAuth y llama directamente a Gmail API por HTTPS. No SMTP/POP en navegador, no Node en Pages, no client secret, contraseñas ni refresh token en la web.

Token de acceso solo en memoria. Caduca; para renovarlo hace falta gesto del usuario. Cerrar pestaña detiene actividad; los temporizadores pueden retrasarse en segundo plano. La cola actual del módulo es volátil: pendientes y resultados no sobreviven recarga. Persistencia local de cola y recuperación de envíos inciertos por Gmail Sent quedan pendientes; nunca reenviar automáticamente tras timeout.

Cuenta de correo del ERP: `fivetech2@gmail.com`, elegida por el usuario para esta prueba. Confirmar perfil exacto tras OAuth. Antes de enviar, revisar cuenta, destinatario y cuerpo final. OAuth concede acceso técnico, no autorización general para mandar correos.

### Configurar Google Cloud

1. Crear/elegir proyecto propio.
2. Biblioteca de APIs: habilitar Gmail API.
3. Google Auth Platform: Branding (nombre/contacto), Audience (External para Gmail personal), Testing y test user con el buzón ERP.
4. Data Access: `https://www.googleapis.com/auth/gmail.send` y `https://www.googleapis.com/auth/gmail.readonly`. No modify ni acceso completo. send es sensible; readonly restringido. Ampliar usuarios/publicar puede exigir verificación Google.
5. Clients: OAuth client de tipo Web application. JavaScript origin: `https://fivetechsoft.github.io`, SIN ruta `/AdaptaPro/`. El token/popup GIS no usa un client secret ni requiere un redirect URI inventado.
6. Configurar Client ID público (termina en `.apps.googleusercontent.com`). No subir Client Secret.
7. Cargar Google Identity Services desde `https://accounts.google.com/gsi/client`, autorizar con botón, verificar perfil y scopes concedidos.

## Protocolo y contexto

UTF-8 JSON en email text/plain; admite el único text/plain de un multipart/alternative, no HTML ni varios cuerpos ambiguos. Request: versión, tipo, scope analysis-only, ID aleatorio, nonce, conversación, agente, secuencia, fecha, caducidad de 15 minutos, reply_to, pregunta, snapshot, historial y firma. Response repite identidad de turno, fechas, scope y añade text/firma. No se aceptan respuestas cruzadas, caducadas o sin firma.

ALPHA: stock, pedidos, propuestas, proveedores. BETA: stock, pedidos, propuestas. GAMMA: stock, propuestas, proveedores. Solo campos permitidos, sin nombres/contactos de clientes. Máximo 80 filas por tabla y 40 KB; conteos explícitos de filas omitidas y posibilidad de acotar por SKU. El snapshot de cada turno es autosuficiente: no usa deltas que dependan de un email perdido. Historial máximo seis mensajes; el controlador UI aún debe construirlo y conservar secuencia por agente.

Instinct recibe la pregunta y datos del ERP para analizar, no una autorización de negocio. Puede pedir datos faltantes. No afirma compras, cobros, entregas ni aprobaciones inexistentes. Respuesta mostrada como texto, nunca ejecutada como código ni herramientas. El motor de pedidos simulados debe detenerse cuando se active este modo; implementación UI pendiente.

## Seguridad

HMAC-SHA256 con JSON canónico. En fase 1 el módulo exige CryptoKey no extraíble suministrado privadamente por sesión. No incluye mecanismo de provisión de clave: queda pendiente. NO colocar HMAC en JavaScript publicado, repo, localStorage, URL o email. Una CryptoKey no extraíble evita exportar sus bytes, pero un XSS puede usarla para firmar: Pages no tiene el aislamiento de un servidor. Hay que revisar scripts externos y reducir superficie antes de usar datos privados.

Una dirección From y el ID no prueban identidad. Gmail OAuth autentica acceso a la cuenta, no autoría de todo correo que contiene. Firma válida autentica posesión de clave, no permiso para actuar. Respuestas sin firma permanecen rechazadas. HMAC no cifra el contenido de email ni lo oculta a proveedores de correo.

## Log y revisión periódica

Fase 1: localStorage, esquema `v`, `next`, `dropped`, `events`. Evento: número monotónico, fecha, tipo, agente, ID de turno/conversación, secuencia, estado, duración y código de error. No tokens, claves, cuerpos de correo, stock íntegro ni datos personales. Capacidad por defecto 2000 eventos; al rotar se registra cuántos se perdieron. Error de cuota/corrupción debe mostrarse, no simular auditoría completa. El log es editable y puede borrarse: NO prueba independiente o inmutable.

Resumen `adaptapro.audit/1`: ventana de secuencias, fechas, conteos, metadatos de últimos 100 turnos, errores, conflictos de routing, truncación y eventos omitidos. Instinct debe informar cobertura, turnos no cerrados/duplicados, errores y anomalías, no certificar negocio real solo por un log del cliente.

Cada X minutos configurable (5..1440, valor de diseño inicial 60) se prepara resumen local. Biblioteca `scheduleReview` no envía correo y su cursor solo significa resumen generado, NO verificado. Para activar autoenvío hacen falta cuenta/destino, permiso del dueño sobre contenido/cadencia y límite, firmador/respondedor, correlación de informe y cursor de última verificación confirmada. Evitar autoenvíos superpuestos y duplicados; pausar con token caducado. No decir "verificado por Instinct" hasta una respuesta auténtica correlacionada.

## Fase 2: backend persistente 24/7

- Node/servicio detrás de proxy TLS autenticado y roles; no GitHub Pages.
- Buzón dedicado con SMTP/POP TLS o Gmail OAuth de servidor, secretos fuera del repo.
- Cola durable transaccional, idempotencia, recuperación SMTP incierto, deduplicación, límites y retención.
- Trabajador único por buzón, polling acotado según proveedor o notificación soportada; no poll por petición. Backend propio puede entregar estado al chat sin esperar email.
- Firmador aislado, registro de auditoría de servidor, revisión periódica durable con alertas verificadas.
- Monitor activo aunque se cierre navegador; permisos de negocio y comunicaciones siguen separados.

## Criterio de aceptación real

Probar ALPHA, BETA y GAMMA con datos del ERP; varios turnos y contexto correcto; respuesta fuera de orden sin mezcla; duplicados, timeout/reinicio sin reenvío; OAuth expirado; firmas inválidas; log/anomalías y revisión confirmada. Medir envío Gmail API, llegada/request, análisis/respondedor, llegada/respuesta y chat visible. No sumar métricas anidadas, no sustituir latencia real por mocks ni los 180 ms del relay local.

## Fuentes de configuración

- https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/gmail/api/auth/scopes
- https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send
- https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list
