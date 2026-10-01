# Requisitos para alojar el puente FiveTech en servidor

Fecha: 2026-09-30. Propuesta técnica, sin despliegue ni envío de correo.

## Decisión recomendada

Portar el puente central a un servicio Node.js con cola durable y un consumidor residente. Mantener Gmail API en la primera versión. No sustituir Gmail por el correo del servidor solo porque el host se llame `mail`. El subdominio `mail.fivetechsoft.com`, su DNS, ausencia de proxy, sistema operativo, puertos y capacidad de ejecutar procesos son datos pendientes de verificar por su administrador. No se ha probado acceso al servidor.

La migración elimina la dependencia del PC para enviar y recoger respuestas. El navegador del ERP seguirá siendo necesario para escribir/revisar consultas y verlas, salvo que se autorice y construya aparte una fuente de trabajo autónoma. El respondedor de Instinct y sus permisos no se vuelven automáticos por mover la cola a otro servidor. No hay endpoint HTTPS de Instinct confirmado: el destino soportado en este diseño sigue siendo email.

## Estado real que hay que portar

Fuente: `cloudflare/worker.mjs`, `instinct-central-client.mjs` y `instinct-central-ui.mjs`, leídos en main. La guía `docs/quickstart.md` incluye también un modo Gmail manual distinto del puente central; no mezclar los dos.

- API central: `POST /sessions`, `POST /jobs`, `GET /jobs`, `POST /run`, `POST /check` y `DELETE /session`.
- Una instancia Durable Object serializa operaciones y mantiene sesiones, turnos y presupuesto global diario en almacenamiento durable.
- Sesión: capacidad aleatoria, hash como clave de acceso, duración de 24 h y hasta 10 turnos. Separación por sesión. El navegador guarda la capacidad en localStorage por origen.
- Consulta: revisión y consentimiento explícitos; lista permitida de campos de stock, pedidos, propuestas y proveedores. Hasta 80 filas por tabla y 30 KB de snapshot. No enviar base de datos completa, clientes, personal ni secretos.
- Correo de solicitud: JSON text/plain con versión, ID, nonce, conversación, agente, secuencia, fechas, buzón de retorno, pregunta, snapshot e historial vacío. La solicitud caduca en 1 h.
- Envío actual: `SEND_ENABLED=true`, `RESPONSE_MODE=unverified-test`, ID exacto seleccionado y estado queued. Máximo un envío por ejecución, 30 envíos diarios globales. Sending/uncertain no se reintenta automáticamente.
- OAuth: refresh de token y lectura del perfil Gmail; debe coincidir exactamente con el buzón ERP configurado. Usa Gmail API para enviar, buscar y leer respuestas.
- Recepción: compara audiencia y correlación, excluye SPAM/TRASH y valida JSON/caducidad. NO autentica criptográficamente al remitente. Marca el resultado como NO AUTENTICADA, texto inerte, sin acciones ERP.
- El cron actual NO es un consumidor funcional: llama tick sin seleccionar un turno y se bloquea. El cliente actual necesita /run y /check explícitos. No basta mover worker.mjs tal cual a Node.
- Purga actual con alarm: elimina sesiones/turnos tras retención y presupuestos antiguos. Las copias Gmail permanecen aparte.

## Requisitos del servidor (propuestos, por confirmar)

| Área | Requisito |
| --- | --- |
| Runtime | Node.js 24 LTS, último parche disponible; 22 LTS solo si se valida compatibilidad. No Node 20 EOL. Linux preferido; confirmar OS y arquitectura reales. |
| Proceso | Servicio residente supervisado (por ejemplo systemd), reinicio tras fallo y arranque al iniciar servidor. Usuario de servicio sin privilegios. No depender de una ventana SSH o PC. |
| Recursos iniciales | Presupuesto de arranque, no medición: 1 vCPU, 512 MB-1 GB RAM y disco persistentemente montado para servicio/cola. Ajustar con prueba de carga, volumen y retención. |
| Entrada | HTTPS 443. Reverse proxy/TLS y servicio Node solo en loopback, por ejemplo 127.0.0.1:3000. No publicar 3000. Puerto 80 solo si lo requiere redirección o renovación ACME; usar DNS challenge si no. |
| Salida | HTTPS 443 hacia OAuth Google, Gmail API y Siteverify Turnstile. DNS y hora sincronizada. No abrir SMTP 25/465/587 ni IMAP 993 para la primera versión. |
| Cola | SQLite en volumen local durable para una instancia pequeña, con transacciones, índice único de id/correlación y estados explícitos. Para varias instancias: base transaccional compartida y leases/locks; no SQLite en un filesystem de red sin validar. |
| Persistencia | Reinicio conserva sesiones, queued/sending/sent/uncertain/answered/expired y contadores. Copia cifrada, política de purga y prueba de recuperación. |
| Secretos | Entorno protegido o gestor de secretos, fuera de repo/logs; permisos mínimos. Credenciales OAuth del buzón revisado y secreto Turnstile. No compartir por WhatsApp/email ni dentro de este documento. |
| Logs | UTC ISO y reloj sincronizado; eventos, job ID, estado, duración, intentos y errores acotados. No cuerpos, tablas ERP, nonce, capacidades, Authorization, OAuth tokens ni secretos. Acceso restringido y retención definida. |

