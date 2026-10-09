# PULZZO · Correo CRM preparado para activación

> Plantilla pública. Los identificadores, correos y dominios de ejemplo no son una configuración real. Sustitúyelos únicamente en la configuración privada y verificada del despliegue.

## Estado de esta entrega

Implementación local independiente de la revisión aprobada `fb1719d2cfe76ef723912fa4e2b409727c727506`. No se cambió la versión publicada, el repositorio remoto ni su respaldo. No se creó ninguna credencial real, no se concedieron permisos a Google y no se envió ningún correo.

La aplicación permanece cerrada para correo real hasta que exista una configuración válida del servidor y una sesión del propietario verificada por Sites. Los usuarios y roles de la demo en `localStorage` no autorizan operaciones de Gmail.

### Incluido

- Página `crm.html`, enlazada desde el backoffice y visualmente separada de los expedientes demo.
- Contactos compartidos en D1, con nombre, correo y tipo paciente/doctor/otro. Sin importar expedientes ni inventar etapas comerciales.
- Cuenta inicial prevista: `crm-mailbox@example.com`.
- Guardar borrador, revisar destinatario/contenido y enviar únicamente por acción explícita.
- Historial de borradores/envíos y vinculación automática de conversaciones enviadas.
- Vincular explícitamente un hilo existente mediante su ID de Gmail API y comprobar que contiene al contacto.
- Leer o actualizar cuerpos de las conversaciones vinculadas. Texto plano únicamente; HTML, imágenes remotas y archivos adjuntos no se ejecutan ni se muestran. Una parte `text/plain` almacenada por Gmail como attachment se recupera por su API.
- OAuth de servidor con state de un solo uso, nonce de navegador, PKCE S256 y refresh token cifrado con AES-GCM.
- Verificación del buzón con `users/me/profile`, tanto al conectar como antes de cada operación real.
- CSRF ligado al propietario, cookies Secure/HttpOnly, origen estricto, autorización del propietario en todos los endpoints y consulta SQL parametrizada.
- Bandeja de salida durable, exclusión atómica entre envíos concurrentes y conciliación de resultados inciertos. Un timeout nunca desencadena un reenvío automático.
- Auditoría de acciones sin tokens, credenciales o cuerpos de mensajes en los registros de auditoría.

### Alcance que sigue pendiente

No es un CRM comercial completo ni una sustitución de los portales demo. Quedan pendientes la definición de etapas de pacientes/doctores, las respuestas dentro de hilos existentes, adjuntos, búsqueda/importación de bandeja completa y automatizaciones. Esta versión envía mensajes nuevos y permite leer hilos vinculados; no pretende responder dentro del hilo con cabeceras incompletas.

Los listados iniciales muestran hasta 200 contactos, los últimos 100 borradores/envíos y 100 vínculos de conversación. Cada lectura muestra hasta 30 mensajes y 50,000 caracteres de texto por mensaje, con aviso de recorte. Se rechazan respuestas de Google de más de 2 MiB para proteger la memoria del Worker.

## Activación: pasos y autorizaciones pendientes

1. Aprobar el despliegue de esta revisión en el mismo Site privado. Si Sites necesita una credencial nueva para escribir el repositorio de código, esa creación requiere aprobación específica antes de realizarla. No sobrescribir `main` ni el respaldo existente.
2. Mantener el acceso del Site limitado al propietario. Verificar la identidad estable `oai-authenticated-user-id` del propietario en el servidor y configurarla como `MAIL_OWNER_ID`. No tomarla de un campo del navegador, de un correo ingresado ni del rol de la demo. Con Gmail aún deshabilitado, se puede activar temporalmente `MAIL_SETUP_IDENTITY_ENABLED=true` y abrir `/api/crm/setup-identity` en la sesión del propietario del Site. Devuelve únicamente el ID de esa sesión, no registra al propietario ni concede acceso. Confirmar la sesión correcta, configurar ese ID como `MAIL_OWNER_ID` y deshabilitar el endpoint de preparación.
3. Verificar el montaje real de Worker + assets + D1 por Sites, la aplicación de migraciones y que no exista un acceso directo al Worker que evite el ingreso autenticado de Sites. Este Worker confía exclusivamente en los encabezados de identidad inyectados por ese ingreso.
4. Antes de registrar un callback como definitivo, verificar que Sites conserva la sesión del propietario y permite el retorno externo de Google hacia la ruta prevista. El Site publicado actualmente es estático; este punto aún no está comprobado.
5. En Google Cloud, crear o elegir el proyecto aprobado, habilitar Gmail API, configurar Google Auth Platform con audiencia **External**, completar nombre/contacto de soporte y agregar `crm-mailbox@example.com` como usuario de prueba. Un Gmail personal no puede usar la audiencia Internal de Workspace.
6. Crear un cliente OAuth de tipo **Web application**, con aprobación para crear esta credencial y conceder acceso persistente. Registrar el URI exacto comprobado. El candidato actual es:

   `https://your-private-site.example/api/crm/oauth/callback`

   No usar `/callback`: esa ruta está reservada por Sites. La integración no necesita un token en JavaScript ni orígenes JavaScript autorizados porque el intercambio del código es de servidor.
