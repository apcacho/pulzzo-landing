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