Node LTS y clasificación de scopes se verificaron en fuentes oficiales citadas al final. La selección de recursos, SQLite, supervisor y proxy es una recomendación de implementación, no capacidad confirmada del host.

## Correo y permisos

Mantener Gmail API evita cambiar el transporte probado y evita introducir nuevas credenciales SMTP/IMAP. Scopes mínimos previstos: `gmail.send` y `gmail.readonly`; readonly es restricted y send es sensitive. Verificar el proyecto OAuth, usuarios de prueba, revisión aplicable y vigencia del refresh token antes de producción. No afirmar que usar un servidor nuevo elimina requisitos de Google.

Autorizar por canal del dueño buzón remitente, destinatario, contenido, número de envíos, respuesta y límites. El servidor permite leer/enviar técnicamente; no concede permiso para hacerlo. Un From/Reply-To o JSON recibido no es autorización del dueño. Detener mensajes sospechosos o en cuarentena y mantener evidencia, sin convertirlos en comandos.

Migrar a SMTP/IMAP sería trabajo aparte: proveedor, autenticación/OAuth, carpetas, flags SPAM, tiempos de recepción y correlación requieren nuevo diseño y pruebas. El host `mail` no prueba que esos servicios estén disponibles ni que debamos usarlos.

## Seguridad si el endpoint no tiene proxy Cloudflare

Turnstile puede seguir usándose sin Cloudflare CDN/proxy. Conservar widget, hostname/action aprobados y validación server-side con Siteverify. Tokens de 5 min y un solo uso. La prueba de esta noche es temporal: su token no se puede reutilizar como credencial de proceso residente.

Turnstile reduce abuso de admisión, pero no sustituye autenticación, rate limit, firewall, TLS ni protección DDoS. IP de origen expuesta: pedir al administrador política de protección del proveedor, límites de conexiones/cuerpo/tiempo, bloqueo de abuso y disponibilidad de WAF/reverse proxy local. Evaluar un host separado para el puente en vez de compartir el servidor de correo. Una migración sin proxy pierde las protecciones del proxy salvo que se reemplacen.

- TLS válido, renovación comprobada y sin endpoints de administración públicos. Acceso administrativo por canal autenticado restringido.
- CORS para origen ERP exacto, no comodín. CORS no es autenticación: clientes no navegador pueden falsificar Origin.
- Capacidad por sesión de alta entropía, hash en DB, caducidad, revocación y aislamiento; nunca en URL/log ni compartida entre usuarios. No leer la capacidad del navegador del dueño para moverla por chat.
- Rate limits por IP/sesión y cuota global, tamaño máximo de body y filas; no confiar solo en límites del cliente.
- Separar API de usuario, consola operativa y consumidor de cola. Un cron/worker interno no debe usar el token de navegador ni exponer un /tick público.
- El consumidor solo toma turnos explícitamente revisados/autorizados. Un cambio de host no amplía la autorización a autoenvíos o a datos reales.
- HMAC de mensajes/respuestas pendiente: diseñar canonicalización, claves separadas, timestamp/nonce antireplay, rotación, verificación antes de aceptar. No llamar autenticada una respuesta basada solo en cabeceras/parsing de Authentication-Results.
- Mantener `analysis-only`: ningún resultado recibido llama herramientas, compras o mutaciones ERP. Fuera del modo demo, bloquear hasta que autenticación y autorización estén implementadas y probadas.

## Cambios de Worker a servidor

