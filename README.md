# AdaptaPro

**AdaptaPro: ERP Agéntico y Autónomo, con supervisión humana.**

## El concepto

Un ERP dirigido por agentes de IA que operan de forma autónoma sobre las operaciones de la empresa: optimizan inventario, ajustan pronósticos de ventas y reaccionan ante riesgos logísticos. Los agentes actúan solos, pero bajo supervisión humana: el usuario sigue sus decisiones en el panel y valida sus propuestas (¿Implementar?) antes de que se ejecuten.

Este repositorio contiene el prototipo de la interfaz: un panel de "Operaciones Inteligentes 2030" que muestra cómo se vería esa relación entre agentes autónomos y supervisión humana.

## Qué incluye la demo

- Panel de métricas (ingresos, margen, inventario, satisfacción del cliente)
- Tres agentes de IA en operación: ALPHA (inventario), BETA (ventas) y GAMMA (logística)
- Alertas y acciones de agentes en tiempo real
- Gráficos de pronóstico de demanda y costo de operaciones (Chart.js)
- Chat arrastrable con el asistente, donde el humano pregunta y decide

Todo el contenido es simulado: no hay backend ni datos reales. Es un prototipo de interfaz, no un producto funcional.

## Contenido del repositorio

- `index.html` — la demo completa en un solo archivo (HTML + CSS + JS; Chart.js se carga desde CDN)

## Cómo verla

Abre `index.html` en cualquier navegador, o publica el repositorio con GitHub Pages para verla en línea.

## Estado

Prototipo en desarrollo inicial.
