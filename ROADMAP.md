# ROADMAP: agentes Core con Instinct

Actualizado: 2 octubre 2026. Plan aprobado: ALPHA/BETA/GAMMA del ERP ↔ chat con opencode (Mimo 2.6 Flash Free) como cerebro. Decisión del 2 de octubre de 2026: **no se usa transporte de email de Instinct**; los agentes solo conversan por chat dentro del ERP (`AP.ask` → proxy → opencode) y esa vía está verificada en Pages con el modelo real (14/14 y 6/6). El diseño de email firmado documentado más abajo queda como material histórico no ejercitado, no como trabajo pendiente.

## Transición: del monolito a un core extensible

[Diagrama de la arquitectura objetivo](docs/diagrama-core.svg). Todo el ERP (datos, vistas, agentes, modos) vive hoy en `index.html` (126 KB; eran 163 KB antes de extraer `core/*.mjs`) con SQL crudo en la UI y migraciones ad-hoc en JS. Un pack no puede entrar sin tocar el núcleo, y un PR no es revisable porque no hay dónde separar. La transición tiene tres entregables y un orden fijo: cada paso deja el sistema funcionando.

**Las dos misiones de los agentes, que no se mezclan:**

- *Operativa (A)* — ALPHA, BETA y GAMMA **leen, calculan y proponen** dentro del ERP, siempre pasando por la misma puerta de comandos que el humano. Supervisado deja la propuesta pendiente; Autónomo puede aprobar propuestas locales con auditoría, pero no emite compras ni recibe mercancía. Los subagentes jurídicos siguen siendo diseño, no ejecutores.
- *Evolución (B)* — el agente **propone cambios en el sistema** mediante issues y pull requests: detecta, escribe la especificación, redacta el pack declarativo y abre el PR argumentando qué se comparte con el núcleo y qué queda localizado. **Nunca hace merge**, nunca modifica `index.html`, `data/schema.sql` ni `data/seed/demo.json` para añadir un pack, y nunca marca `runtime_enabled: true` en su propio pack.

**Arquitectura objetivo:** kernel estable (esquema versionado, transacciones, políticas, registro de extensiones) + una superficie única `AP.command({cmd, payload, actor, mode})` por la que pasan UI y agentes (validar → autorizar según modo → efectos en `tx()` → `audit_log`) + packs **declarativos** sin JS arbitrario. El feedback entra por issues (especificación) y PRs (humanos y agentes proponen), y la CI es la puerta: `node scripts/validate-packs.mjs` en verde antes de integrar.

**Fases:**

