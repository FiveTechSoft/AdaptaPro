# Guía para agentes que contribuyen a Core, el núcleo de un ERP Agéntico

Lee este archivo y `CONTRIBUTING.md` antes de modificar el repositorio. Objetivo: permitir adaptaciones por país sin convertir cada fork en un producto incompatible. Las normas de este documento son convenciones de contribución, no una garantía de conformidad legal.

## Estado real del producto

La demo se sirve desde `index.html` en GitHub Pages. SQLite (sql.js) vive en el navegador y se persiste en IndexedDB; `data/schema.sql` y `data/seed/demo.json` crean datos ficticios. No hay backend multiusuario ni permisos, despliegue de packs ni pagos reales. El selector jurídico existente ofrece CO y VE; la nómina Colombia y la jerarquía de normas son una demostración que requiere revisión profesional. Los nuevos archivos de `packs/` son **contratos y ejemplos de diseño**: el núcleo solo lee `packs/index.json` para registrarlos y calcular la puerta de habilitación (`APPacks.gate()`), nunca carga sus datos ni migraciones. No vendas una adaptación como operativa por el mero hecho de añadir un JSON.

## Superficie SQL del núcleo

`AP.query` solo admite `SELECT`/`WITH` de una sentencia parametrizada; `AP.exec` solo admite `INSERT`/`UPDATE`/`DELETE`, corre en `tx()` y exige `actor` y `action` para auditar (`audit:false` solo en escrituras intermedias). `AP.db.run` queda para el kernel: semilla, migraciones y `PRAGMA`.

## Límites que no se negocian

- No cambiar `index.html`, `data/schema.sql` o `data/seed/demo.json` para añadir un pack sin una propuesta separada que explique migración, compatibilidad, pruebas y aprobación humana. Los cambios en el núcleo van en un PR distinto, con responsable del núcleo.
- No alterar el sentido de los modos: **Supervisado** deja propuestas locales pendientes; **Autónomo** puede aprobar propuestas locales nuevas con auditoría, pero no emite compras ni recibe mercancía. Ningún pack puede saltarse cola, auditoría o confirmaciones.
- No insertar claves, datos personales reales, promesas de cumplimiento, fuentes sin fecha ni reglas legales activas por defecto. No eludir restricciones de servicios externos.
- No editar el trabajo de otro país en un PR de pack, salvo cambios coordinados y documentados. No mezclar cambios comerciales y normativos en una misma revisión.

## Crear un pack

1. Abrir una rama en el fork (`pack/ISO-3166-1-alpha2-tema`). Copiar el esquema de `packs/README.md` y crear `packs/XX/manifest.json` con código ISO 3166-1 alfa-2, propietario, estado y alcance. No inventar textos jurídicos ni tarifas para rellenar campos.
2. Añadir referencias oficiales en `sources` (organismo, URL, fecha de consulta, vigencia por verificar). Separar hechos verificables, interpretaciones y decisiones de negocio. Cuando falte validación, mantener `status: "borrador"` y `runtime_enabled: false`.
3. Especificar datos de ejemplo sin personas reales, moneda y casos límite; añadir un plan de pruebas manuales y resultados. Una norma cambiante requiere responsable local y fecha de revisión.
4. Abrir PR contra `main` usando la plantilla de `CONTRIBUTING.md`; explicar qué se comparte con el núcleo y qué queda localizado. Un agente prepara el cambio: una persona del proveedor y un mantenedor revisan y deciden.

## Comprobaciones mínimas

Ejecutar `node scripts/validate-packs.mjs`. Verificar que cada JSON parsea, que los códigos y estados son válidos, que no hay claves extrañas y que ningún borrador se marca como habilitado. La acción de CI ejecuta el mismo validador en PR y push. Antes de integrar cambios ejecutables, además probar en navegador: primera carga limpia, recarga de IndexedDB, cambio CO/VE, vistas de cumplimiento y nómina, ambos modos, cola de aprobaciones, auditoría y restablecimiento. Documentar capturas/resultados; estas pruebas manuales **no están automatizadas por CI**. Ningún resultado sustituye la revisión jurídica local ni una auditoría de seguridad.

## Integración con el modelo Zen

- El gate FreeTier de Zen exige `stream:true` y un `tools` que contenga `bash` **y** `read`; el proxy `zenproxy/index.php` inyecta `User-Agent: opencode/1.18.34` y una sesión `ses_…` porque el navegador no puede fijar el `User-Agent`.
- En el PHP del host fija `serialize_precision=-1` antes de `json_encode` (con el valor por defecto 17, `0.7` sale como `0.6999…`) y decodifica el JSON sin flag asociativo (con él, `{}` sale como `[]`).

Consulta `docs/modelo-proveedores.md` para el argumento comercial sin promesas de producción.