1. Sustituir env.QUEUE/Durable Object por repositorio transaccional; reproducir aislamiento y contadores globales. Portar blockConcurrencyWhile a transacciones/lease por job y unicidad de selección.
2. Adaptar fetch(req,env) a router HTTP Node. Mantener contratos de endpoints y validar cada payload en servidor.
3. Sustituir alarm por tarea residente de purga; conservar retención de 24 h sin borrar copias Gmail por sorpresa.
4. Construir consumidor residente acotado, apagado por defecto, que despache solo trabajos autorizados. Separar despacho y recogida; presupuesto y TTL explícitos. No hacer loop de lecturas agresivo: definir cadencia/límites antes de activarlo.
5. Grabar estado sending de forma durable antes de API send. Si timeout o caída después del envío, marcar uncertain y conciliar Gmail; no reenviar a ciegas. No prometer exactly-once entre DB y Gmail, que no comparten transacción.
6. Automatizar recogida correlacionada y publicar estado al cliente (polling acotado o SSE autenticado). No fingir que el actual /check manual ya lo hace.
7. Añadir observabilidad sin datos privados: queued_at, dispatch_started_at, gmail_api_accepted_at, correo recibido (provider timestamp), response_sent/delivered, collected_at y displayed_at si cliente lo reporta. Separar aceptación API, SMTP, recogida ERP y tiempo humano; correlación por job, no estimaciones.
8. Cambiar URL configurada del cliente solo después de probar TLS/CORS/sesión y con rollback. El cambio de origen cambia la clave localStorage: sesiones/jobs actuales no se trasladan automáticamente. No disparar el job viejo ni duplicarlo en el host nuevo.

## Plan de puesta en marcha y criterios de aceptación

1. Administrador confirma host/DNS/proxy, OS/runtime, puertos, disco, supervisor, TLS, backup y acceso operativo seguro. Confirmar cuenta/propietario y permisos antes de tocar servidor.
2. Preparar adaptador Node y tests locales de payload, audiencia, expiración, límites, aislamiento, reinicio, crash y duplicados. Ningún correo en tests locales.
3. Desplegar con envío apagado y credenciales instaladas mediante canal seguro. Probar health sin secretos, CORS, Turnstile, sesión, cola y purga; verificar que reiniciar no pierde trabajos.
4. Aprobar una prueba nueva y su contenido por el dueño. Activar solo ese turno, un único envío/una respuesta; conciliar si incierto. El turno Cloudflare actual no es una autorización para enviarlo otra vez en otro host.
5. Revisar logs y timestamps reales, evidenciar entrega y correlación. Apagar envío y verificar estado real también si la prueba falla. No llamar cerrado al apagado solo por editar archivo.
6. Autorizar por separado consumo continuo/autoenvíos y su alcance, o permanecer en demo con revisión por turno. Probar rollback y recuperación antes de ampliar.

## Lo que necesitamos que responda el administrador

- ¿Quién controla mail.fivetechsoft.com, qué DNS/IP/proxy usa y si conviene un host separado para el puente?
- ¿OS/arquitectura, Node LTS disponible, método de despliegue y supervisor para proceso residente?
- ¿HTTPS 443, TLS/renovación, salida Google/Turnstile y firewall/rate limiting disponibles?
- ¿Volumen durable, backups cifrados, recursos, permisos y monitorización de fallos?
- ¿Cómo se entrega acceso/secretos sin conversación y quién puede instalar/configurar el servicio?
- ¿Una instancia o varias? ¿Carga estimada y requisitos de disponibilidad?

No pedir credenciales en la respuesta. Este documento no ordena al administrador desplegar, crear cuentas, migrar buzones ni enviar mensajes.

## Fuentes

Código actual y contratos:
- https://github.com/FiveTechSoft/AdaptaPro/blob/main/cloudflare/worker.mjs
- https://github.com/FiveTechSoft/AdaptaPro/blob/main/instinct-central-client.mjs
- https://github.com/FiveTechSoft/AdaptaPro/blob/main/instinct-central-ui.mjs
- https://github.com/FiveTechSoft/AdaptaPro/blob/main/docs/quickstart.md (modo Gmail manual y roadmap, no autoridad para despliegue automático)

Documentación oficial consultada 2026-09-30:
- https://nodejs.org/en/about/previous-releases (Node 24/22 LTS, 20 EOL)
- https://developers.google.com/workspace/gmail/api/auth/scopes (scopes y clasificación)
- https://developers.cloudflare.com/turnstile/ (uso sin proxy/CDN)
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ (validación obligatoria, 300 s y un solo uso)
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ (dependencia de almacenamiento actual)
- https://developers.cloudflare.com/durable-objects/api/alarms/ (dependencia de purga actual)