- [x] **Paso 0 · diagrama** — `docs/diagrama-core.svg` con las tres capas, el ciclo de PR/issues y los límites de un pack.
- [x] **Paso 1 · esquema versionado** — hecho el 2 de octubre de 2026: `PRAGMA user_version`, plan en `data/migrations/index.json` (`schema.sql` es la entrada n=1) y migración `0002_compliance.sql`, que sustituye a `APCompliance.migrate()` en JavaScript. `AP.applyMigrations()` solo ejecuta lo que supera el pragma y cada fichero es idempotente; los cambios de esquema entran como migración nueva, no editando la base.
- [x] **Paso 2 · extraer `AP` a módulos ES** — hecho el 2 de octubre de 2026: `core/data.mjs` (`APData`), `core/policy.mjs` (`APPolicy`), `core/commands.mjs` (`APCommands`) y `core/views.mjs` (`APViews`, también en `globalThis`). `index.html` conserva `AP` con delegaciones del tipo `rows(...a){return APData.rows(...a);}`, espera `ap-core-ready` al inicio de `init()` y carga `core/index.mjs` junto a `instinct-ui.mjs`; el módulo importa los cuatro y despacha el evento. Sin cambios de comportamiento: mismos cuerpos movidos, `this` reescrito a `AP` y llamadas a modelos de negocio (`APCompliance.evaluate(AP, …)`) idénticas.
- [x] **Paso 3 · unificar el SQL de la UI en `AP.exec`/`AP.query`** — hecho el 2 de octubre de 2026: `AP.query(sql,args)` solo admite una sentencia `SELECT`/`WITH` parametrizada y `AP.exec({sql,args,actor,action,entity,id,detail,audit})` solo admite `INSERT`/`UPDATE`/`DELETE`, la ejecuta dentro de `tx()` (anidación admitida) y escribe una fila en `audit_log`, salvo `audit:false` para las escrituras intermedias de una misma operación. `AP.rows` y `AP.one` delegan en `query`, así que toda lectura queda validada; pasan por `exec` las 14 escrituras de UI y agentes (costes, cribado, radar, decide, receive, propose, cycle) y las auditorías siguen siendo las mismas de antes. El command bus por `cmd` con autorización por modo quedó resuelto en el Paso 6.
- [x] **Paso 4 · registro y puerta de packs** — hecho el 2 de octubre de 2026: `core/packs.mjs` (`APPacks`) carga `packs/index.json` y `data/migrations/index.json` al arrancar, registra cada país con validación de código ISO, estado, `runtime_enabled` y ficheros declarados, y expone `APPacks.gate(code)` → `{registered, eligible, reasons}`. `eligible` exige `status: "validado"`, pruebas adjuntas, migración asociada (`*_pack_XX.sql` en el plan de migraciones), datos declarados y `runtime_enabled: true`; los packs CO/VE se registran pero quedan no elegibles y **nada se carga en runtime** (sin datos, ni migraciones, ni reglas). Llamada no fatal en `init()` de `index.html`.
- [x] **Paso 5 · CI completa** — hecho el 2 de octubre de 2026, con esta base: (1) `cloudflare/worker.test.mjs` ya pasaba local sin red (**17 PASS**: validadores de consulta y respuesta, cola con fixtures, envío único) y no depende de nada externo, así que corre en un job de Node puro; (2) `scripts/test-agents.cjs` (17 casos) exige las dependencias que documenta `docs/agentes-erp.md` (`npm install --no-save playwright sql.js@1.13.0 chart.js@4.4.8`) y un Chrome, que en el runner es `/usr/bin/google-chrome` — por eso el script acepta ahora `CHROME_BIN` en vez de ruta fija (hoy también se puede ejecutar en Windows). Workflow nuevo `.github/workflows/erp-tests.yml` con dos jobs en cada PR y push a `main` (mismos triggers que `packs.yml`): *worker* (Node 22, segundos) y *agentes* (instala las tres dependencias, `CHROME_BIN`, sube `evidencia-*.png` y `resultados-agentes.json` como artefacto). `.gitignore` nuevo evita commitear `node_modules/` y las salidas de la raíz (la evidencia versionada sigue en `docs/evidencia-agentes/`). Hallazgo corregido de camino: la condición de espera del script (`AP?.db`) se cumplía antes de terminar migraciones y siembra, y hacía fallar 5 de 17 casos por «no such table»; ahora espera `user_version === 2` y `audit_log` con filas, el mismo criterio de las pruebas locales. Verificado local: **17/17 dos veces** (contador propio = casos `test()` = 17) y worker 17 PASS; verificado en CI tras el push.

- [x] **Paso 6 · command bus por cmd** — hecho el 2 de octubre de 2026: superficie única `AP.command({cmd, payload, actor, mode})` en `core/bus.mjs` (importado en `core/index.mjs`) que valida, autoriza por modo y delega en los manejadores existentes, cuyos efectos siguen dentro de `tx()` con sus auditorías (la puerta no añade filas de auditoría propia: los conteos de la vista de actividad no cambian). Catálogo: `propuesta_crear`, `propuesta_decidir`, `recepcion_registrar` (solo Supervisado: «Autónomo no registra recepciones») y `pedido_generar`. Reglas observables: comando desconocido, clave de payload fuera del catálogo, `sku`/`id` fuera de 1..128/1..64, `status` distinto de `aprobada|rechazada`, `actor` no textual o mayor de 80 y modo indicado distinto del activo se rechazan con error; la autorización usa siempre el modo activo `AP.mode`. Ya entran por la puerta los botones de decidir/recibir de la cola (el error de autorización se muestra como nota, sin error de página), el temporizador del motor de eventos y la herramienta `proponer_reposicion` del chat con `actor: 'ALPHA'`. Verificado: 6 casos nuevos en `scripts/test-agents.cjs` → **23/23 locales** por tres métodos (contador propio del script = casos `test()` = filas de `resultados-agentes.json`) y **23/23 en CI** (run 37072548854, 21 s); chat local 23/23, migraciones 13/13, worker y packs en verde; en Pages, tras el despliegue, `core/bus.mjs` responde 200 con `recepcion_registrar` solo Supervisado y las suites 6/6, 6/6 y 14/14 pasan sin errores de página, con el chat real creando propuestas a través de la puerta.

