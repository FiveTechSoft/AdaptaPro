# Contribuir como proveedor

Core recibe propuestas de proveedores de distintos países. Un fork permite probar sin tocar `main`; el PR permite devolver mejoras revisables al proyecto común. Esta guía no concede acceso automático al núcleo ni promete aceptar cualquier cambio.

1. Haz un fork de `FiveTechSoft/Core` y crea una rama por cambio. Sincroniza el fork con `main` antes del PR.
2. Describe el problema local, país, cliente o escenario sin incluir datos personales, qué parte es común y qué parte es normativa o configuración local. Pide a tu agente que lea `AGENTS.md` y trabaje solo en la rama.
3. Para un nuevo país, usa `packs/README.md` y el manifiesto CO como referencia estructural. No copies reglas de Colombia como si valieran en otro territorio. En esta fase el manifiesto **no activa funcionalidad**; una integración funcional requiere otro diseño y revisión.
4. Ejecuta `node scripts/validate-packs.mjs`, revisa el diff, quita secretos y documenta pruebas manuales. Si cambias comportamiento, adjunta resultados para primera carga, persistencia, selector, ambos modos, aprobaciones, auditoría y reset. Confirma las fuentes y la fecha de revisión con alguien competente en ese país.
5. Abre un PR hacia `FiveTechSoft/Core:main`. Indica alcance, archivos, riesgos, fuentes y vigencia, responsable local, resultados de pruebas y plan de reversión. CI debe pasar y el mantenedor acepta o solicita cambios. Conserva las personalizaciones privadas en tu fork si no son generalizables.

**Revisión exigida:** un responsable humano del proveedor valida el cambio; un mantenedor del núcleo decide la integración. Para contenido normativo se requiere revisión profesional local antes de ofrecerlo como capacidad real. Prohibidos secretos, datos de clientes y afirmaciones de cumplimiento sin prueba. La licencia y condiciones de redistribución se deben acordar explícitamente; este repositorio no declara aquí un régimen contractual de partners.
