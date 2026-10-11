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

- `backoffice.html#crm`: sección CRM del backoffice; prospectos, contacto, tareas, atribución y ayuda del KAM. Entra con una cuenta demo KAM, Líder KAM o Admin. KAM y líder abren directamente el CRM.
- `crm-demo.html`: entrada compatible que redirige a esa misma sección; no es una aplicación aparte
- `asistido-demo.html?mode=self&kind=patient`: registro unificado del paciente
- `asistido-demo.html?mode=self&kind=doctor`: registro unificado profesional
- `backoffice.html`: revisión, ofertas, documentos, cartera e importación de altas CRM
- `crm.html`: módulo de correo separado, sin conexión real mientras no se configure

La sección CRM hereda los estilos del Backoffice y se monta sin iframe. Consulta la [revisión integral de experiencia y sus límites de validación](REVISION-CRM-EXPERIENCIA-20261009.md). La vista Contactos permite alternar Lista/Kanban; el Dashboard incluye gráficos basados en eventos reales de la demo.

La [revisión de escala, dashboard y roles](REVISION-CRM-ESCALA-DASHBOARD-ROLES-20261011.md) incorpora listados por lotes y páginas, vista Gráfico/Tabla excluyente y períodos en Ciudad de México. Las cuentas ficticias `ana.kam@pulzzo.mx` y `luis.kam@pulzzo.mx` ven su cartera; `lider.kam@pulzzo.mx` consulta todas sin modificar. Admin conserva sus capacidades. Se seleccionan desde la pantalla de entrada y utilizan la contraseña pública de la demo, `pulzzo-demo`. No son cuentas reales ni autenticación de producción; no introducir datos personales reales.

Consulta también la [revisión operativa del CRM](REVISION-CRM-OPERACION-20261009.md): bandeja de atención, referencias verificadas, historial administrativo y archivo seguro.

Revisa [reglas y límites del CRM](REGLAS-CRM-REGISTRO-ASISTIDO-DEMO.md), [integración de portales](REGLAS-INTEGRACION-PORTALES-DEMO.md), [cartera y configuración](REGLAS-CARTERA-CONFIGURACION.md) y [correo](CONEXION-GMAIL-CRM.md).

El build prepara archivos locales; no publica, no configura credenciales y no activa servicios. Las pruebas visuales opcionales requieren un entorno capaz de iniciar Chromium y están separadas de las pruebas funcionales.