**Reglas que no cambian durante la transición:** ningún pack se salta cola, auditoría o confirmaciones; el modo Supervisado sigue dejando propuestas pendientes; Autónomo no compra ni recibe; los límites de `AGENTS.md` sobre núcleo y packs siguen vigentes. El kernel se cambia en un PR aparte, con responsable del núcleo.

## Mejora de la web: dependencias críticas autoalojadas

2 de octubre de 2026. `sql.js` 1.13.0 (`sql-wasm.js` 48.788 B + `sql-wasm.wasm` 659.806 B) y `chart.js` 4.4.8 (`chart.umd.js` 206.279 B) pasan de CDN externo (jsdelivr y cdnjs, sin `integrity`) a `vendor/` servido con el propio origen. Base del cambio: `initSqlJs` es imprescindible para arrancar `init()`, así que un CDN caído o bloqueado dejaba la demo sin ERP; además CI instalaba chart.js 4.4.8 desde `node_modules` mientras Pages servía 4.4.1, y ahora producción usa exactamente el fichero que prueba CI. Los tres ficheros se copiaron de `node_modules` con SHA-256 idéntico al origen y `locateFile` quedó relativo (`vendor/sql.js/1.13.0/`); `scripts/test-agents.cjs` y los harness locales sirven `.wasm` con `application/wasm`. Verificado: suites locales 23/23, 13/13 y 17/17; cero referencias a CDN por dos métodos (`git grep` y script Python con `locateFile_cdn=0`); en Pages el wasm responde 200 con `application/wasm` y 659.806 B, y las suites 6/6, 6/6 y 14/14 pasan sin errores de página. Siguen externos por no ser críticos (degradan sin bloquear el arranque): los widgets de TradingView, YouTube e identidad de Google y la fuente Inter de Google Fonts.

## Mejora: las suites locales entran en la CI

3 de octubre de 2026. `scripts/test-core.mjs` (23 casos: superficie `query`/`exec`, propuestas, decisiones, escrituras de UI de costes/cribado/radar/perfil y chat con modelo simulado) y `scripts/test-migrations.mjs` (13 casos: primera carga, plan de migraciones, vistas, recarga y restablecimiento) pasan de los harnesses temporales a scripts del repositorio. Base: la CI solo ejecutaba los casos de agentes y el worker; migraciones, módulos y escrituras de la UI no se probaban en ningún PR. Adaptaciones para que el resultado sea igual en local y en el runner: `ROOT` derivado del propio fichero (sin ruta absoluta), servidor en puerto efímero, `CHROME_BIN` opcional con `--no-sandbox`, red externa abortada (solo se sirve 127.0.0.1) y motor de eventos con intervalo ampliado o detenido, para que ninguna aserción dependa de llamadas al modelo. Verificado: locales 23/23 y 13/13 con cero fallos (doble método de conteo de líneas PASS: PowerShell y Python, ambas dan 23 y 13); en CI (run 37088368007, job `agents` 27 s) los cinco pasos en verde: dependencias, agentes (23), núcleo y chat (23), migraciones (13) y evidencia; job `worker` 7 s y packs 10 s.

## Mejora: meta, móvil y chart.js sin bloquear

