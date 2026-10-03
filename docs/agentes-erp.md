# FiveTech ERP: trabajo exacto de los agentes

Revisión del código y prueba local: 1 de octubre de 2026. Base revisada: `main` en `52f52dac8fce607d2a634bbaee27f860b6f18da3`. Este documento distingue funciones locales que existen, simulación y trabajo futuro. No certifica producción ni vigencia jurídica.

## Resumen

Hay tres nombres operativos: ALPHA, BETA y GAMMA. No son tres modelos independientes: sigue existiendo un único chat y un único modelo, pero desde el 3 de octubre de 2026 cada botón rotulado envía con el prompt y el contexto propios de ese agente y la auditoría lo refleja; BETA genera pedidos demo con JavaScript y GAMMA selecciona proveedor con SQL dentro de la creación de propuestas. Además existen siete fichas jurídicas de diseño, una capa local de cumplimiento y un cribado RRHH por palabras clave. Ningún agente compra, paga, contrata, declara impuestos o gestiona envíos reales.

| Componente | Implementado hoy | No implementado |
| --- | --- | --- |
| ALPHA | Chat con contexto de stock/pedidos/propuestas; herramienta de reposición; auditoría | Gestor de compras reales, optimizador integral o análisis con acceso a todas las tablas |
| BETA | Generador periódico de pedidos ficticios; vistas de cartera y señales | Agente de ventas conectado a clientes, predicción aprendida o cambio de precios |
| GAMMA | Proveedor activo con menor plazo, coste como desempate | Seguimiento de transportistas, incidencias reales o optimización multicriterio |
| CUMPLIMIENTO | Revisión demostrativa que devuelve `review` | Motor jurídico que valide reglas o certifique cumplimiento |
| Siete subagentes jurídicos | Catálogo de ámbitos, jerarquías y rutas sugeridas | Ejecutores, dictámenes o declaraciones |
| RRHH / Currícula | Puntuación textual 0-80, guardado local, avance humano | Lectura automática de CV, selección o contratación |

## ALPHA: inventario y propuestas

- **Función exacta:** `AP.ask(texto, quiet, agente)` envía pregunta, modo y `AP.context(agente)` con el prompt `APCorePrompts` del agente (ALPHA: stock, pedidos, propuestas y proveedores; BETA: sin proveedores; GAMMA: sin pedidos). Si el texto menciona producción/materiales o planificación/tareas/prioridades, el contexto añade `production_jobs` o `planning_tasks`. Solo ALPHA recibe la herramienta `proponer_reposicion`; si la usa, ejecuta `AP.propose()`. Acepta como máximo dos llamadas de herramienta por respuesta y hace una segunda consulta para redactar el resultado. Los envíos silenciosos del ciclo siguen siendo de ALPHA.
- **Datos que lee:** `stock_status` (físico, reservado, disponible, umbral y objetivo), líneas de pedido con estado y región, propuestas con cantidad/motivo/estado. La herramienta lee también proveedores activos y catálogo de costes/mínimos. El contexto del chat normal NO incluye proveedores, personal, producción ni tareas. Que una vista muestre una tabla no significa que el modelo la reciba.
- **Decisión que propone:** reposición de SKU con `available <= reorder_point`. Cantidad: `max(target_stock - available, min_order_qty)` del proveedor elegido. Crea propuesta y cola; no acepta una cantidad arbitraria del modelo.
- **Disparadores:** chat, botón analizar, botones de vistas y ciclo local cuando un pedido demo afecta a SKU bajo umbral. En el ciclo, no vuelve a pedir modelo si existe propuesta pendiente/aprobada para ese SKU, y limita el inicio de análisis a una vez por minuto.
- **Efectos locales:** `purchase_proposals`, `approval_queue`, `compliance_checks`, auditoría ALPHA/GAMMA/CUMPLIMIENTO y persistencia IndexedDB. `analisis_completado` indica fin del flujo del chat, no compra ni acierto del análisis.
- **Límites:** SKU desconocido o sin alerta se rechaza; propuesta pendiente duplicada no se crea; sin proveedor activo falla. No reserva ni aumenta stock. En el modo Autónomo existe una rama de autoaprobación si cumplimiento fuese `pass`, pero el evaluador actual siempre devuelve `review`: las nuevas propuestas quedan pendientes en ambos modos.
- **No puede hacer:** comprar, pagar, dar por recibida mercancía, editar precios, fechas, personal o producción. Una persona decide la propuesta con responsable y motivo. Otra acción explícita registra recepción local después de verificar entrega.
- **Ejemplo probado:** SKU-451 tiene 18 físicos, 12 reservados, 6 disponibles, umbral 20 y objetivo 80. La propuesta nueva es de 74 unidades (salvo mínimo superior), queda pendiente y deja stock intacto. La semilla ya contiene una propuesta pendiente de ese SKU; el ensayo de creación retiró esa propuesta en su base aislada para probar una nueva.
- **Propuesto:** dar al chat contexto por módulo (parcial desde el 3 de octubre de 2026: producción y planificación entran si la pregunta lo pide) y cubrir demanda de pedidos con reservas reales (hecho: `AP.cycle()` reserva la cantidad pedida). Sigue pendiente separar análisis de herramienta.

