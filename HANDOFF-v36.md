# Handoff v36 asistido
## Estado
- Commits (más reciente primero):
  - 994ed91 Doctor: validación explícita de datos iniciales (tipo, estado, municipio, especialidad); test de diálogo actualizado
  - 49e74f1 Registro parcial: los valores escritos por la persona se restauran tras los valores demo de la página
  - ea51035 Solicitud asistida: inicia en el primer paso capturable por KAM sin bloquear la consulta explícita de Ubicación
  - 5823c45 Pruebas: parches v36 revisados y reversibles en fixtures de baseline; guardas de eventos de documento; sesión del titular
  - b64c919 Asistido: NIP de Buró capturado por KAM con historial, paciente sin paso de ubicación al asistir, sesión del titular 30 min sin actividad, registro parcial sin límite; dispersionPeriodDays sin 30 días falsos; README login; pruebas v36
  - e174245 CRM: diálogo 'Primero el cliente debe registrarse', aviso mismo navegador, teléfono y correo obligatorios, teléfono del registro a la ficha, teléfonos ficticios en ejemplos; pruebas ajustadas
  - 346ed13 Baseline v35-consolidada-20261014 tal cual (460 archivos)
- No se hizo push ni deploy. No se tocó la demo publicada ni los respaldos.

## Pruebas
- Node: 131 archivos.
  - Pasan todos, salvo crm-contact-simplification, que ya fallaba en baseline («ruta no corresponde»). Por ese fallo `npm test` sale con EXIT 1.
  - financial-conservation-sweep-20261012 pasa, pero tarda más de 120 s.
  - No se ejecutaron 5 tests `*-browser.cjs`: falta el módulo `playwright` en el entorno; también fallan igual en baseline.
- Navegador headless real (Chrome, servidor local 8099): escritorio y móvil, paciente y doctor, escenarios a–e.
  - Paciente: 24/24 PASS en escritorio y 24/24 en móvil.
  - Doctor: 16/16 PASS en escritorio y 16/16 en móvil.
  - Script: `/tmp/pw/v36.js`.

## Verificación de prelación (solo lectura, sin cambios)
- El código NO cumple IVA > comisiones > moratorios > ordinarios > capital.
- `backoffice.html:8707-8717` (`dispersionConceptDefs`), aplicado en `backoffice.html:8735-8749` (`dispersionApplyAmountToConcepts`). El orden actual es:
  1. Interés ordinario
  2. IVA interés
  3. Interés moratorio
  4. IVA mora
  5. Comisiones
  6. Moratorios sin intereses
  7. Ordinarios sin intereses
  8. Capital
- Falta decidir cómo se separa el IVA por concepto. Las comisiones hoy no llevan IVA propio.

## Decisiones del usuario (aún no implementadas)
- Prelación: IVA > comisiones > moratorios > ordinarios > capital.
- IVA 16% por defecto; será configurable con vigencia.
- Insolutos: base 360 por producto por defecto. Globales: cargo mensual fijo.
- Insolutos/globales configurables por cliente.
- Dispersión tardía: se mantiene la cuota y se ajusta la última, en todos los créditos.
- Aplicación de pagos manual por ahora:
  - Aviso de duplicado por monto + cuenta + fecha + crédito; la referencia es informativa.
  - Se guarda el comprobante y su origen.
- Prórroga con comisiones pendientes: muestra aviso y requiere permiso + motivo.
- Próximos temas, en orden:
  1. Grupos de permisos (solo admin edita)
  2. Condonaciones
  3. Bandeja «Por facturar» (sin timbrado)
  4. Agente de estados de cuenta en Drive

## Pendientes / observaciones
- El saludo usa el nombre de la ficha CRM, no el que el cliente escribe en el registro. ¿Debe actualizarse?
- crm-contact-simplification ya fallaba en baseline.

## Publicación (2026-10-14, 1 p.m. CDMX)
- Rama local `grok/asistido-20261014`, commit b034d5c, con historial propio (no relacionado con el remoto).
- Push a apcacho/pulzzo-landing: BLOQUEADO.
  - En el entorno, `gh` no tiene sesión iniciada y no hay credenciales de git.
  - El conector de GitHub solo crea ramas desde un SHA que ya existe en el remoto; no puede subir un historial propio.
  - Para hacerlo se necesita una de dos cosas: `gh auth login` en la caja, o un push manual desde la máquina del usuario.
  - Comando: `git push origin grok/asistido-20261014` (sin --force).
- GitHub Pages: no se publicó.
  - El repo ya tiene Pages habilitado (`has_pages: true`), con una configuración actual que no se cambió.
  - Además, no hay credenciales para publicar.