3 de octubre de 2026. `index.html` estrena `meta description` (123 caracteres) y cuatro etiquetas `og:` (título, descripción, tipo y URL de Pages), y `chart.js` pasa a `<script defer>` para que deje de bloquear el arranque; el bloque de los dos gráficos queda envuelto en `APChartsInit`, que se ejecuta al instante si `Chart` ya está cargado o en `DOMContentLoaded` si aún no. Base: el buscador solo tenía el `title` y los botones sociales no tenían qué mostrar; con `defer`, `Chart` se resolvía tarde y `applyTheme()` —que recorría `Chart.instances` al arrancar— lanzaba `ReferenceError` dentro del script principal, `AP.init()` no corría y ninguna suite llegaba a `user_version`; dos guardias cierran el fallo (`typeof Chart !== 'undefined'` en `applyTheme`, con llamada de nuevo tras crear los gráficos para conservar los colores por tema, y guarda en `APChartsInit`). Cuatro comprobaciones nuevas en `scripts/test-core.mjs` → 27 casos: meta description con más de 40 caracteres, viewport 390×844 sin desplazamiento horizontal, botón de menú visible y apertura de la barra lateral (el chat se cierra antes, porque a esa anchura `#chatWindow` a pantalla completa interceptaba el clic). Verificado: test-core 27/27 dos veces seguidas (PowerShell = Python = 27, 0 fallos), agentes 23/23 y migraciones 13/13; CI run 37089462344 con los cinco pasos en verde (53 s); en Pages el HTML desplegado muestra `defer`, meta (123 caracteres) y `og:` (4 etiquetas), con `Chart.instances`=2 gráficos pintados y cero `pageerror`, y las suites 6/6, 6/6 y 14/14 pasan.

## Mejora: cobertura de desempate y doble recepción

3 de octubre de 2026. `scripts/test-core.mjs` pasa de 27 a 29 casos y cierra el punto 4 de los «huecos y próximos cambios propuestos» de `docs/agentes-erp.md`: (1) doble recepción — el segundo `AP.receive` de una propuesta ya recepcionada muestra «Recepción ya registrada» y no toca existencias, `stock_movements` ni auditoría; (2) desempate de proveedores — dos proveedores activos con el mismo plazo (7 días) y costes 900/600, `AP.propose` elige el de 600 y la auditoría `proveedor_seleccionado` lo refleja (`SUP-TIE-B`). Base: eran los únicos flujos de esa lista sin aserción automatizada (recepción manual y avance de RRHH ya corrían en test-core, reset en test-migrations); el resto de la lista (prompts separados, contexto de proveedores, reservas) sigue pendiente de diseño. Hallazgo corregido de camino: la columna de auditoría es `details_json`, no `detail`. Verificado: 29/29 en dos corridas consecutivas con doble método (PowerShell = Python = 29, 0 fallos).

## Mejora: prompts y contextos separados por agente

3 de octubre de 2026. Cierre del punto 1 y del matiz de proveedores del punto 2 de los «huecos y próximos cambios propuestos» de `docs/agentes-erp.md`. Base: todos los botones rotulados («BETA · Analizar cartera», «GAMMA · Evaluar plazos»…) llamaban a `AP.ask()` con el único prompt y el único contexto de ALPHA — los rótulos prometían una separación que no existía — y ningún chat veía proveedores pese a que el ROADMAP ya definía la matriz (ALPHA: stock, pedidos, propuestas, proveedores; BETA: sin proveedores; GAMMA: sin pedidos). Cambio: prompts propios en `APCorePrompts` (ALPHA intacto, más BETA y GAMMA con sus prohibiciones de atribución), `AP.context(agente)` con esa matriz, `ask(texto, quiet, agente)` con herramienta `proponer_reposicion` solo para ALPHA (y guarda `who==='ALPHA'` en el bucle de herramientas), estado/note/auditoría `analisis_completado` por agente, `data-agent` en los botones y —hallazgo corregido de camino— los wrappers de `instinct-ui.mjs`/`instinct-central-ui.mjs` perdían el tercer argumento al reenviar `AP.ask` (los tres botones seguían cayendo en ALPHA: lo detectó test-agents al seguir afirmado el viejo contrato «BETA sigue invocando ALPHA»). Verificado: test-core **31/31** dos veces con doble método (PowerShell = Python = 31, 0 fallos), test-agents **23/23** con los dos tests renombrados al nuevo contrato («Botón BETA invoca a BETA…», «Botón GAMMA invoca a GAMMA…») y migraciones 13/13.

