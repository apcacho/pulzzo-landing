# PULZZO · plataforma y CRM DEMO

Prototipo local de pacientes, doctores/clínicas, backoffice, cartera y CRM con registro asistido. Usa exclusivamente datos ficticios. No autentica personas ni genera autorizaciones, contratos, llamadas o correos reales.

## Revisar en local

Requiere Node.js 22 o superior.

1. `npm ci`
2. `npm test`
3. `npm run build`
4. `node scripts/validate-mail-build.mjs`
5. `node preview.cjs`

Abre `http://127.0.0.1:8080/backoffice.html#crm`. El servidor escucha solo en tu equipo. Detén con Ctrl+C. Mantén CRM, titular y backoffice en el mismo origen/navegador para compartir la demo.

- `backoffice.html#crm`: sección CRM del backoffice; prospectos, contacto, tareas, atribución y ayuda del KAM. Entra con Admin demo y elige CRM en el menú lateral.
- `crm-demo.html`: entrada compatible que redirige a esa misma sección; no es una aplicación aparte
- `asistido-demo.html?mode=self&kind=patient`: registro unificado del paciente
- `asistido-demo.html?mode=self&kind=doctor`: registro unificado profesional
- `backoffice.html`: revisión, ofertas, documentos, cartera e importación de altas CRM
- `crm.html`: módulo de correo separado, sin conexión real mientras no se configure

La sección CRM hereda los estilos del Backoffice y se monta sin iframe. Consulta la [revisión de diseño y sus límites de validación](REVISION-CRM-DISENO-BACKOFFICE-20261009.md).

Revisa [reglas y límites del CRM](REGLAS-CRM-REGISTRO-ASISTIDO-DEMO.md), [integración de portales](REGLAS-INTEGRACION-PORTALES-DEMO.md), [cartera y configuración](REGLAS-CARTERA-CONFIGURACION.md) y [correo](CONEXION-GMAIL-CRM.md).

El build prepara archivos locales; no publica, no configura credenciales y no activa servicios. Las pruebas visuales opcionales requieren un entorno capaz de iniciar Chromium y están separadas de las pruebas funcionales.