- Auditoría del árbol (465 archivos): no están los 4 documentos excluidos ni `node_modules`.
  - No se encontraron tokens ni llaves: solo hay referencias a endpoints OAuth en `server/google.mjs`, sin secretos.
  - Las imágenes son activos de marca (logo, favicon, hero, OG).
  - No hay expedientes reales.

## Publicación: actualización (2026-10-14, 1:45 p.m. CDMX)
- Push realizado (rama nueva, sin --force): https://github.com/apcacho/pulzzo-landing/tree/grok/asistido-20261014
  - Primer push: commit 1a01eaf. Esta actualización de documentos se subió encima como fast-forward.
  - Las demás ramas no cambiaron: main 291d043, feature/crm-assisted-demo-20261009 9171ab6, fix/demo-flows-20261007 291d043, backup/demo-v22-20261008 91eb749.
- Auditoría previa al push sobre exactamente lo que se subió (465 archivos y todo el historial de la rama): sin los 4 documentos excluidos, sin node_modules, sin tokens ni llaves privadas, sin expedientes reales.
- GitHub Pages: ya está en uso. El API muestra source main:/, build legacy, https://apcacho.github.io/pulzzo-landing/. NO se cambió. Demo pública de v36: no publicada.
- Opciones para publicar la demo (requieren decisión del usuario):
  - (a) Cambiar la fuente de Pages a la rama grok/asistido-20261014. Reemplaza la landing actual.
  - (b) Repo aparte (p. ej. pulzzo-demo-v36) con su propio Pages. Requiere un token con acceso a ese repo.
  - (c) Pages con GitHub Actions. También cambia la configuración actual.
  - (d) Hosting estático externo (Netlify, Cloudflare Pages).

## v36b · Decisiones del usuario: registro → CRM (implementadas)
1. Registro sin enlace: origen «Orgánico» (`organic`). Sin campo «¿cómo nos conociste?».
2. Responsable según la configuración del CRM (admin / líder / turnos entre KAMs activos). Cada registro nuevo crea UNA tarea «Contactar a {nombre} · nuevo registro» que vence en 24 h (CDMX). Sin responsable, la tarea lo indica. No se duplica.
3. Los registros aparecen en Solicitudes de pacientes / doctores y clínicas desde el alta como «En captura», con su avance; es el mismo expediente. La evaluación y la oferta se habilitan solo tras el envío. La importación manual de Altas CRM se conserva y es inofensiva.
4. Dos enlaces de referido por KAM, reutilizables y sin caducidad. Se desactivan si el KAM queda inactivo o si Administración o el líder los revocan (con historial).
5. Duplicados: mensaje claro con «Iniciar sesión», celular revisado antes del código y alerta deduplicada al responsable. Mismo celular entre paciente y doctor: permitido y marcado para revisión en ambas fichas; en el mismo tipo, bloqueado.
6. Bugs corregidos: «Dr. Dr.», menú móvil, insignia v36.

## Pendiente para la fase con backend
- No existen la recuperación de contraseña ni el cambio de celular: la demo no tiene autenticación real.
- Decisión: el celular solo lo cambia el equipo PULZZO, con validación de identidad.

## Dudas de negocio abiertas (registro → CRM)
- La alerta de registro repetido vence «ahora» (sale como vencida). ¿Debe tener otro plazo?
- Correo existente en OTRO tipo (paciente ↔ doctor): sigue bloqueado con mensaje claro y alerta. ¿Debe permitirse como con el celular?
- Correo o celular de una ficha creada por un KAM SIN cuenta: el mensaje dice «Tu asesor PULZZO te enviará tu enlace personal» y se crea la alerta. ¿Es el texto correcto?
- Enlace de referido revocado: hoy el registro se detiene con error. ¿Debe seguir como registro orgánico?
- Incorporación automática de enviados: ocurre cuando alguien con permiso abre el backoffice. ¿Basta así para la demo?