## Mejora: contexto bajo demanda y reservas de BETA

3 de octubre de 2026. Cierre de los puntos 2 y 3 de los «huecos y próximos cambios propuestos» de `docs/agentes-erp.md`. **Contexto (hueco 2):** además de los proveedores ya incorporados, `AP.ask` añade `production` (`production_jobs`) o `planning` (`planning_tasks`) al JSON de contexto solo si el texto del pedido contiene palabras de producción/materiales/taller o de planificación/tareas/prioridades/calendario — el chat sigue sin recibir tablas que la pregunta no requiere. **Reservas (hueco 3):** `AP.cycle()` pasaba por alto `inventory.reserved` (la semilla ya traía 12/5/2 y la vista calculaba `available = on_hand - reserved`, pero ningún pedido nuevo lo movía); ahora, dentro de la misma transacción, reserva `min(reservado + pedido, existencias)` —el `CHECK (reserved <= on_hand)` se respeta— y el evento `pedido_generado` documenta `reserved_before`/`reserved`. La demanda queda enlazada con la reposición sin tocar `AP.propose()`: es `stock_status.available` el que alimenta `needs_restock` y la cantidad `target_stock - available`. Hallazgo corregido de camino: `scripts/test-agents.cjs` tenía fijado el contrato viejo («BETA crea pedido ficticio **sin reservar** stock» con `deepEqual(inventory)`), renombrado e invertido al nuevo contrato. Verificado: test-core **33/33** con doble método (PowerShell = Python = 33, 0 fallos), test-agents **23/23** y migraciones 13/13. Actualización de documentación el mismo día en `docs/agentes-erp.md`: las secciones BETA y GAMMA seguían describiendo los botones «por tanto ALPHA», «sin reservar» y «el chat normal no recibe esas tablas» (ya corregido a los contratos nuevos), se añadió una nota bajo la tabla histórica de 17 casos indicando qué tres filas cambiaron, y el ensayo de agentes se documenta con sus 23 casos.

## Prueba manual temporal (fuera de alcance: sin email de Instinct)

[Quickstart de ida y vuelta](docs/quickstart.md): modo SIN firma, NO AUTENTICADO, opt-in explícito antes de OAuth, revisión de cuenta/destinatario/cuerpo por turno y respuesta inerte rotulada. No autoenvíos, no compras ni herramientas. El test real aún está pendiente; la firma HMAC no está lista. Acceso al panel movido al final del menú lateral.

## Estado real (canal actual: chat con opencode; diseño de email Instinct fuera de alcance)

- [x] Diseño por agente, IDs, nonce, conversación, secuencia y respuesta inerte.
- [x] Módulo navegador `instinct-gmail.mjs`: llamadas Gmail API, OAuth GIS, perfil de cuenta, scopes mínimos para enviar/leer, MIME, firma/verificación WebCrypto, minimización y límites, correlación de respuestas, bloqueo de reenvío ambiguo.
- [x] Biblioteca de log localStorage y resumen por ventana con anomalías, límites y pérdida de retención declarada.
- [x] 27 comprobaciones locales en `instinct-gmail-test.mjs`, solo fixtures. Ejecutar `node instinct-gmail-test.mjs` (Node 22).
- [x] Panel UI `instinct-ui.mjs` cargado por index.html: configuración pública, OAuth, selector ALPHA/BETA/GAMMA, revisión del cuerpo/destino, chat cableado al activar el puente, respuesta firmada inerte y vista de log. Pruebas locales de controles y revisión visual; no OAuth real aún.
- **Fuera de alcance** (decisión 2 oct 2026, sin email de Instinct): crear/configurar OAuth client Google y habilitar Gmail API.
- **Fuera de alcance** (decisión 2 oct 2026): autorizar y verificar cuenta ERP elegida por el dueño (Gmail) y confirmar destino de Instinct antes de un primer envío.
- **Fuera de alcance** (decisión 2 oct 2026): provisión segura de HMAC en ambos extremos y respondedor real que valide solicitudes y firme respuestas.
- **Fuera de alcance** (decisión 2 oct 2026): primer correo real, diálogo multiturno, captura y timings reales.
- **Fuera de alcance** (decisión 2 oct 2026): cobertura de eventos y verificación periódica con respuestas reales de Instinct. El canal real de los agentes es el chat con opencode (Mimo 2.6 Flash Free), ya probado en Pages con auditoría.

