# Configurar Gmail OAuth para FiveTech en GitHub Pages

Guía de la fase 1, 30 septiembre 2026. Configura acceso a Gmail desde el navegador; no crea por sí sola el respondedor de Instinct ni la firma privada. Autorizar Gmail no envía correo.

## Antes de empezar

- Usa una cuenta Google propia con permiso para gestionar el proyecto Cloud.
- Buzón ERP elegido para la prueba: `fivetech2@gmail.com`. Puede ser distinto de la cuenta que administra Cloud; comprueba ambas identidades antes de continuar.
- Ten a mano el origen web: `https://fivetechsoft.github.io`.
- No pegues contraseñas, Client Secret, tokens ni claves HMAC en chat, repo o localStorage.

## 1. Crear y seleccionar proyecto

Entra en https://console.cloud.google.com/ . Abre el selector de proyecto de la barra superior y elige **Nuevo proyecto**. Nombre sugerido: `adaptapro-instinct`. Revisa la organización/ubicación si aparecen, pulsa **Crear** y selecciona el proyecto creado.

Si ya tienes un proyecto propio para esta integración puedes usarlo. Comprueba el proyecto seleccionado antes de habilitar APIs o crear credenciales. No contrates servicios de pago para completar esta guía.

## 2. Habilitar Gmail API

Menú **APIs y servicios > Biblioteca**. Busca **Gmail API**, abre su ficha y pulsa **Habilitar**. Si aparece **Administrar**, ya está habilitada en el proyecto seleccionado.

## 3. Configurar consentimiento y usuarios de prueba

Abre **Google Auth Platform** (puede aparecer como **Pantalla de consentimiento OAuth** en APIs y servicios). Completa:

- **Branding**: nombre de aplicación, por ejemplo `AdaptaPro Instinct`, correo de soporte y contacto del desarrollador.
- **Audience**: para una cuenta Gmail personal, selecciona **External**. Mantén la aplicación en **Testing** para la prueba.
- **Test users**: añade `fivetech2@gmail.com` y guarda.

Usa datos de contacto propios. Si tu organización impone restricciones, no cambies políticas para saltarlas: consulta al administrador. Los nombres de menús pueden variar según idioma y estado del proyecto.

## 4. Declarar los dos scopes

En **Data Access** / **Acceso a datos**, añade:

| Scope | Uso |
| --- | --- |
| `https://www.googleapis.com/auth/gmail.send` | Enviar consultas revisadas desde el buzón ERP. |
| `https://www.googleapis.com/auth/gmail.readonly` | Leer y correlacionar las respuestas. |

No añadas `https://mail.google.com/`, `gmail.modify` ni `gmail.compose`: el puente no necesita borrar correo ni modificar mensajes.

Aviso de alcance: `gmail.readonly` permite leer el buzón, no solo el hilo de FiveTech. La aplicación limita sus búsquedas, pero el permiso concedido sigue siendo amplio. Un buzón dedicado reduce exposición. `gmail.send` es sensible y `gmail.readonly` restringido; publicar para más usuarios puede requerir verificación de Google y, según tratamiento de datos, evaluación adicional. No presentes la prueba en Testing como una aplicación ya verificada.

## 5. Crear cliente OAuth web

En **Clients > Create client**, elige **Web application**. Nombre sugerido: `AdaptaPro Pages`.

En **Authorized JavaScript origins**, añade exactamente:

```
https://fivetechsoft.github.io
```

Es un origen, no una página. No añadas `/Core/`, ruta, query ni barra final. Para pruebas locales se pueden añadir aparte `http://localhost` y `http://localhost:PUERTO` que realmente se vaya a usar.

Esta implementación usa Google Identity Services con token y popup. No inventes una redirect URI ni pongas un Client Secret en el navegador. Un Client Secret solo pertenece a flujos del lado servidor.

## 6. Copiar Client ID

Copia el **Client ID**, cuyo nombre termina en `.apps.googleusercontent.com`. Es configuración pública; no es la clave de acceso a Gmail.

No copies ni compartas **Client Secret**, una contraseña, token o JSON de credenciales completo. El ID del proyecto no sustituye al Client ID OAuth.

## 7. Autorizar desde FiveTech

Abre https://fivetechsoft.github.io/Core/ y pulsa **Instinct · Gmail**.

1. Pega el Client ID en su campo.
2. Confirma **Buzón ERP**: `fivetech2@gmail.com`.
3. Introduce el destino de Instinct solo cuando esté confirmado para esta prueba. No adivines una dirección.
4. Pulsa **Autorizar Gmail**; elige `fivetech2@gmail.com` en la ventana de Google.
5. Lee la pantalla de permisos y concede ambos scopes solo si los aceptas. La aplicación verifica el perfil de Gmail y rechaza otra cuenta.

La autorización no envía consultas. El acceso queda en memoria, caduca y se renueva desde el botón. Cerrar/recargar pestaña pierde token y pendientes volátiles. **Desconectar esta sesión** elimina el token local, pero no revoca el consentimiento de Google; para retirarlo, usa los controles de acceso de aplicaciones de tu cuenta Google.

## Antes del primer envío real

Todavía se requieren firma HMAC privada de sesión y respondedor capaz de validar solicitud y devolver JSON firmado. No publiques ni pegues la clave HMAC en el panel. La provisión segura se realiza por separado. El Client ID solo desbloquea OAuth, no estas piezas.

Con ambos extremos listos: activa el puente del chat, elige agente, prepara consulta y revisa cuenta, destino y cuerpo completo. Pulsa **Enviar consulta revisada** solo después de esa revisión. La aceptación Gmail no prueba entrega ni respuesta. Ante timeout o resultado incierto, inspecciona Enviados antes de reintentar; no reenvíes a ciegas.

**Comprobar respuestas una vez** hace una lectura bajo demanda. El chequeo cada 60 segundos es opcional y muestra su aviso; no lo actives antes de decidir la frecuencia. Resumen local del log no equivale a verificación de Instinct. La primera prueba real debe comprobar correo, respuesta firmada y texto en chat, con tiempos reales; las pruebas locales del repo no sustituyen ese recorrido.

## Si algo falla

- **Cliente/origen no válido**: verifica tipo Web application, Client ID correcto y origen exacto, sin ruta. No cambies secretos ni uses una credencial distinta sin revisar.
- **Acceso bloqueado para el usuario de prueba**: comprueba proyecto, audiencia Testing y que el buzón está añadido como test user. Una restricción de organización requiere administrador, no evasión.
- **Popup cerrado o bloqueado**: inicia autorización pulsando el botón y permite el popup para el sitio.
- **Faltan permisos**: revisa que se concedieron ambos scopes. No amplíes al acceso completo a Gmail para evitar el error.
- **Otra cuenta seleccionada**: el perfil debe coincidir con el buzón configurado. Desconecta la sesión y elige la cuenta correcta.
- **Token caducado**: renueva desde Autorizar Gmail. No pegues ni guardes tokens para alargarlo.
- **Sin firma/respondedor**: no es un error OAuth. Mantén el envío bloqueado hasta resolver la configuración del otro extremo.

## Fuentes

Consultadas el 30 septiembre 2026:

- https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/gmail/api/auth/scopes

Plan y estado de implementación: [ROADMAP](../ROADMAP.md).
