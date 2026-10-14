# PULZZO DEMO — v35 consolidada para Grok
Fecha: 2026-10-14 (UTC). Revisión incompleta; no es una versión certificada ni lista para producción.

## Ejecutar localmente
Usar Node.js 22 o posterior. Desde esta carpeta: `node preview.cjs` y abrir `http://127.0.0.1:8080/backoffice.html#crm`. Solo escucha en localhost. Acceso ficticio de demo: `admin@pulzzo.mx` / `pulzzo-demo`; usar únicamente datos ficticios. No cambiar el origen del navegador si se necesitan conservar sus registros existentes: los datos son locales al origen/navegador y NO están incluidos en este ZIP.

Para desarrollo: `npm ci`. Comprobar bundle: `npm run check:crm`. Regenerar CSS embebido: `npm run build:crm`. Build local: `npm run build` (genera dist/client y código de servidor, NO despliega). El backend/correo NO está activado; no publicar el Worker ni configurar secretos sin autorización. El manifiesto de hosting está saneado, sin identidad de despliegue ni bindings activos. Para un despliegue estático servir únicamente dist/client, nunca el repositorio completo.

Pruebas focalizadas: `node tests/crm-assistance-feedback.cjs` y `node tests/crm-onboarding-routing.cjs`. `npm test` existe para una futura revisión amplia, pero no fue repetido en esta entrega.

## Cambios incluidos
- Fuente completa v35: evidencia PDF durable, visor Safari, onboarding compartido y correcciones previas.
- v35: diagnóstico honesto de FILE_READ_FAILED identifica documento legado ilegible; conserva referencia y pide recarga. Regresión de persistencia y preservación.
- Login posterior a v35: el aviso de revisión se había insertado accidentalmente dentro de una cadena JavaScript durante empaquetado. Se coloca antes del cierre FINAL de body. Scripts inline idénticos a los de la fuente canónica, sin cambios funcionales de login. Estas dos páginas incluyen ya el aviso corregido.
- Asistencia posterior a v35: si falta registro inicial del titular, el rechazo antes quedaba detrás de la ficha modal. Ahora muestra razón y enlace estable del mismo expediente en un diálogo visible; otros errores se muestran explícitamente. Fuente assets/js/crm-demo-ui.js; regresión tests/crm-assistance-feedback.cjs.

## Reglas que deben mantenerse
KAM continúa el mismo expediente DESPUÉS del registro inicial del titular. Preservar origen, responsable, cuenta y expediente; no crear registros de sustitución. Ubicación del dispositivo, INE/selfie del paciente, Buró, consentimiento y firma son acciones personales del titular. No capturar ubicación del KAM ni aceptar por el cliente. Esta restricción de INE paciente no se extiende por analogía a documentos médicos/representante. URLs profesionales: no inventar editor ausente del original. No resetear storage ni borrar evidencia ilegible. Solo datos ficticios; no correo real.

## Pendientes y límites reales
- 45/46 vistas comparadas CON salvedades, no aprobación total. V30 registro/verificación no comparada: originales específicos no localizados.
- V41/V42: textos fiscales demo y nota móvil requieren resolución de paridad. Referencia independiente observada; no certificar igualdad exacta.
- CSF legada paciente: Blob con recurso faltante, requiere recarga honesta; PDFs nuevos y CSF médica reemplazada sí se visualizaron tras reapertura titular/KAM en QA local previa.
- Clic real de login y asistencia tras los arreglos publicados NO verificado: Safari pide sesión ChatGPT de la propietaria. Las regresiones de asistencia/rutas son VM con memoria ficticia, no prueba de navegador.
- Validación histórica v35: 122 suites, 40 pruebas de correo y build aprobados ANTES del arreglo de asistencia. Después: 2 casos asistencia +32 rutas/sesiones aprobados. Esta entrega solo añade comprobaciones focalizadas; ver VERSION.json.
- GitHub: rama feature/crm-assisted-demo-20261009 en apcacho/pulzzo-landing. Commit local previo 7d030787ae340a65ccfffa95c69e4c53d422a765 NO subido y anterior a los dos arreglos. Remoto observado 9171ab6802d792164cefa9b5f37b5f2a5d399e7c. Comprobación actual de push en seco falló por autenticación; no configurar credenciales automáticamente. Revisar remoto antes de publicar.

## Referencias y privacidad
references/original-onboarding contiene los dos HTML originales disponibles (doctor y solicitud paciente), sin modificar. Son referencias, no páginas del runtime; sus rutas de assets son relativas al proyecto original. No hay original de registro-paciente/verificacion-cuenta verificado.
Se excluyen credenciales, configuraciones privadas, datos del navegador/clientes, capturas, checkpoints, reportes internos, node_modules, .git y los cuatro documentos restringidos. Permanecen datos semilla ficticios y fixtures de pruebas como parte del código. El respaldo completo anterior v35 se conserva sin sobrescribir.