7. Configurar los valores de `.env.example` mediante el mecanismo de secretos/variables de Sites. `GOOGLE_CLIENT_SECRET` y `MAIL_ENCRYPTION_KEY` deben ser secretos del servidor. La clave de cifrado debe ser independiente del secreto de Google, de 32 bytes y codificada base64url. No compartir valores en chat, archivos fuente, capturas ni archivos del navegador. Crear o cargar credenciales para acceso persistente requiere la aprobación correspondiente.
8. Tras la configuración y las verificaciones de ingreso, activar `MAIL_ENABLED=true`. El propietario abre Correo CRM y usa **Conectar Gmail**, revisando los permisos en Google:
   - `https://www.googleapis.com/auth/gmail.send`: enviar correo.
   - `https://www.googleapis.com/auth/gmail.readonly`: leer el buzón completo. La aplicación limita las lecturas a hilos vinculados, pero Google no limita este permiso a esos hilos.
9. Confirmar que la cuenta conectada es exactamente `crm-mailbox@example.com`. Un `login_hint` no garantiza esa identidad; el servidor la valida.
10. Antes de cualquier prueba real de envío, obtener autorización del destinatario exacto y del contenido. Crear un único borrador, revisar y enviar una vez; verificar el resultado en Gmail y en la bandeja CRM. No está autorizado ningún mensaje de prueba por esta entrega.

No hace falta la contraseña de Gmail. El consentimiento se realiza en Google. Mantener abierta una sesión del usuario no implica que esta implementación o el asistente puedan acceder a ella.

## Configuración y arquitectura

- `server/index.mjs`: rutas de API y Worker ESM con `fetch(request, env)`.
- `server/security.mjs`: autorización, CSRF, validación y cifrado.
- `server/google.mjs`: HTTP de Google sin reintentos de envío, MIME y lectura de texto.
- `server/store.mjs`: acceso D1 parametrizado.
- `db/schema.ts` y `drizzle/`: esquema y migraciones generadas con Drizzle, revisadas y ejecutadas sobre SQLite en pruebas.
- `.openai/hosting.json`: conserva el Site `YOUR_SITE_PROJECT_ID`, declara D1 lógico `DB` y no contiene secretos.
- `scripts/build-mail.mjs`: genera Worker ESM y un directorio público allowlist de HTML + assets. No copia servidor, pruebas, base de datos, configuración ni archivos de entorno a la zona pública.
- `scripts/validate-mail-build.mjs`: comprueba contrato del Worker, fallo seguro sin configuración, migraciones y ausencia de fuente/secretos en los archivos públicos.

El vínculo de buzón mantiene un ID estable para la misma cuenta. Los borradores y conversaciones guardan el ID y remitente histórico. Cambiar `MAIL_EXPECTED_ACCOUNT` no redirige borradores antiguos a la cuenta nueva; esos envíos se bloquean. Los tokens solo existen cifrados en D1 y transitoriamente en memoria del servidor para llamar a Google. Los cuerpos de borradores sí se guardan en D1 para mantener el contenido revisado; los cuerpos leídos de Gmail no se conservan por esta versión. La auditoría registra identificadores y acciones, no contenido.

La base D1 debe respaldarse bajo la política aprobada del proyecto. Perder o reemplazar la clave de cifrado hace ilegibles los refresh tokens y requiere reconectar las cuentas. El sistema no incluye rotación automática de claves ni restauración de backups.

### Envíos inciertos

Antes de enviar se guarda un RFC Message-ID estable y se cambia el estado `draft → sending` mediante compare-and-set en D1. Solo el proceso que obtuvo ese cambio llama a Gmail. Si hay fallo de red, respuesta ilegible o error al registrar el éxito, el estado es `uncertain`; si tampoco se puede guardar ese estado, queda `sending`. Ambos estados impiden reenvío.