## Fase 1: Pages + Gmail OAuth, navegador abierto (fuera de alcance)

El ERP sigue en GitHub Pages. El navegador obtiene consentimiento OAuth y llama directamente a Gmail API por HTTPS. No SMTP/POP en navegador, no Node en Pages, no client secret, contraseñas ni refresh token en la web.

Token de acceso solo en memoria. Caduca; para renovarlo hace falta gesto del usuario. Cerrar pestaña detiene actividad; los temporizadores pueden retrasarse en segundo plano. La cola actual del módulo es volátil: pendientes y resultados no sobreviven recarga. Persistencia local de cola y recuperación de envíos inciertos por Gmail Sent quedan pendientes; nunca reenviar automáticamente tras timeout.

Cuenta de correo del ERP: `fivetech2@gmail.com`, elegida por el usuario para esta prueba. Confirmar perfil exacto tras OAuth. Antes de enviar, revisar cuenta, destinatario y cuerpo final. OAuth concede acceso técnico, no autorización general para mandar correos.

### Configurar Google Cloud

Guía paso a paso: [Configurar Gmail OAuth para Pages](docs/setup-gmail-oauth.md). Incluye permisos, cuenta de prueba, Client ID, autorización y límites antes del primer envío real.

1. Crear/elegir proyecto propio.
2. Biblioteca de APIs: habilitar Gmail API.
3. Google Auth Platform: Branding (nombre/contacto), Audience (External para Gmail personal), Testing y test user con el buzón ERP.
4. Data Access: `https://www.googleapis.com/auth/gmail.send` y `https://www.googleapis.com/auth/gmail.readonly`. No modify ni acceso completo. send es sensible; readonly restringido. Ampliar usuarios/publicar puede exigir verificación Google.
5. Clients: OAuth client de tipo Web application. JavaScript origin: `https://fivetechsoft.github.io`, SIN ruta `/Core/`. El token/popup GIS no usa un client secret ni requiere un redirect URI inventado.
6. Configurar Client ID público (termina en `.apps.googleusercontent.com`). No subir Client Secret.
7. Cargar Google Identity Services desde `https://accounts.google.com/gsi/client`, autorizar con botón, verificar perfil y scopes concedidos.

## Protocolo y contexto

UTF-8 JSON en email text/plain; admite el único text/plain de un multipart/alternative, no HTML ni varios cuerpos ambiguos. Request: versión, tipo, scope analysis-only, ID aleatorio, nonce, conversación, agente, secuencia, fecha, caducidad de 15 minutos, reply_to, pregunta, snapshot, historial y firma. Response repite identidad de turno, fechas, scope y añade text/firma. No se aceptan respuestas cruzadas, caducadas o sin firma.

ALPHA: stock, pedidos, propuestas, proveedores. BETA: stock, pedidos, propuestas. GAMMA: stock, propuestas, proveedores. Solo campos permitidos, sin nombres/contactos de clientes. Máximo 80 filas por tabla y 40 KB; conteos explícitos de filas omitidas y posibilidad de acotar por SKU. El snapshot de cada turno es autosuficiente: no usa deltas que dependan de un email perdido. Historial máximo seis mensajes; el controlador UI aún debe construirlo y conservar secuencia por agente.

