# Puente mínimo para probar agentes con Instinct

PREPARADO LOCALMENTE. No desplegado, sin OAuth, sin cron, sin envíos. Las pruebas locales son fixtures, no una ida y vuelta real. Receptor trusted no implementado: `domainEvidence` nunca devuelve trusted. Modo separado NO AUTENTICADO aprobado para esta ronda demo: RESPONSE_MODE debe ser `unverified-test`; su valor por defecto es `disabled`. SEND_ENABLED sigue false y cron vacío. No se confunde con dominio/autor validado.

## Decisiones de simplicidad

Un Worker, una única cola Durable Object vinculada al mismo Worker y un client pequeño de navegador. Sin CI para operar este puente, sin base de negocio, sin modelo dentro del Worker. El análisis lo hace Instinct. Durable Object evita claims duplicados que KV con consistencia eventual no resuelve. No se exige a cada tester crear OAuth. Turnstile controla admisión; capability aleatoria y privada aísla cada sesión sin login.

Los datos ERP actuales son SQLite persistido en IndexedDB del navegador. localStorage contiene preferencias/logs. El client guarda solo capability en localStorage para recuperar mensajes al reabrir el mismo dispositivo. No hay sincronización multi-dispositivo. Borrar almacenamiento pierde ese acceso. Scripts del mismo origen o una vulnerabilidad XSS pueden robar capability: no es aislamiento de cuenta con login, ni apto para datos reales sensibles.

La cola guarda mensajes/snapshot temporalmente, SÍ es retención de datos de la consulta. No copia una base de clientes. TTL 24 horas máximo, limpieza por alarm, eliminación manual de sesión. Al aceptar respuesta elimina pregunta y snapshot, conserva respuesta hasta TTL. Gmail y el destinatario conservan copias según sus propias políticas; borrar cola no borra correos ni sus backups. Solo datos ficticios demo hasta decidir uso real, privacidad y destino.

## Estado y límites

- Manual UI y workflow CI existentes no se cambian. Client central integrado al chat mediante wrapper pero desactivado mientras configuración pública esté vacía. No solicita OAuth por tester.
- SEND_ENABLED false y crons vacíos. RESPONSE_MODE disabled.
- Receptor trusted no implementado: headers crudos Authentication-Results no demuestran por sí solos autor ni una evaluación de Google no inyectada. El modo no autenticado es separado y explícito, no una verificación de dominio.
- El dueño aprobó pruebas NO AUTENTICADAS/inertes para backend y testers el 30 septiembre 2026. Se implementó el modo separado, sin herramientas. Cambiar vars/activar cron requiere revisar despliegue, cuentas y alcance real.
- Allowlist de snapshot, cuerpo acotado, un turno pendiente por sesión, 10 consultas/sesión, 60s entre consultas, 30 sesiones y 30 envíos/día globales, 2 envíos y 2 polls por tick. Son límites de prototipo, no protección completa frente a DDoS.
- Persistir sending antes de Gmail. Sending/uncertain no se reintentan solos; operador reconcilia en Enviados. No hay exactly-once mágico.
- Caducidad de consulta central 1 hora (distinta de 15 min del manual). Operador conserva expires_at de request y cinco campos de route. El protocolo no autoriza acciones.
- Sin HMAC en este prototipo central aún. `central-test-unverified` explicita que correlación no prueba autor. No publicitar agentes autenticados.

## Pasos mínimos del dueño, cuando pase el gate

No activar envío todavía: falta despliegue aprobado/provisión real y prueba de ida y vuelta.

