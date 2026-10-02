# Pruebas manuales del pack VE

Plan de verificacion manual para el contenido declarativo de `packs/VE`. Ninguna prueba
de este archivo sustituye revision juridica local ni auditoria de seguridad.

## Alcance de lo que se puede probar hoy

El nucleo (`index.html`, `data/schema.sql`, `data/seed/demo.json`) no importa `packs/`.
Por tanto las pruebas 1-3 son las unicas que este pack puede afectar, y 4-6 documentan el
estado del nucleo tal cual, para que un fork tenga la lista completa.

| # | Paso | Resultado |
|---|------|-----------|
| 1 | `node scripts/validate-packs.mjs` | PASS: CO y VE validan manifiesto, sobrecargas de datos y localizacion. |
| 2 | `node scripts/build-countries.mjs --check` | PASS: `packs/index.json` coincide con el sistema de archivos. |
| 3 | Anadir una fuente inventada a `packs/VE/manifest.json` (sin `checked_on`) y volver a ejecutar (1) | PASS: el validador falla y marca la ruta exacta; revertir el cambio. |
| 4 | Seleccionar Venezuela en el selector juridico y abrir Cumplimiento, Subagentes juridicos y Costes de mano de obra | PASS (2 oct 2026): la jurisdiccion muestra ISLR con estado "Por configurar", los siete subagentes en "Por configurar", el chequeo queda en `review` con motivo de fuentes pendientes y los importes se rotulan en VES. |
| 5 | Cambio CO/VE, ambos modos y cola de aprobaciones con el motor de agentes detenido | PASS (2 oct 2026): el cambio de pais deja evento `pais_cambiado` en auditoria y el interruptor de agentes no genera llamadas al modelo mientras esta detenido. |
| 6 | Revision de fuentes venezolanas (vigencia, articulos, reformas) | Pendiente: no hay ninguna fuente en `sources`; sin fecha de consulta el campo queda vacio y `status` sigue en `borrador`. |

## Reglas al actualizar este pack

- Cambiar solo `packs/VE/**`; no tocar el nucleo en el mismo PR.
- No inventar normas, articulos ni URLs: una fuente entra con organismo, URL, fecha de
  consulta real y `review_status`; si no hay fecha, no se anade.
- Mantener `kind: "reference"` para lo que ya declara el nucleo y `"example"` solo para
  datos ilustrativos claramente rotulados.
- Tras editar, ejecutar (1) y (2); si (2) falla, regenerar con
  `node scripts/build-countries.mjs`.
- Mantener `status: "borrador"` y `runtime_enabled: false` hasta que una persona del
  proveedor documente revision y un mantenedor lo apruebe.