## v36c · Decisiones del usuario (implementadas, 2026-10-14)
1. Mensajes de duplicado según el dato repetido: «Este correo ya está registrado. Inicia sesión aquí» / «Este celular ya está registrado. Inicia sesión aquí», cada uno con su botón «Iniciar sesión». La alerta al responsable vence en 24 h (CDMX); ya no nace vencida.
2. Mismo correo o celular entre paciente y doctor: ya NO se permite solo. El mensaje dice, por ejemplo, «Este correo ya está registrado como doctor. Si quieres pedir un crédito como paciente, tu asesor te ayuda.». Se crea una tarea única para el responsable de esa ficha. En la ficha CRM aparece el interruptor «Habilitar también como paciente/doctor», que pueden cambiar el KAM responsable, el líder o Administración, con motivo opcional e historial (quién, cuándo, motivo). Con el interruptor activo, el cliente se registra en el otro tipo con el mismo correo o celular: se crea un registro nuevo vinculado (`linkedContactIds`) a la misma persona, sin fusionar ni duplicar identidad.
   - **Cierre automático (requisito añadido):** al cambiar el interruptor, la tarea de solicitud abierta se marca «Hecha». Queda como `closed` con `resolution` en `enabled` (activado) o `rejected` (desactivado/rechazado), y el historial registra quién la resolvió. El KAM no tiene que cerrarla a mano.
   - Los pares paciente/doctor que ya compartían celular en v36b se conservan (no se rompen); la regla aplica a registros nuevos.
3. Contacto creado por un KAM, aún sin cuenta, que se registra solo y sin enlace con el mismo correo o celular: continúa al momento el MISMO expediente, el KAM sigue como responsable y ve «Te está atendiendo {KAM}, tu asesor(a) PULZZO» (sin nombre si no hay KAM). El KAM recibe la tarea «{nombre} entró a su registro». Se quitó el bloque «Tu asesor PULZZO te enviará tu enlace personal». Si coincide solo el celular y el correo verificado es otro, el correo de la ficha se reemplaza y el anterior queda en el historial como «correo capturado por KAM» (lo mismo con el celular).
4. Enlace de referido revocado o de un KAM inactivo: el registro sigue. El responsable se asigna con la regla de Configuración CRM, el origen queda «Orgánico» (no es referido de ese KAM) y el historial guarda `revoked_referral_used` (enlace y KAM). Un token inexistente sigue rechazándose.
5. Visibilidad de Solicitudes por rol (verificada, sin cambios): KAM y líder no tienen `viewPatients`, así que no ven los módulos de Solicitudes; trabajan en el CRM, donde el KAM ve solo lo suyo y el líder y Administración ven todo. Operaciones, Riesgo, Cartera y Solo lectura ven todas las solicitudes según sus permisos. Con varios roles, los permisos se suman: KAM + Solo lectura ve todas las solicitudes porque Solo lectura lo concede; no es un acceso global accidental. La demo no maneja «equipos», así que el líder ve todo el CRM.
6. Backend: la visibilidad «inmediata» de la tarea, la notificación al KAM y el registro en Solicitudes ocurren hoy en `localStorage` del mismo navegador. En producción requieren backend (persistencia compartida y notificaciones).

## Dudas abiertas v36c
- ¿El líder debe ver solo su equipo? La demo no tiene equipos.
- Si coincide solo el celular con una ficha del KAM y el correo es distinto, hoy se adopta el correo verificado (el anterior queda en el historial). ¿Es correcto o debe revisarlo el KAM?
- El enlace revocado deja el origen como «Orgánico». ¿Prefieren un origen propio, por ejemplo «Enlace revocado»?

## v36c · Aprobado por el usuario
Se aprobó tal cual: gana el correo verificado; el enlace revocado queda «Orgánico»; el líder ve todo mientras no existan equipos.

## v36d · Grupos de permisos (implementado, 2026-10-14)
Cambio mínimo sobre el directorio existente (`staff-access.js`): los «roles» actuales ya funcionaban como grupos. Una cuenta puede tener varios y los permisos se suman. Los roles actuales no cambian. Solo Administración edita todo esto.
1. **Usuarios:** nombre, correo y celular obligatorios (10 a 15 dígitos), más uno o varios grupos. Las cuentas no se borran: se desactivan (`deactivatedAt` / `deactivatedBy`), conservan su historial y pierden sus sesiones. Al desactivar desde la pantalla, los enlaces de referido del usuario se revocan con el motivo «Usuario desactivado» y no reviven si la cuenta se reactiva. Las cuentas de ejemplo tienen celulares ficticios (55000001xx).
2. **Grupos:** son las plantillas de rol existentes y los permisos se suman por recurso, igual que antes.
3. **Permisos individuales:** Administración puede otorgar (todos o solo propios en CRM) o quitar un permiso a una cuenta, con fecha de vencimiento opcional. Al vencer, deja de aplicar solo. El historial guarda `user_permission_changed` con quién, cuándo y el antes/después. Los permisos exclusivos de Admin no se otorgan a otras cuentas. Cada cambio revoca las sesiones del usuario.
4. **Aprobaciones por monto:** `checkAmountApproval`. Un KAM nunca aprueba, aunque tenga permisos individuales. El líder/gerente aprueba hasta su tope; arriba del tope se escala a Administración. Administración tiene su propio tope (vacío = sin tope). Los topes se editan en «Plantillas de roles (grupos)» y quedan en el historial (`approval_limits_updated`). Valor inicial de demostración: líder 10,000 MXN, Administración sin tope (por confirmar).
   - **Pendiente:** hoy no existe un flujo de condonaciones en el backoffice. La regla está lista para conectarse cuando se construya (es el siguiente tema).
