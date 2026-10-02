# Packs por país - contrato propuesto, no conexión activa

Esta carpeta prepara la colaboración federada. En la versión actual `index.html` no importa estos archivos. La demo CO/VE y las reglas de Colombia existentes permanecen en el núcleo; `CO/manifest.json` es un **índice de referencia**, no una segunda fuente de reglas que ejecute la aplicación.

Un pack empieza con `XX/manifest.json`, donde XX es ISO 3166-1 alfa-2. Campos obligatorios: `schema_version` (1), `country`, `name`, `status` (`borrador`, `en_revision`, `validado`), `runtime_enabled` (false en esta fase), `maintainer` (nombre u organización, nunca un secreto), `scope` (lista de funciones), `sources` (lista de objetos con `title`, `url`, `checked_on`, `effective_on`, `review_status`), `notes`. Las fechas usan AAAA-MM-DD cuando se conocen; campos `effective_on` desconocidos quedan como `null`. `review_status` admite `pendiente` o `revisada`. `validado` documenta una revisión humana, no certifica cumplimiento normativo. No hay un loader de packs, aislamiento por tenant ni cálculo normativo certificado.

## Estructura de un pack

```
packs/
  README.md
  index.json            generado por scripts/build-countries.mjs; no editar a mano
  schemas/              contratos JSON Schema de manifiesto, datos y localización
  CO/
    manifest.json       obligatorio
    data/               ejemplos de datos con envoltorio {schema_version,country,kind,note,payload}
    locale/             formato y jurisdicción con envoltorio {schema_version,country,locale,currency,formats,jurisdiction,notes}
    tests/              plan de pruebas manuales y resultados
  VE/
    manifest.json       obligatorio
    data/               estado real de VE en el nucleo (jurisdiccion, chequeo, subagentes)
    locale/             es-VE, moneda VES y jurisdiccion ISLR
    tests/              plan de pruebas manuales y resultados
```

`kind` distingue `reference` (copia literal de algo que ya existe en el núcleo) de `example` (dato ilustrativo). Los archivos de `data/` y `locale/` deben declarar el `country` de su directorio. Si una fecha de consulta no se conoce, se usa `null`: no se rellena por inferencia. `index.json` registra los archivos de cada país para que un fork o una futura herramienta pueda localizarlos sin leer el árbol completo.

## Comprobaciones

```
node scripts/build-countries.mjs          # regenera packs/index.json
node scripts/build-countries.mjs --check  # falla si index.json está desactualizado
node scripts/validate-packs.mjs           # manifiestos, sobrecargas, registro y esquemas
```

La acción de CI en `.github/workflows/packs.yml` ejecuta `validate-packs.mjs`. Si cambias archivos de un pack, regenera el registro antes de abrir el PR.

## Integración futura

Para integrarlo en el futuro: API versionada de reglas, validación JSON Schema y firmas/procedencia, registro por jurisdicción y vigencia, pruebas de contrato, migración de datos por cliente, desactivación segura, auditoría y revisión jurídica. Esa evolución requiere diseño y PR aparte; no actives packs por copiar ficheros. El ejemplo colombiano solo apunta a la demo actual, cuya vigencia normativa debe comprobarse antes de usarla fuera de una presentación.