## BETA: ventas y señales de demanda

- **Función exacta:** `AP.cycle()` crea un pedido ficticio cada 30 segundos, solo con pestaña visible, base lista y sin otro ciclo/chat ocupado. Usa cliente fijo "Canal digital", región "España", estado pendiente; alterna SKU-451/SKU-713 y cantidades 2, 3, 4 según contador de auditoría.
- **Datos que lee:** contador de `pedido_generado`, número de pedidos, precio de venta del SKU, `stock_status`, propuestas existentes y tiempo del último análisis. Vistas de ventas/CRM/precios leen agregados locales.
- **Decisiones que propone:** alertas de riesgo de stock para pedidos pendientes; seguimiento prioritario si el agregado de cliente supera dos pedidos; alerta de actividad tras cuatro pedidos del motor. Son reglas de demo, no probabilidades ni pronóstico entrenado.
- **Disparadores:** temporizador visible; las consultas "BETA · Analizar pedidos/clientes/precios/cartera" llaman `AP.ask(texto, false, 'BETA')` con el prompt `APCorePrompts.BETA` y contexto sin proveedores (desde el 3 de octubre de 2026).
- **Efectos locales:** inserta `sales_orders`, `sales_order_lines` y auditoría BETA; en la misma transacción reserva `min(reservado + pedido, existencias)` en `inventory.reserved` (no toca el físico) y lo refleja en `reserved_before`/`reserved` del evento `pedido_generado`.
- **No puede hacer:** contactar clientes, emitir factura, cobrar, confirmar entrega, aceptar venta real, cambiar precios o asignar descuentos.
- **Ejemplo probado:** un ciclo añade exactamente un pedido y un evento BETA, y reserva la cantidad del SKU pedido (limitada por las existencias); el resto de las filas de inventario quedan idénticas antes y después.
- **Propuesto:** ingerir pedidos reales, calcular demanda y sugerir precio con evidencia y revisión humana. No está implementado. Los gráficos de demanda/costes en el dashboard tienen arrays fijos, no resultados BETA.

## GAMMA: proveedores y logística

- **Función exacta:** durante `AP.propose()`, SQL filtra proveedores activos del SKU, ordena por `lead_days ASC, unit_cost_cents ASC` y toma uno. El plazo tiene prioridad sobre el precio; el coste solo desempata. No es un análisis de un modelo independiente.
- **Datos que lee:** `suppliers` y `supplier_products`: activo, SKU, días, coste y mínimo. Las vistas muestran opciones; el chat ALPHA y el de GAMMA reciben esas tablas y el de BETA no (matriz de contextos).
- **Decisión que propone:** asociar ese proveedor a la propuesta ALPHA y fijar su coste unitario/mínimo.
- **Disparadores:** creación válida de reposición. El botón "GAMMA · Evaluar plazos" llama `AP.ask` con el prompt y contexto de GAMMA (desde el 3 de octubre de 2026); no crea un ejecutor GAMMA aparte.
- **Efectos locales:** estado visual y auditoría `proveedor_seleccionado`; proveedor/coste quedan en la propuesta.
- **No puede hacer:** emitir orden de compra, negociar, verificar stock del proveedor, contactar transportista, programar envío o prometer entrega. Los días son catálogo local, no disponibilidad confirmada.
- **Ejemplo probado:** propuesta nueva de SKU-451 usa el proveedor que devuelve el orden SQL; al desactivar todos los proveedores, la creación falla con "No hay proveedor activo".
- **Propuesto:** comparar coste total, capacidad, fiabilidad y riesgo, con datos externos y autorización de compras. No implementado.

