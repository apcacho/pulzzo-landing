# PULZZO v36 asistido (2026-10-14). Cambios
Rama `grok/asistido-20261014` (base: rama `baseline`, commit 346ed13). No se hizo push ni deploy.

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