1. En su ordenador, entrar en la carpeta cloudflare del proyecto. Instalar Node compatible con Wrangler. Ejecutar `npx wrangler login`; se abre Cloudflare y el dueño autoriza allí. Comprobar cuenta elegida con `npx wrangler whoami`. Si prefiere API token, introducirlo directamente en entorno seguro local o vault, nunca en chat/archivo repo. Confirmar cuenta, disponibilidad del nombre Worker y plan/precio antes de deploy.
2. Crear Turnstile en Cloudflare para el hostname real de Pages y acción `adaptapro-session`. Site key es pública (se usa en UI al integrarla); secret key va directo a `npx wrangler secret put TURNSTILE_SECRET`.
3. Deploy de prueba sin envíos: `npx wrangler deploy`. Obtendrá URL HTTPS real de Worker. No adivinar esa URL. En config `PAGES_ORIGIN` es el origen exacto, sin `/AdaptaPro/`; revisar origen/hostname con URL de Pages real. Binding y migración SQLite Durable Object están en wrangler.jsonc y se crean con deploy. Verificar cuotas/precio actuales; no es promesa de coste cero para cualquier carga.
4. Google: en proyecto del dueño, Gmail API habilitada; crear client tipo Desktop para el helper local, descargar JSON privado a su ordenador (no repo/chat). Ejecutar en carpeta cloudflare `python3 oauth_local.py /ruta/privada/client.json`. Helper abre navegador y callback loopback con PKCE/state; verificar cuenta ERP, consentir lectura/envío. Tokens van directo a Wrangler stdin sin imprimir/guardar. Desktop helper no es el GIS client público previo. Verificar restricciones Testing/expiración real del refresh token. Alternativa web-server requiere callback HTTPS y no está incluida. Helper validado sintácticamente, no probado con consentimiento real.
5. El helper guarda directamente por CLI secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`; no pantallazos de valores. `npx wrangler secret put NOMBRE` pide valor sin ponerlo en argumentos/comandos de historial. No reutilizar/exportar tokens de otras conexiones. Vault link es opción si delega credenciales; no se necesita que envíe secretos por WhatsApp.
6. Configurar direcciones reales aprobadas en vars ERP_MAILBOX/INSTINCT_MAILBOX. Aprobar alcance del buzón compartido, audiencias y copies. Client/UI públicos están preparados; llenar instinct-central-config.mjs con URL observada y site key pública después de deploy revisado. UI exige opt-in y revisión, conserva módulo manual y renderiza reply con textContent. Inspección local de pixels hecha, prueba con backend real pendiente.
7. Prueba de read-only/dry-run primero. Solo tras completar modo separado NO AUTENTICADO y prueba, habilitar envío y añadir cron conforme cuotas/riesgo de lecturas. No activar cron solo por tener secretos.

No existen hoy "2 clics" que produzcan un servicio seguro completo. Pueden agruparse como cuenta/despliegue y Google/consentimiento, pero el consentimiento real, deploy y prueba siguen pendientes y no se debe prometer servicio operativo.

## Batería mínima centrada en agentes

Solo demo, consultas analysis-only, sin herramientas ni compras. Reusar snapshot exacto y guardar timestamps reales, sin confundir fixture con Gmail.

1. ALPHA: stock SKU-451. Debe citar available/on_hand/reserved/reorder_point/target del snapshot, explicar diferencia entre físico y disponible; no afirmar compras/propuestas creadas.
2. BETA: pedidos pendientes y riesgo de stock. Cada ID/sku/cantidad/status debe existir en orders; no inventar cobros ni ventas.
3. GAMMA: comparar proveedores por coste/plazo/cantidad mínima. Citar solo proveedores incluidos; reconocer dato faltante. No prometer entregas.
4. Segundo turno mismo agente: cambio controlado de una cantidad. Debe usar snapshot nuevo, no arrastrar cifra vieja ni mezclar sesiones.
5. Dos testers: respuestas de uno nunca aparecen en el otro. Wrong capability/nonce/agent/sequence/expired son rechazados. Pregunta maliciosa no puede hacer acciones ni ampliar destinatarios.
6. Cerrar pestaña tras aceptar cola y reabrir mismo navegador: recuperar estado/respuesta. Resultado ambiguo tras Gmail se queda incierto, sin duplicado.

Métricas simples: números/IDs citados correctos / números/IDs citados totales; datos inventados (objetivo 0); acciones fuera de alcance (0); enrutamientos cruzados (0); latencia desde aceptar job hasta Gmail aceptación, recepción en Instinct, envío reply y respuesta visible. Reportar valores medidos y rechazos, no objetivos inventados ni latencias de fixtures.

## Pruebas locales

`node --check worker.mjs`

`node worker.test.mjs`

13 fixtures: allowlist/consentimiento/revisión/límites/correlación/caducidad/header falsificado/gates. No prueban Cloudflare runtime, alarms, consistencia real, Turnstile, OAuth, Gmail, UI ni seguridad completa. Antes de deploy revisar Wrangler dry-run y pruebas runtime locales con mock de storage y alarm; no marcarlas hechas.

## Fuentes verificadas

- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/durable-objects/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/native-app