## CUMPLIMIENTO: guardia local, no dictamen

`APCompliance.evaluate()` lee únicamente capas `DEMO-%` ordenadas por nivel. Si faltan capas/fuentes superiores devuelve `review`; incluso con fuentes devuelve `review` por la política ilustrativa. No interpreta el SKU, cantidad o proveedor ni consulta normas por Internet. El esquema admite `pass`/`block`, pero este evaluador no los produce.

Al proponer se guarda el resultado; al decidir se reevalúa. No aprueba, compra ni cambia stock. Una persona puede aprobar localmente un estado `review` con responsable y motivo; esto no convierte el resultado en certificación jurídica. Los nombres de fuentes CO son referencias de la demo, cuya vigencia no se verificó en este ensayo. El selector CO/VE modifica la vista, no activa motores fiscales.

## Siete subagentes jurídicos: diseño y trabajo futuro

**Estado común actual:** `APCompliance.agents` se copia a `legal_subagents`; la vista lee esas fichas y hasta 20 propuestas, y muestra una clasificación candidata. No reciben expedientes ni ejecutan análisis. Laboral tiene `demo` (fuentes Colombia); los otros seis están `unconfigured`. En VE, Laboral se muestra por configurar. La columna "Trabajo propuesto" no representa una capacidad operativa.

| Subagente | Trabajo propuesto y datos necesarios | Disparador propuesto y decisión a preparar | Acciones prohibidas / ejemplo |
| --- | --- | --- | --- |
| Mercantil | Revisar compras, proveedores, operaciones y contratos comerciales; propuesta, partes, jurisdicción, contrato, fuentes vigentes | Compra/contrato nuevo; señalar cláusulas, riesgos y documentos faltantes para revisión | No aprobar compra, firmar ni constituir sociedad. Ejemplo: propuesta de suministro candidata a revisión mercantil, hoy "Sin revisión de subagentes" |
| Laboral | Revisar vínculo, jornada, salario y seguridad social; contrato, periodo, horas, modalidad, país y normas validadas | Alta/cambio de personal o nómina; preparar incidencias y cálculo revisable | No contratar, despedir, liquidar ni pagar. Ejemplo: salario 3.000.000 COP, 15 días: simulador muestra 1.500.000 ordinario, no neto |
| Civil / contratación | Revisar formación, ejecución, garantías y terminación; documentos y cláusulas, partes, ámbito | Borrador/renovación; sugerir correcciones y obligaciones a validar | No firmar, rescindir o emitir opinión definitiva. Ejemplo: renovación con garantía pendiente de documento; hoy sin análisis de cláusulas |
| Tributario nacional | IVA, renta/ISLR, parafiscales y tributos sectoriales; país, régimen, operación, bases y fuentes | Facturación/operación gravada/nómina patronal; preparar aplicabilidad y revisión de cálculo | No inferir impuesto, declarar o pagar. Ejemplo: factura VE: falta régimen para determinar ISLR; hoy no calcula |
| Tributario regional | Revisar nexo de región/estado/departamento; territorio, establecimiento/inmueble, bases y competencia | Nueva operación con nexo regional; identificar norma y obligación candidata | No asignar tributo por nombre del país. Ejemplo: apertura regional sin territorio definido, revisión pendiente |
| Tributario local | Revisar municipio/distrito, actividad, inmuebles y permisos; domicilio, actividad y normas locales | Alta de local/actividad; preparar checklist de permisos/tributos | No presentar trámite ni cobrar tasas. Ejemplo: local nuevo sin municipio, no se determina obligación |
| Administrativo | Ordenar hechos, expediente, entidad, actos, plazos y cauce | Queja, petición o recurso; preparar resumen y opciones para asesor humano | No acusar funcionarios ni generar/presentar denuncias automáticamente. Ejemplo: acto recibido, falta fecha de notificación para analizar plazo |

