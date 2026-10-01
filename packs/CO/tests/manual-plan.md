# Pruebas manuales del pack CO

Plan de verificacion manual para el contenido declarativo de `packs/CO`. Ninguna prueba
de este archivo sustituye revision juridica local ni auditoria de seguridad.

## Alcance de lo que se puede probar hoy

El nucleo (`index.html`, `data/schema.sql`, `data/seed/demo.json`) no importa `packs/`.
Por tanto las pruebas 1-3 son las unicas que este pack puede afectar, y 4-6 documentan el
estado del nucleo tal cual, para que un fork tenga la lista completa.

| # | Paso | Resultado |
|---|------|-----------|
| 1 | `node scripts/validate-packs.mjs` | PASS: CO y VE validan manifiesto, sobrecargas de datos y localizacion. |
| 2 | `node scripts/build-countries.mjs --check` | PASS: `packs/index.json` coincide con el sistema de archivos. |
| 3 | Editar `packs/CO/data/payroll-rules.json` y dejar un campo obligatorio vacio; volver a ejecutar (1) | PASS: el validador falla y marca la ruta exacta; revertir el cambio. |
| 4 | Carga limpia del navegador, recarga de IndexedDB y `Restablecer demo` | Pendiente: no ejecutado en este PR; sin navegador automatizado en CI. |
| 5 | Cambio CO/VE, vistas de cumplimiento y nomina, ambos modos, cola de aprobaciones y auditoria | Pendiente: no ejecutado en este PR; afecta al nucleo, no al pack. |
| 6 | Revision de las tres fuentes enlazadas (vigencia, articulos, reformas) | Pendiente: `review_status` sigue en `pendiente`; `effective_on` queda en null hasta verificarlo. |

## Reglas al actualizar este pack

- Cambiar solo `packs/CO/**`; no tocar el nucleo en el mismo PR.
- Copiar datos de forma literal desde el nucleo o desde una fuente oficial citada en
  `sources`, con `checked_on` real; si no hay fecha, usar `null`.
- Tras editar, ejecutar (1) y (2); si (2) falla, regenerar con
  `node scripts/build-countries.mjs`.
- Mantener `status: "borrador"` y `runtime_enabled: false` hasta que una persona del
  proveedor documente revision y un mantenedor lo apruebe.
