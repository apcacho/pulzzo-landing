# Revisión del CRM y registro asistido DEMO

Fecha: 9 de octubre de 2026. Base preservada: `15d7c4543049d9e54f027dce277e1fc8b169226f`.

## Resultado entregado

CRM local con vistas de pacientes y profesionales, seguimiento comercial, tareas, atribución por origen/KAM, acciones manuales de teléfono y WhatsApp, evidencias binarias locales y registro autónomo o asistido sobre el mismo expediente.

El titular controla el acceso simulado, confirmaciones, envío, aceptación de oferta y firma demo. El backoffice importa las altas, revisa datos/documentos y recibe las decisiones del titular de forma independiente. Los estados comerciales no sustituyen aprobaciones operativas.

La solicitud original se conserva inmutable. Las observaciones abren solo un borrador de campos o un documento exacto. Se conserva el archivo anterior hasta que el reemplazo se apruebe; el rechazo deja historial y permite una nueva solicitud de corrección. Las versiones aprobadas se proyectan al titular sin reescribir el envío original.

## Pruebas ejecutadas

- `npm test`: 52 archivos de regresión más 29 pruebas del módulo de correo, aprobados.
- Almacén CRM: 55 casos de comportamiento sobre identidades, permisos de la demo, atribución, eventos, revisiones, archivos y persistencia.
- Registro asistido: 30 pruebas de estados y pruebas adicionales de los manejadores reales del titular.
- Correcciones: 17 conjuntos de pruebas, con los métodos canónicos de datos y el esquema documental del backoffice.
- Revisión independiente: 33 escenarios, incluidos manejadores reales de importación, aceptación y correcciones de pacientes/profesionales.
- Interfaz CRM y controles de backoffice: manejadores reales ejecutados con DOM simulado; filtros de rol, referencias exactas, acciones repetidas, navegación, carga, previsualización y cancelación.
- `npm run build` y `node scripts/validate-mail-build.mjs`: generación local y validación del Worker y de la lista permitida de archivos públicos.
- `git diff --check`: sin errores de espacios.

Estos recuentos corresponden a niveles distintos y se solapan: no deben sumarse como si cada grupo fuera independiente.

## Integridad verificada

- Duplicados y colisiones con cuentas previas; una nueva carga no concede acceso a otra cuenta.
- Invitación de destinatario exacto, caducidad, uso único, reemplazo y reintentos sin duplicación.
- El KAM no puede confirmar, enviar, aceptar ni firmar por el titular.
- Las observaciones no habilitan campos o documentos ajenos al alcance solicitado.
- La oferta recibida utiliza solo campos públicos, con la huella del contenido exacto y control de vigencia.
- Una operación ya aceptada o firmada no se reinicia ni cambia mediante ayuda o correcciones.
- Fallos de escritura, revisiones obsoletas y respuestas asíncronas de una sesión anterior no dejan cambios parciales.
- Los binarios se guardan en IndexedDB con validación de formato, tamaño, identidad del contacto y autor. Backoffice vuelve a verificar el binario antes de recibirlo o aprobarlo.
- Se conserva la versión anterior, el candidato rechazado y los actores/fechas de captura y revisión.
- Los contadores del dashboard se derivan de eventos locales; cambiar manualmente una etapa no genera una solicitud ficticia.
- Las pruebas previas de cartera, ofertas, cuotas, fechas, pagos, correcciones y privacidad siguen aprobadas.

## Lo que no se verificó

Chromium no pudo iniciar por la restricción de creación de sockets del entorno. No se completaron pruebas visuales reales de escritorio/móvil, accesibilidad visual ni el smoke de IndexedDB en Chromium. Se conservaron pruebas opcionales para ejecutarlas en un entorno compatible. Las pruebas de DOM y del backend transaccional simulado no sustituyen esa validación visual.

No hubo publicación, activación de Gmail, creación de credenciales, asociación de teléfonos, envío de mensajes ni llamadas reales. El módulo de correo sigue preparado y separado, sujeto a configuración posterior del dominio y servicio.

## Límites de la demo

Los roles, cuentas y verificaciones son simulados en un navegador. No constituyen seguridad en servidor, autorización real de Buró, autenticación, firma válida ni almacenamiento privado para datos reales. El navegador puede borrar o alterar su almacenamiento; no hay sincronización entre dispositivos ni transacción distribuida entre ventanas.

Las cuentas anteriores continúan por sus accesos existentes. Una identidad incompatible exige conciliación explícita; no se migra ni se toma control automáticamente. Los grupos documentales anteriores de varios archivos no se sustituyen mediante el control de un único documento.

Usa exclusivamente datos y documentos ficticios. Consulta `REGLAS-CRM-REGISTRO-ASISTIDO-DEMO.md` para el flujo y los requisitos pendientes de producción.

## Corrección de navegación: CRM dentro del backoffice

La entrada principal es `backoffice.html#crm`, con Admin demo. El CRM aparece como sección del menú lateral y conserva la cabecera y los controles de navegación del backoffice. La antigua URL `crm-demo.html` redirige a la sección correcta. El módulo funcional se reutiliza sin duplicar los motores de expedientes, documentos o finanzas. En la vista integrada, Clientes y Proveedores son pestañas internas, sin otra marca o menú global.

La integración reconoce únicamente su propia ventana hija de mismo origen y la sesión Admin demo activa. No utiliza mensajes de origen abierto. Cambiar de sección o cerrar sesión retira la vista CRM, invalida la instancia y cierra sus diálogos; atrás/adelante pertenece al backoffice. Los roles Riesgo y Solo lectura no adquieren permisos CRM. La selección de KAM continúa siendo una simulación, no autenticación real.

Se añadió una prueba independiente de manejadores de navegación, historial, cierre de diálogos, permisos, entrada antigua e invariancia SHA-256 del código inline original del backoffice. Se mantienen las pruebas funcionales completas y la validación del build. La disposición móvil se ajustó estructuralmente para evitar doble desplazamiento y recortes de la cabecera. No se pudo realizar inspección visual: Chromium falla antes de cargar la página debido a `socket() Operation not permitted`. Las pruebas DOM/VM no sustituyen revisión visual en un navegador real.


## Actualización posterior de diseño

La integración por ventana hija descrita arriba fue reemplazada por montaje nativo, con estilos heredados del Backoffice. La revisión y los resultados actuales están en [REVISION-CRM-DISENO-BACKOFFICE-20261009.md](REVISION-CRM-DISENO-BACKOFFICE-20261009.md). Los apartados anteriores conservan el registro de sus verificaciones históricas.