Los siete requerirían país, territorio, sector, reglas/fuentes vigentes y responsable profesional antes de activarse. Los packs CO son contratos de diseño (`runtime_enabled: false`), no carga automática de reglas.

## RRHH, talento y módulos relacionados

No hay un cuarto modelo con nombre propio. `assessEvidence()` busca tres familias de palabras (colaboración, aprendizaje y responsabilidad), suma 20 por cada una y 20 si encuentra un ejemplo/resultado específico. Máximo 80. Desde 60 deja `review`; por debajo pide evidencia. No aprueba ni rechaza automáticamente. Lee solo el texto voluntario (hasta 700 caracteres); alias y posición se guardan con resultado en `candidate_screenings`.

El usuario dispara el cribado en Currícula. Avanzar un perfil exige botón y confirmación; crea una entrada "Detectado" en `recruitment_pipeline`, no un contrato. El tablero y los costes de mano de obra se editan manualmente. El simulador nómina calcula únicamente `round(salario * días / 30)`; no guarda una liquidación, no calcula neto ni paga. RRHH/Talento muestran capacidad y carga local, no seleccionan o asignan personas. Producción y planificación son vistas locales, no agentes ejecutores.

**Ejemplo probado:** texto "Profesional excelente" devuelve 0/80 y `needs_evidence`; "Coordiné equipo, aprendí y entregué un proyecto" devuelve 80/80 y `review`. La puntuación mide coincidencias textuales, no mérito ni compatibilidad cultural. Un proceso real requeriría criterios aprobados, consentimiento, protección de datos y evaluación de sesgo.

## Motor automático: encendido y apagado

El botón **🤖 Agentes** de la cabecera detiene o reanuda el ciclo automático de 30 segundos (`AP.cycle()`), que es la única vía que llama al modelo sin que nadie escriba. Con el motor detenido no hay llamadas automáticas ni eventos BETA nuevos; el chat, el botón "Analizar" y los botones de vista siguen funcionando porque son acciones explícitas del usuario.

- Estado en `AP.agentsOn`, guardado en `localStorage` con la clave `adaptapro-agents` (`on`/`off`); si la clave no existe el motor arranca activo.
- Al detener se limpia `AP.cycleTimer`, el botón pasa a **⏸ Agentes** con `aria-pressed="false"` y el texto del motor queda en "Motor de agentes detenido · sin consumo automático".
- Al reactivar, `startCycle()` vuelve a crear el temporizador con `cycleIntervalMs` (30 000 ms) y restaura el texto de actividad.
- `cycle()` también sale antes de tocar datos si la pestaña está oculta o si hay otro ciclo o chat en marcha.

**Verificación (2 octubre 2026):** con el motor detenido, 30 segundos con la pestaña visible produjeron 0 llamadas al modelo y 0 filas nuevas en `audit_log`; el estado sobrevive a la recarga y se reactiva con un clic. Servida desde GitHub Pages, la misma comprobación dio idéntico resultado.

## Puentes: transporte alternativo, no agentes adicionales

`instinct-ui.mjs` y `instinct-central-ui.mjs` pueden sustituir `AP.ask()` al habilitar explícitamente un puente y paran el ciclo. Permiten seleccionar ALPHA/BETA/GAMMA como etiqueta del turno. Reciben respuestas como texto inerte; no ejecutan `proponer_reposicion` desde el correo.

El Gmail manual compacta contexto por etiqueta (GAMMA sin pedidos, BETA sin proveedores). La UI central prepara las cuatro tablas permitidas, hasta 80 filas por tabla; requiere consentimiento, revisión y ejecución explícita del turno. Cola aceptada, correo enviado y respuesta no son pruebas de identidad o acción empresarial. No se habilitó ningún puente en estas pruebas; no se contactó Cloudflare ni Gmail. Tampoco se midió un modelo real o un roundtrip.

## Verificación local ejecutada

Chromium local, HTTP solo en 127.0.0.1, perfil nuevo y SQLite/Chart.js servidos desde dependencias locales. Toda petición externa se abortó. Para `ask()` se sustituyó `modelCall` con respuestas sintéticas y fallo controlado. El código de negocio, SQLite, IndexedDB y UI fueron los del repo. No se tocó ningún PC del operador ni se cambió SEND_ENABLED.

