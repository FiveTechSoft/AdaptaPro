# Datos locales de AdaptaPro

La aplicación carga `schema.sql` y `seed/demo.json` en una base SQLite (sql.js) y guarda sus bytes en IndexedDB al confirmar operaciones. Cada navegador o perfil mantiene su propia copia; no existe sincronización multiusuario ni backend de compras. La semilla es ficticia y usa céntimos de USD. El panel muestra USD de forma consistente; no convierte importes históricos de otra moneda mediante tipo de cambio.

La vista `stock_status` calcula disponible como físico menos reservado. ALPHA puede crear una propuesta de reposición cuando se cruza el umbral; GAMMA selecciona entre proveedores activos por menor plazo y, en empate, menor coste. Supervisado deja la propuesta pendiente. Autónomo aprueba propuestas locales nuevas con auditoría, pero no emite una compra ni recibe mercancía. Registrar recepción es una operación manual separada que cambia existencias una sola vez.

BETA añade pedidos a la base local cada 30 segundos si la página sigue visible. El feed y las vistas del menú leen la misma base. Los avisos muestran hechos de la base local, no información de terceros. El botón Restablecer borra la copia de ese navegador y vuelve a cargar la semilla. No utilices esta instalación estática como ERP de producción ni almacenes datos sensibles: no ofrece permisos de servidor, conciliación ni auditoría centralizada.
