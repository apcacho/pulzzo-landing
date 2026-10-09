# CRM y registro asistido PULZZO · DEMO local

## Alcance y entrada

Abre `backoffice.html#crm` y entra con Admin demo. CRM es una sección del menú lateral del backoffice y conserva su cabecera, sesión demo y navegación. La antigua entrada `crm-demo.html` redirige a esta sección. Los actores Ana/Luis/Administración dentro de CRM siguen siendo una simulación explícita; los roles operativos de backoffice no adquieren permisos comerciales por esta integración. El módulo usa datos ficticios. Las dos vistas, pacientes y doctores/clínicas, comparten contacto, responsable, actividades, tareas y expediente. `asistido-demo.html` es la entrada del titular por cuenta propia o mediante una invitación del KAM. Las páginas anteriores conservan sus manejadores y muestran un acceso al registro unificado.

El correo de `crm.html` sigue siendo un módulo separado. Este trabajo no configura dominio, Google OAuth, credenciales, Gmail, WhatsApp ni telefonía. No se publicó nada ni se enviaron mensajes.

## Identidad y atribución

- Cada contacto y expediente tiene identificadores estables. Se detectan coincidencias de identidad; no se sustituye una cuenta existente ni se concede acceso al KAM por conocer su correo.
- Una invitación continúa el expediente provisional; no crea otro. Un registro previo que requiere conciliación se bloquea de forma explícita, en vez de sobrescribir datos o crear duplicados. Las cuentas del flujo anterior continúan por su acceso anterior.
- Origen inicial, KAM que refiere, KAM asignado y personas que ayudan son conceptos diferentes. Un nuevo enlace o una reasignación no reescribe la procedencia original.
- Los enlaces de referido e invitación contienen identificadores opacos, no datos personales. Su validación es local y sirve para demostrar el flujo, no para impedir alteraciones maliciosas en producción.
- Sin enlace no significa orgánico. No se define política de comisiones, ventanas comerciales ni derechos económicos.

## Captura asistida y decisiones del titular

El KAM puede preparar información y adjuntar archivos ficticios al contacto asignado. Se conserva actor y fecha de captura, separados de la fecha de contacto informada manualmente.

El titular debe abrir la invitación, confirmar el correo previsto y completar una verificación simulada. El código visible no se envía a ningún correo y no acredita identidad real. No se pide ni guarda una contraseña real. Los enlaces vencen, se consumen una vez y una invitación reemplazada deja de funcionar.

Solo el titular realiza las confirmaciones simuladas de identidad, Buró, revisión final, aceptación de oferta y firma. Una clínica confirma mediante su titular o representante autorizado. Esto no acredita facultades reales ni cumplimiento legal; producción requiere el mecanismo y evidencia validados con los proveedores y asesoría correspondientes.

El envío bloquea la edición. La ayuda posterior no permite modificar datos ya enviados, ofertas aceptadas ni contratos. Las correcciones de datos del registro unificado utilizan el motor de campos observados existente y conservan el envío original inmutable. El borrador corregido solo cambia los campos pedidos; el titular reenvía y backoffice revisa y aprueba. Los expedientes anteriores conservan su circuito y sus límites.

## Backoffice independiente

Las altas confirmadas aparecen en el panel «Altas CRM y registro asistido · DEMO» del backoffice. Un rol autorizado debe importarlas expresamente. Los registros se agregan sin modificar los anteriores; repetir la importación no duplica el alta.

La ficha CRM muestra el estado operativo leído del backoffice. No ofrece un botón comercial de aprobación. Los archivos y confirmaciones de la demo no se convierten automáticamente en documentos válidos, autorización real de Buró ni identidad validada.

Las correcciones documentales identifican un documento exacto. El KAM o titular puede cargar un reemplazo ficticio; solo el titular lo confirma y reenvía. Backoffice verifica que el archivo local existe y coincide con su tipo, tamaño, contacto y autor antes de recibirlo o aprobarlo. El candidato no reemplaza al original hasta aprobarse. Al rechazarlo se conserva la versión previa y se archiva la rechazada con motivo. El historial mantiene versiones y autores; se puede volver a solicitar otra versión.