5. **Corrección relacionada:** Administración y el líder ya pueden revocar el enlace de un KAM inactivo (antes lo bloqueaba la validación).

### Preguntas v36d (con recomendación)
- **Topes iniciales:** se pusieron líder 10,000 MXN y Administración sin tope. Recomiendo que ustedes definan las cifras reales.
- **Cuenta KAM + Líder:** hoy aprueba como líder. Recomiendo bloquearla si tiene KAM, para cumplir «nunca KAM» al pie de la letra. ¿Cuál prefieren?
- **Tope de Administración superado:** hoy se rechaza sin otro escalamiento. ¿Debe requerir dos firmas de Administración?
- **Expiración de un permiso individual:** hoy deja de aplicar sin aviso. Recomiendo una tarea o aviso para Administración 3 días antes.
- **Grupo nuevo «Gerente»:** hoy se usa «Líder / gerente KAM». ¿Quieren un grupo propio?

## v36e — Rediseño visual de Usuarios y roles (14/10/2026, 22:49 CDMX)
- Solo presentación (assets/js/staff-admin-ui.js); sin cambios de lógica/permisos ni onboarding. Estilos .sx-* inyectados usando tokens del backoffice.
- Cuentas: tarjetas con badges de grupo y estado; filtros nombre/correo, grupo, estado; paginación con selector 10/20/50/100 (default 10).
- Alta/edición en panel lateral por pasos: 1 Datos, 2 Grupos (chips), 3 Permisos individuales con vencimiento, 4 Resumen. Cierra con Esc, ×, al cambiar pestaña/ruta o al guardar.
- Plantillas de roles (grupos): lista en tarjetas con búsqueda y paginación 10/20/50/100; permisos por área en secciones plegables con control segmentado Sin acceso / Solo propios / Todos. Topes de aprobación en tarjeta propia (KAM no aprueba, Líder 10,000 MXN, Admin sin tope).
- Historial de personal: búsqueda + filtro por tipo, paginación 10/20/50/100.
- Pruebas: 126/127 (única falla: crm-contact-simplification, preexistente). Regresión navegador v36d d/m 14/14. Capturas: /workspace/pulzzo-work-out/browser-v36e/.
- Dudas: ¿paginar también la lista de permisos individuales de una cuenta? (recomiendo no, suelen ser pocos). ¿Mostrar autor del historial solo por nombre en vez de nombre+id? (recomiendo nombre, id en tooltip).

## v36f — Configuración por áreas y switches PULZZO (14/10/2026, 23:17 CDMX)
- Solo visual/estructura; sin cambios de lógica, permisos ni historial. No se tocaron páginas de onboarding.
- Menú lateral y título: «Configuración demo» → «Configuración» (una línea, alto 48 px igual que el resto). Badge de versión sin cambios.
- Configuración en pestañas por área: Usuarios y grupos · CRM · Correo CRM · Productos (Condiciones del producto, Comisiones e impuestos) · Cartera (Pagos y liquidación, Prórrogas, Mora y cobranza, Dispersión) · Historial. Las subpestañas conservan ids cfg-tab-<id>. CRM abre el diálogo existente «Configuración del CRM»; Correo CRM enlaza a crm.html.
- Switch compartido .pz-switch (assets/css/flat-design-tokens.css, también dentro del ShadowRoot del CRM vía build-crm-embed). Reemplazados: Cuenta activa (con confirmación al desactivar), Habilitar también como paciente/doctor, Plazos de prórroga (mensual 15/30, quincenal 15), KAMs elegibles para el reparto por turnos, Quitar la fotografía del borrador (perfil público CRM).
- Sin cambiar: consentimientos/declaraciones (portal del titular, publicación de doctor, autorización contractual), listas de selección (redistribución, campos a corregir), chips de grupos, check de procedimientos en oferta.
- Historial de personal: autor por nombre, id en tooltip. Permisos individuales sin paginación.
- Pruebas: 126/127 (única falla preexistente crm-contact-simplification). Actualizados snapshots aprobados: backoffice-navigation-icons (etiqueta), crm-backoffice-navigation (hash), backoffice-configuration (6 áreas). Navegador: v36d d/m 15/15, v36c d/m 21/21. Capturas: /workspace/pulzzo-work-out/browser-v36f/.