**Resultado: 17/17 casos pasan; 0 errores JavaScript.** Esto verifica lógica local y fronteras de supervisión, no exactitud de un modelo ni sistemas reales. Las primeras expectativas del ensayo asumían ausencia de propuesta semilla y alerta en SKU-713; se corrigió la fixture, no el producto: se retiró la propuesta pendiente de la base aislada y se puso SKU-713 en alerta explícita.

| Caso | Esperado | Resultado observado |
| --- | --- | --- |
| Carga limpia | 3 SKU y 3 nombres operativos | Sí |
| BETA ciclo | +1 pedido, sin modificar inventario | Sí |
| ALPHA + GAMMA | Propuesta pendiente, proveedor por plazo/coste, check review | Sí; SKU-451, 74 unidades |
| Duplicado pendiente | Sin nueva propuesta | Sí |
| SKU desconocido/stock suficiente | Rechazo | Sí |
| Autónomo | Nueva propuesta pendiente por review | Sí, SKU-713 con fixture de alerta |
| Sin proveedor | Error y sin nueva propuesta | Sí |
| ask con tool simulada | Dos llamadas, propuesta y texto inerte | Sí; HTML/script no ejecutado |
| Botón BETA | Prompt real ALPHA | Sí; no modelo BETA separado |
| Botón GAMMA | Prompt real ALPHA | Sí; no modelo GAMMA separado |
| Modelo falla | Datos conservados y estado Sin respuesta | Sí |
| Jurídicos | Siete tarjetas, sin revisión automática | Sí |
| Venezuela | Selector cambia vista, check sigue review | Sí |
| Cribado RRHH | 0/80 y 80/80 sin aprobación | Sí |
| Nómina | 3.000.000 x 15/30 = 1.500.000, no neto | Sí |
| Decisión humana | Estado aprobado, stock intacto | Sí |
| Recarga | Propuestas conservadas en IndexedDB | Sí |

La tabla registra la ejecución original de 17 casos. Tres filas han cambiado de contrato desde el 3 de octubre de 2026 y ahora se verifican en las suites actuales: el ciclo de BETA reserva stock (fila «BETA ciclo», hueco 3) y los botones BETA/GAMMA usan su propio prompt y contexto (filas «Botón BETA» y «Botón GAMMA», hueco 1).

Además: `node instinct-gmail-test.mjs` (27 fixtures), `node cloudflare/worker.test.mjs` (validadores y cola con fetch simulado), `node scripts/validate-packs.mjs` (CO) pasaron. No son pruebas del servicio desplegado.

### Evidencia y reproducción

- [Resultados detallados](evidencia-agentes/resultados-agentes.json)
- [Ensayo reproducible](../scripts/test-agents.cjs) (23 casos): necesita Node, Google Chrome (o la variable `CHROME_BIN`) y `npm install --no-save playwright sql.js@1.13.0 chart.js@4.4.8` en la raíz. Ejecutar `node scripts/test-agents.cjs`. Solo usa 127.0.0.1; aborta red externa y simula modelo. El workflow `.github/workflows/erp-tests.yml` lo ejecuta en cada PR y push junto con `cloudflare/worker.test.mjs` y sube capturas y `resultados-agentes.json` como artefacto; espera a que `user_version` y la auditoría indiquen que migraciones y siembra terminaron antes de la primera aserción.
- [Suite de núcleo y chat local](../scripts/test-core.mjs) (33 casos: superficie `query`/`exec`, propuestas, decisiones, doble recepción y desempate de proveedores, reservas de BETA, escrituras de UI, chat con modelo simulado, prompts y contextos separados por agente, contexto condicional de producción/planificación, meta description y comprobaciones de móvil a 390×844) y [suite de migraciones en navegador](../scripts/test-migrations.mjs) (13 casos: primera carga, plan de migraciones, vistas, recarga y restablecimiento). Misma base de dependencias; servidor en puerto efímero, red externa abortada y motor de eventos detenido para que ninguna llamada real dependa de la red. El mismo workflow las ejecuta tras la suite de agentes.
- [Agentes / auditoría local](evidencia-agentes/3-agentes.png)
- [Subagentes jurídicos](evidencia-agentes/4-juridicos.png)
- [RRHH](evidencia-agentes/5-rrhh.png)