Backoffice tiene vistas previas y descarga del documento vigente, el candidato y el historial. Las decisiones documentales requieren el permiso documental y el permiso de pacientes/proveedores correspondiente. Los permisos de riesgo no conceden automáticamente revisión documental.

Por integridad del prototipo se procesa una observación documental activa por expediente y no se abre simultáneamente con una corrección de campos pendiente. Un grupo documental antiguo de múltiples archivos no se reemplaza como si fuera un archivo único. No se permite usar el circuito para cambiar una operación ya aceptada o firmada.

Las ofertas se muestran al titular mediante una lista positiva de campos públicos. Margen, notas y datos internos no se proyectan. La aceptación se vincula con la huella de la oferta exacta; se rechaza una oferta cambiada o vencida. Backoffice recibe las decisiones del titular de manera explícita, preservando importes, cuota, calendario y reglas financieras previas. La firma se habilita solo cuando backoffice marca el contrato preparado.

## Contacto, tareas y evidencia

WhatsApp abre un enlace `wa.me` con un número normalizado. Llamar utiliza `tel:` y copiar solo copia el número. Abrir cualquiera de estas acciones no significa mensaje enviado, llamada conectada ni llamada contestada.

«Mi teléfono» guarda una preferencia del dispositivo por KAM y explica las opciones del sistema: Continuity de Apple, Phone Link de Windows o copiar/usar el teléfono. No enlaza equipos ni garantiza que el número guardado sea el remitente. No se automatiza la grabación.

Cada intento puede registrarse manualmente con resultado, nota, fecha del contacto, evidencia opcional y siguiente acción. No se exige grabación de todos los contactos. Las tareas separan pendientes, vencidas y próximas; su cierre conserva el motivo.

Los archivos binarios se almacenan en IndexedDB: hasta 5 MiB por archivo, 25 MiB totales y 200 archivos, con validación de formato y transacciones. No se incrustan archivos grandes en localStorage. Son límites técnicos de esta demo, no políticas comerciales. La cuota del navegador puede ser menor. Las vistas previas usan URLs temporales y deben revocarse al cerrar o cambiar la selección.

## Límites y requisitos de producción

- Solo usar información y documentos ficticios. Cualquier persona con acceso al navegador puede acceder o cambiar sus datos locales.
- Los roles, identidad y permisos locales no son autenticación ni RBAC real. El almacenamiento no es un servidor privado ni una bóveda de documentos.
- No existe sincronización entre equipos. Borrar datos del navegador elimina la demo.
- Los controles de revisión y persistencia evitan errores ordinarios y estados obsoletos dentro de este prototipo; no resuelven todas las carreras de un sistema distribuido.
- Producción necesita autenticación, RBAC y autorización en servidor, base de datos transaccional, enlaces firmados y caducidad en servidor, almacenamiento privado, análisis de archivos, auditoría persistente, recuperación y políticas de privacidad/retención.
- El dashboard calcula sus cifras desde eventos y tareas locales, con mes y año actuales por defecto. No se inventan conversiones ni aplicaciones generadas.

## Verificación

`npm test` ejecuta las regresiones previas y las nuevas pruebas de dominio, UI mediante manejadores reales, evidencia y revisión adversarial. `npm run build` genera el paquete local sin desplegar. `node scripts/validate-mail-build.mjs` verifica el empaquetado del correo existente.

La validación visual con navegador es una etapa independiente. En este entorno Chromium no pudo abrir una página por la restricción de creación de sockets; no se declara QA visual ni IndexedDB real en Chromium como realizada. Las pruebas funcionales de evidencia usan un backend transaccional inyectado; queda conservado el smoke opcional para un entorno con navegador habilitado.