Instinct recibe la pregunta y datos del ERP para analizar, no una autorización de negocio. Puede pedir datos faltantes. No afirma compras, cobros, entregas ni aprobaciones inexistentes. Respuesta mostrada como texto, nunca ejecutada como código ni herramientas. El motor de pedidos simulados debe detenerse cuando se active este modo; implementación UI pendiente.

## Seguridad

HMAC-SHA256 con JSON canónico. En fase 1 el módulo exige CryptoKey no extraíble suministrado privadamente por sesión. No incluye mecanismo de provisión de clave: queda pendiente. NO colocar HMAC en JavaScript publicado, repo, localStorage, URL o email. Una CryptoKey no extraíble evita exportar sus bytes, pero un XSS puede usarla para firmar: Pages no tiene el aislamiento de un servidor. Hay que revisar scripts externos y reducir superficie antes de usar datos privados.

Una dirección From y el ID no prueban identidad. Gmail OAuth autentica acceso a la cuenta, no autoría de todo correo que contiene. Firma válida autentica posesión de clave, no permiso para actuar. En modo firmado se rechazan respuestas sin firma. La prueba manual temporal, elegida explícitamente, acepta solo respuestas con marcador none-manual-test y IDs/fechas válidos, pero no autentica al autor. HMAC no cifra el contenido de email ni lo oculta a proveedores de correo.

## Log y revisión periódica

Fase 1: localStorage, esquema `v`, `next`, `dropped`, `events`. Evento: número monotónico, fecha, tipo, agente, ID de turno/conversación, secuencia, estado, duración y código de error. No tokens, claves, cuerpos de correo, stock íntegro ni datos personales. Capacidad por defecto 2000 eventos; al rotar se registra cuántos se perdieron. Error de cuota/corrupción debe mostrarse, no simular auditoría completa. El log es editable y puede borrarse: NO prueba independiente o inmutable.

Resumen `adaptapro.audit/1`: ventana de secuencias, fechas, conteos, metadatos de últimos 100 turnos, errores, conflictos de routing, truncación y eventos omitidos. Instinct debe informar cobertura, turnos no cerrados/duplicados, errores y anomalías, no certificar negocio real solo por un log del cliente.

Cada X minutos configurable (5..1440, valor de diseño inicial 60) se prepara resumen local. Biblioteca `scheduleReview` no envía correo y su cursor solo significa resumen generado, NO verificado. Para activar autoenvío hacen falta cuenta/destino, permiso del dueño sobre contenido/cadencia y límite, firmador/respondedor, correlación de informe y cursor de última verificación confirmada. Evitar autoenvíos superpuestos y duplicados; pausar con token caducado. No decir "verificado por Instinct" hasta una respuesta auténtica correlacionada.

## Fase 2: backend persistente 24/7 (fuera de alcance)

- Node/servicio detrás de proxy TLS autenticado y roles; no GitHub Pages.
- Buzón dedicado con SMTP/POP TLS o Gmail OAuth de servidor, secretos fuera del repo.
- Cola durable transaccional, idempotencia, recuperación SMTP incierto, deduplicación, límites y retención.
- Trabajador único por buzón, polling acotado según proveedor o notificación soportada; no poll por petición. Backend propio puede entregar estado al chat sin esperar email.
- Firmador aislado, registro de auditoría de servidor, revisión periódica durable con alertas verificadas.
- Monitor activo aunque se cierre navegador; permisos de negocio y comunicaciones siguen separados.

## Criterio de aceptación real (email, fuera de alcance)

Probar ALPHA, BETA y GAMMA con datos del ERP; varios turnos y contexto correcto; respuesta fuera de orden sin mezcla; duplicados, timeout/reinicio sin reenvío; OAuth expirado; firmas inválidas; log/anomalías y revisión confirmada. Medir envío Gmail API, llegada/request, análisis/respondedor, llegada/respuesta y chat visible. No sumar métricas anidadas, no sustituir latencia real por mocks ni los 180 ms del relay local.

## Fuentes de configuración (Google OAuth, fuera de alcance)

- https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/gmail/api/auth/scopes
- https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send
- https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list