**Comprobar en Gmail** busca `in:sent rfc822msgid:...` y exige etiqueta SENT y cabeceras Message-ID/From/To compatibles. La ausencia de resultados no demuestra que el correo no se envió: se mantiene bloqueado. Gmail no ofrece una clave de idempotencia en `messages.send`; Message-ID ayuda a conciliar, no garantiza entrega exactamente una vez.

## Pruebas verificadas

Ejecutadas en esta revisión:

- `node tests/run.cjs`: 44 suites existentes aprobadas, incluyendo 136 comprobaciones del motor financiero.
- `node --test tests/crm-mail.test.mjs`: 29 pruebas nuevas aprobadas con SQLite real en memoria y HTTP de Google simulado. Cubren identidad, CSRF, PKCE/state, replay, cuenta incorrecta, cifrado/AAD, inyección, tamaños, envío concurrente, doble envío, timeout, aceptación por Gmail seguida de fallo de D1, conciliación, cambio de cuenta y revocación.
- `node scripts/build-mail.mjs` y `node scripts/validate-mail-build.mjs`: compilación y contrato de Worker aprobados; 43 archivos públicos allowlist.
- Revisión independiente de seguridad del nuevo flujo: sin defectos de alto impacto confirmados; mantiene como requisitos de liberación el ingreso autenticado de Sites y los assets públicos limitados.

**No verificado:** OAuth real, compatibilidad del callback privado, D1 remoto, despliegue real, permisos reales de Google, lectura/envío reales y renderizado visual/móvil. La prueba opcional `tests/crm-mail-browser.cjs` se preparó con datos simulados pero Chromium no pudo iniciar por una restricción de sockets de este entorno; no se cuenta como aprobada. No se cambió esa restricción.

La auditoría de seguridad se concentra en la nueva capa de correo. Antes de manejar datos reales a escala, revisar también la seguridad integral de todos los scripts del mismo origen y los requisitos de privacidad/retención del negocio.

## Tres identidades diferentes

- Propietario del Site / sesión de ChatGPT: `site-owner@example.com`. La autorización del servidor usa su ID estable específico de este Site, no compara esta dirección con Gmail.
- Propietario o administrador del proyecto de Google Cloud: quien administra el proyecto y el cliente OAuth. Puede hacer la preparación en otra sesión de Google; no se convierte por ello en el propietario del Site.
- Buzón conectado para correo CRM: `crm-mailbox@example.com`. Se valida mediante Gmail API y es el remitente inicial.

Configurar Google Cloud en una ventana privada es independiente de conectar el CRM. Para el consentimiento OAuth, abrir el Site con la sesión de ChatGPT de su propietaria y, desde ese mismo navegador, pulsar Conectar Gmail y elegir `crm-mailbox@example.com` en Google. Mantener la sesión del Site y su cookie nonce durante el retorno; no iniciar la conexión del Site como una cuenta de ChatGPT distinta solo porque se eligió otra cuenta Gmail. `login_hint` ayuda a elegir, pero la verificación del buzón se hace en el servidor.

## Google y el dominio posterior

En **External + Testing**, los permisos Gmail y refresh tokens caducan después de siete días; la UI requiere reconectar. Pasar a **In Production** elimina esa caducidad propia de Testing, pero no elimina revocaciones, expiraciones o invalidación por cambios de contraseña. `gmail.send` es Sensitive y `gmail.readonly` es Restricted. La distribución comercial puede requerir verificación y evaluación de seguridad; existen excepciones limitadas para uso personal, pero no deben asumirse como autorización de uso comercial.

Cuando exista un dominio propio: verificarlo, registrar el nuevo URI exacto, actualizar `MAIL_ORIGIN`, desplegar y repetir pruebas del callback y la sesión. No es solo cambiar una etiqueta. Un cambio de dominio sin registrar el nuevo callback produce error de coincidencia de URI. El cambio de dominio por sí solo no debe cambiar el buzón ni reenviar borradores.

## Referencias oficiales consultadas

- Alcances Gmail: https://developers.google.com/workspace/gmail/api/auth/scopes
- OAuth web server: https://developers.google.com/identity/protocols/oauth2/web-server
- PKCE web en biblioteca Google: https://github.com/googleapis/google-auth-library-nodejs/blob/main/samples/oauth2-codeVerifier.js
- Expiración de tokens: https://developers.google.com/identity/protocols/oauth2#expiration
- Audiencia/publicación: https://support.google.com/cloud/answer/15549945?hl=en
- Excepciones de verificación: https://support.google.com/cloud/answer/13464323?hl=en
- Identidad del buzón: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile
- Envío: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- Búsqueda de mensajes: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- Requisitos de respuestas en hilos: https://developers.google.com/workspace/gmail/api/guides/threads
- Estructura MIME: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages
