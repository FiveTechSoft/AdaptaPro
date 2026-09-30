# Prueba real del puente: 30 de septiembre de 2026

## Resultado

Una consulta revisada de ALPHA sobre SKU-451 completó la ida y vuelta por correo. Datos demo; análisis de texto inerte, NO AUTENTICADA. No se ejecutaron compras ni cambios del ERP.

Horas Europe/Madrid (CEST):

- 10:44:57: llegó el request al buzón de Instinct. El mensaje también se comprobó en Gmail Enviados, con etiqueta SENT.
- 10:46:46: se envió la respuesta JSON como reply al mismo buzón ERP, sin CC/BCC ni adjuntos.
- 10:46:47: Gmail aceptó la entrega de la respuesta (SMTP 250 OK).
- 10:49:47: captura del usuario; se informó de Estado ALPHA answered para el mismo ID completo tras pulsar Comprobar respuestas. La inspección visual de esa captura se realizó en la conversación de prueba, no desde una sesión remota del tester.

Consulta: 367b167612514d67925cdbec7593927e. No se publican tokens, nonce, capacidad de sesión ni el snapshot completo.

## Qué dijo el análisis

18 unidades físicas, 12 reservadas y 6 disponibles; punto de reposición 20. El snapshot incluía 34 pedidos pendientes de SKU-451 por 124 unidades (25 LATAM y 99 España). Si todos se confirmaran y fueran adicionales a las reservas actuales, faltarían 118 unidades. No son demanda confirmada.

PROP-001, por 80 unidades, seguía pendiente. Alcanzar el objetivo de 80 físicas desde 18 implicaría 62; alcanzar 80 disponibles desde 6 implicaría 74, sin nuevas salidas. No se aprobó ninguna cantidad.

## Versiones y límites

- Worker desplegado por el dueño para esta prueba: 39b6d5f5-ceda-45bc-b03b-72dd9144220f.
- Client single-turn: commit 62f0a4911de1502e1398a77a3305bb3767e4479c.
- UI single-turn: commit 893651011902f8bdf9e5244fafdb63674b740626.
- La prueba funcionó tras corregir el body consumido al reenviar al Durable Object, el launcher npx de Windows y la selección de un solo job.
- Sin cron permanente. /run solo permite el job seleccionado por TEST_JOB_ID y requiere revisión. /check es lectura manual, no vuelve a enviar.
- Si hay sending/uncertain, no repetir, borrar sesión ni crear otra consulta hasta reconciliar Gmail Enviados.
- El helper local instala los secretos por stdin y comprueba el buzón Gmail. En Windows evita el launcher .cmd; no imprime ni guarda tokens.
- Las respuestas NO AUTENTICADAS no prueban identidad. No usar para decisiones reales ni acciones automáticas.

## Cierre operativo

Tras el test: guardar SEND_ENABLED="false" en wrangler.jsonc y desplegar. Comprobar que el resultado del deploy muestra false. Mantener crons=[]; RESPONSE_MODE="unverified-test" permite recoger manualmente la respuesta sin activar envíos.

Cierre confirmado en la conversación de prueba: el deploy final del dueño mostró SEND_ENABLED="false", RESPONSE_MODE="unverified-test", TEST_JOB_ID intacto y crons vacíos. Versión final: e3e161c1-750e-4050-b34e-cb97bdeb8f17. El archivo local tenía dos entradas SEND_ENABLED; se eliminó la duplicada. No se debe repetir una clave JSON: algunos parsers conservan el último valor.

## Comprobaciones locales

worker.test.mjs: 13 fixtures de validación, almacenamiento/admisión/aislamiento/borrado, body reenviado sin consumo previo, rechazo de job no elegido, envío único del elegido y ausencia de reenvío al repetir /run o /check. Todas pasaron; no son una prueba de red real.
