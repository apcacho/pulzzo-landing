# PULZZO v36 asistido (2026-10-14). Cambios
Rama `grok/asistido-20261014` (remota: https://github.com/apcacho/pulzzo-landing/tree/grok/asistido-20261014) (base: rama `baseline`, commit 346ed13). No se hizo push ni deploy.

1. Diálogo previo «Primero el cliente debe registrarse»: explica qué falta, da un enlace copiable e incluye una nota de mismo navegador. Archivo: `assets/js/crm-demo-ui.js`.
2. Teléfono y correo obligatorios en contactos CRM. El teléfono del registro pasa a la ficha (evento `holder_phone_saved`). Los teléfonos ficticios `5500000xxx` solo están en los datos semilla. Archivos: `crm-demo-store.js`, `crm-assisted.js`, `native-registration.js`, `crm-demo-ui.js`.
3. Modo asistido (paciente):
   - Ubicación, INE y selfie muestran «Pendiente: lo hace el paciente».
   - La solicitud ya no abre en el paso de ubicación.
   - El KAM puede capturar el NIP de Buró. El historial registra «NIP capturado por KAM» con KAM y fecha/hora, y el NIP queda enmascarado.
   - Aceptaciones y firma: solo el paciente.
   - Archivos: `solicitud-paciente.html`, `patient-onboarding.js`, `crm-assisted.js`, `crm-demo-ui.js`.
   - El flujo doctor se revisó aparte. Ahora registro-doctor valida tipo, estado, municipio y especialidad antes de avanzar. Antes se podía enviar sin municipio o especialidad y luego se atoraba en la verificación. Archivo: `native-registration.js`.
4. El cliente sigue el mismo expediente, ve lo que capturó el KAM y puede reemplazar archivos y cambiar datos. Después del envío queda bloqueado (`REVIEW_LOCK`) y solo se editan los campos de corrección (`crm-assisted.js:203-238`, lógica ya existente).
5. El avance no caduca. Se quitó el límite de 30 min del borrador y hay autoguardado de campos. La sesión del cliente expira tras 30 min sin actividad (máximo 12 h). Al volver con el mismo enlace se pide un código nuevo y se retoma en el mismo lugar. Archivos: `crm-onboarding-session.js`, `crm-holder-ui.js`, `native-registration.js`.
6. README: se corrigió la afirmación sobre la leyenda del login (no se agregó leyenda).
7. `dispersionPeriodDays`: con 0 días devuelve 0. Con días negativos o fechas inválidas se detiene (`NEGATIVE_PERIOD_DAYS` / `INVALID_PERIOD_DATES`). Test nuevo: `tests/dispersion-period-days.cjs`.

Tests nuevos: `tests/v36-assisted.cjs`, `tests/dispersion-period-days.cjs`. Fixture: `tests/fixtures/v36-reviewed-changes.json`.

8. Nombre oficial (b034d5c):
   - El nombre que el cliente escribe en su registro inicial pasa a ser el nombre oficial en el saludo y en la ficha CRM.
   - El nombre anterior se guarda en `nameHistory` con la etiqueta «nombre capturado por KAM»; además se registra el evento `holder_name_saved`.
   - La regla de identidad en `crm-demo-store.js` admite solo este cambio exacto, solo cuando lo hace el titular.
   - Test en `tests/v36-assisted.cjs`.

## v36b · Registro → CRM (2026-10-14)
1. **Origen orgánico.** El registro propio sin enlace guarda `originalSource:'organic'` y la ficha muestra «Orgánico». No se agregó la pregunta «¿cómo nos conociste?». Archivos: `crm-assisted.js` (createSelfService) y `crm-demo-ui.js` (etiqueta).
2. **Tarea automática por registro nuevo** (orgánico o referido):
   - Se crea UNA tarea «Contactar a {nombre} · nuevo registro» para el responsable, con vencimiento a 24 h. Las fechas se muestran en CDMX.
   - Si no hay responsable, el título agrega «· Falta asignar responsable».
   - Se ve en la ficha y en el módulo Tareas, y no se duplica al reingresar.
   - Archivos: `crm-assisted.js` (`registrationTask`) y `crm-demo-store.js` (`holderRegistrationTask`: el titular solo puede crear esta tarea en la misma escritura de su alta).
   - El responsable sigue la configuración del CRM (admin / líder / turnos).
3. **Solicitudes «En captura»:**
   - Solicitudes de pacientes y Solicitudes de doctores y clínicas muestran los registros desde el alta, en el bloque «Solicitudes/Altas en captura». Cada fila trae «En captura», los pendientes y documentos, y el enlace a la ficha CRM; es el mismo expediente.
   - «Evaluar» y «Generar oferta / Aprobar alta» quedan deshabilitados hasta el envío.
   - Los expedientes enviados se incorporan automáticamente, de forma idempotente. El botón «Importar expediente seleccionado» de Altas CRM sigue funcionando; si el expediente ya existía, responde «ya estaba importado».
   - Archivo: `crm-demo-office.js`.
4. **Enlaces de referido:**
   - Cada KAM tiene 2 enlaces permanentes y reutilizables: pacientes, y doctores/clínicas. No caducan.
   - Botón «Mis enlaces de referido»: muestra ambos, con copiar y vista del cliente. Ojo: el botón ya existía como «Invitar a un cliente nuevo»; el hallazgo de la revisión previa de que «no había botón» era un error mío de prueba.
   - Administración y el líder tienen el botón «Enlaces de referido», que lista todos y permite revocar con motivo. La revocación queda en el historial (`referral_revoked`) y no se puede reactivar.
   - El enlace se desactiva si el KAM queda inactivo (regla existente).
   - Archivos: `crm-demo-store.js` (`listReferrals`, `revokeReferral`, reglas), `crm-demo-ui.js`, `crm-demo-template.js`, `crm-demo.html`.
5. **Duplicados:**
   - Los mensajes son claros: «Ya tienes una cuenta con este correo/celular. Inicia sesión para continuar.», con botón «Iniciar sesión» al portal correcto.
   - El celular se revisa ANTES de pedir el código.
   - Se crea UNA alerta «{nombre} intentó registrarse de nuevo» para el responsable de la ficha existente. Si ya hay una abierta, solo suma intentos.
   - El mismo celular entre paciente y doctor se permite, y ambas fichas muestran «Revisar: este celular también está en un registro de …». Dentro del mismo tipo sigue bloqueado.
   - Archivos: `crm-assisted.js`, `crm-demo-store.js` (`noteDuplicateRegistration`, `sharedPhoneAcrossTypes`, índice de celular por tipo), `native-registration.js`, `crm-demo-ui.js`.
6. **Bugs:**
   - «Hola, Dr. Dr.» (`registro-doctor.html`, profileGreetingParts).
   - El menú móvil «Solicitar financiamiento» ahora lleva a `registro-paciente.html` (`index.html`).
   - Insignia «v36 · revisión incompleta» (`index.html`, `backoffice.html`) y `VERSION.json`.
   - El «Aviso de privacidad» del pie SÍ es visible en escritorio: el enlace oculto era el del modal cerrado, así que no se cambió CSS.
7. Tests: nuevo `tests/v36-registro-crm.cjs`. Se ajustaron `crm-assisted`, `crm-intake-routing`, `crm-intake-owner-routing` y `crm-organic-signup`, y se agregó una inversa en `tests/fixtures/v36-reviewed-changes.json` para `registro-doctor.html`.

## v36c · Acceso entre tipos y duplicados (2026-10-14)
- `crm-demo-store.js`: `setCrossTypeAccess` (interruptor con historial; cierra la tarea `cross_type_request` como Hecha con `resolution`), `crossTypeEligibility`, `referralStatus`, `advisorFor`. Nuevas tareas del titular `cross_type_request` y `client_entered`. Reclamo verificado de ficha KAM sin cuenta (`kam_contact_self_claimed`). Índices de correo/celular por tipo, más una regla de pares entre tipos que exige el interruptor y el vínculo. Alerta de duplicado a 24 h.
- `crm-assisted.js`: mensajes por campo, bloqueo entre tipos con mensaje del asesor, continuación del mismo expediente, enlace revocado → regla CRM con historial.
- `crm-demo-ui.js`: interruptor «Habilitar también como …» en la ficha, con diálogo de motivo, estado «Solicitud pendiente» y última modificación; etiquetas de historial nuevas.
- `native-registration.js`: aviso «Te está atendiendo …» en la verificación.
- Tests: `tests/v36c-cross-type.cjs` (nuevo; incluye el cierre automático habilitado/rechazado) y `tests/v36-registro-crm.cjs` actualizado.