Las capturas muestran datos de fixture, no operaciones reales. Los detalles son de una ejecución aislada fechada, no logs de producción.

## Huecos y próximos cambios propuestos

1. Separar prompts y contextos ALPHA/BETA/GAMMA; hoy los rótulos de botones sugieren separación que no existe. Cerrado el 3 de octubre de 2026: prompts `APCorePrompts`, `AP.context(agente)`, herramienta solo para ALPHA y auditoría por agente (ver `scripts/test-core.mjs` y `scripts/test-agents.cjs`).
2. Incluir contexto de proveedores/producción/planificación cuando la pregunta lo requiera. No atribuir al chat datos que no recibe. Cerrado el 3 de octubre de 2026: proveedores según la matriz del ROADMAP (ALPHA y GAMMA), y `production`/`planning` se añaden al contexto solo si el texto del pedido contiene palabras de producción/materiales o de planificación/tareas/prioridades.
3. Reservar stock por pedido y enlazar cantidad demandada con reposición. Hoy BETA no cambia reservas. Cerrado el 3 de octubre de 2026: `AP.cycle()` reserva `min(reservado+pedido, existencias)` en `inventory` dentro de la misma transacción del pedido y lo refleja en el detalle `reserved_before`/`reserved` de `pedido_generado`; la reposición queda enlazada porque `stock_status` ya calcula `available = on_hand - reserved` y es lo que usan `needs_restock` y la cantidad de `AP.propose()`.
4. Casos de desempate de proveedores y doble recepción añadidos a `scripts/test-core.mjs` el 3 de octubre de 2026; recepción manual, avance de RRHH y reset ya estaban cubiertos en `test-core.mjs`/`test-migrations.mjs`. Con ello este punto queda cerrado.
5. Mantener jurídicos como diseño hasta contar con reglas, fuentes actuales y revisión profesional. No activar cálculos por completar fichas.

Nada de esto se implementó ni se desplegó con este documento, salvo los puntos 1, 2, 3 y 4, que se añadieron después.

## Fuentes de código

- [index.html](../index.html): `AP` (delegando en los módulos), `APAgentCenter`, `APCompliance`, `APNotices`.
- [core/index.mjs](../core/index.mjs): núcleo en módulos ES — `data.mjs` (`APData`, con la superficie SQL validada `AP.query`/`AP.exec` y `tx()`), `policy.mjs` (`APPolicy`), `commands.mjs` (`APCommands`), `views.mjs` (`APViews`), `packs.mjs` (`APPacks`, registro y `gate()` de `packs/index.json`, sin carga en runtime).
- [schema.sql](../data/schema.sql): tablas, restricciones y `stock_status`.
- [demo.json](../data/seed/demo.json): semilla ficticia julio de 2030.
- [Gmail UI](../instinct-ui.mjs), [contrato Gmail](../instinct-gmail.mjs).
- [UI central](../instinct-central-ui.mjs), [cliente central](../instinct-central-client.mjs), [worker](../cloudflare/worker.mjs).
- [Packs](../packs/README.md), [manifiesto CO](../packs/CO/manifest.json), [guía de contribución](../CONTRIBUTING.md).

## Cambio de marca sin migración técnica

El nombre visible pasa a FiveTech. El repositorio se renombró a `FiveTechSoft/Core` el 3 de octubre de 2026 (la URL antigua `FiveTechSoft/AdaptaPro` redirige en GitHub) y con él cambió la URL de Pages a `https://fivetechsoft.github.io/Core/`: la anterior da 404 sin redirección. Se conservan el worker `adaptapro-bridge`, claves IndexedDB/localStorage, globales JS, versiones `adaptapro.instinct/1` y `adaptapro.audit/1`, acción Turnstile, asuntos de correo del protocolo y nombres de aplicaciones OAuth ya documentados; el origen OAuth y `PAGES_ORIGIN` siguen siendo `https://fivetechsoft.github.io` sin ruta, ajenos al nombre del repositorio. Cambiarlos sin migración rompería enlaces, datos locales o integraciones. No se renombró ni desplegó ningún servicio; una migración técnica sería una decisión y tarea separadas.
