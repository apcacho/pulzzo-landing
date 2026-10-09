# PULZZO: correcciones aprobadas sobre respaldo v22

## Base y alcance

Base exacta: `apcacho/pulzzo-landing`, rama `backup/demo-v22-20261008`, commit `91eb74924e862ada0f5003796218589f20e53cc6`. Los 98 archivos originales se copiaron a un directorio de trabajo separado. El respaldo y el ZIP original no se modificaron. Estas correcciones son nuevas sobre v22; no se afirma una recuperación exacta del ZIP v23 inaccesible.

Trabajo local para revisión. Sin push, despliegue, CRM, Gmail, OAuth ni credenciales. Sigue siendo una demostración con localStorage, sin autenticación real ni certificación financiera para producción.

## Correcciones

- Saldo insoluto: las ofertas nuevas llevan política versionada y una instantánea del capital, tasa, fechas, número de pagos y cuota regular cotizada. Al registrar una dispersión posterior, se conserva esa cuota y todos los vencimientos; el interés comienza en la fecha real y se ajusta la última cuota. Se muestra el ajuste en backoffice y en el calendario canónico recibido por el paciente.
- Fechas inválidas, cuota insuficiente, amortización anticipada incompatible, condiciones diferentes o movimientos de capital/interés pendientes de conciliación bloquean la activación para revisión. Una comisión upfront cobrada por separado no se considera un abono al capital. Las dispersiones parciales en fechas diferentes requieren revisión: no se inventa una política multidesembolso.
- Las ofertas aceptadas y los calendarios históricos no se reinscriben silenciosamente en la política nueva. La firma del calendario de servicio puede cambiar, pero no reescribe la oferta aceptada. La activación se guarda una sola vez con protección de concurrencia y reversión ante fallas de almacenamiento.
- Después del envío, los datos del paciente quedan bloqueados tanto en controles como al guardar. Solo se habilitan campos expresamente observados por backoffice, mediante un borrador de corrección separado. El reenvío bloquea de nuevo; la aprobación aplica únicamente esos campos. Ingresos corregidos actualizan requisitos y obligan a revisar evidencia. Referencias disponibles antes del primer envío. Sin reiniciar cuenta, solicitud o contrato aceptado.
- Correcciones vinculadas por cuenta, solicitud y expediente, con versión, nonce y base exacta. Pruebas cubren reenvíos, respuestas antiguas, cambios concurrentes, fallas de guardado y recuperación. La revisión del doctor se mantiene.
- Oferta al paciente: lista positiva de campos escalares y anidados, sin costos del proveedor, dispersiones internas, márgenes ni riesgo. Huella opaca SHA-256 v2; las instantáneas históricas aceptadas se conservan localmente. Calendario seleccionado incompatible con la oferta exige una nueva oferta, tanto en pantalla como en el traspaso de aceptación.

## Ejemplo financiero reproducible

MXN 12,345.67, tasa anual 24%, interés ACT/360 sobre saldo insoluto, IVA 16% sobre el interés redondeado, cotización 8 de octubre de 2026, dispersión 12 de octubre de 2026. Sin comisión financiada ni pagos iniciales.

- Mensual: 12 vencimientos, del 15 de octubre de 2026 al 15 de septiembre de 2027. Once pagos de MXN 1,171.68 y último de MXN 1,122.26. Ajuste final: −MXN 49.42.
- Quincenal: 24 vencimientos, día 15 y último día de mes, del 15 de octubre de 2026 al 30 de septiembre de 2027. Veintitrés pagos de MXN 589.73 y último de MXN 539.60.

El ejemplo no define condiciones comerciales nuevas; prueba las reglas ya implementadas con supuestos explícitos.

## Verificación

Resultado final: 44/44 suites aprobadas; 136/136 comprobaciones financieras. `git diff --check` sin incidencias.

Ejecutar `node tests/run.cjs` desde la raíz. El conjunto incluye las 41 suites originales y tres nuevas: privacidad v2, bloqueo del paciente y transporte de correcciones. Se mantienen pruebas de global/insolutos, IVA, pagos efectivos, prepago, prórrogas, reversos, límites cronológicos, calendario CDMX, permisos, cartera, proveedor y proyecciones canónicas.

Los hashes de scripts completos de las pruebas visuales estáticas se actualizaron exclusivamente por los cambios funcionales revisados. No se cambiaron CSS ni imágenes originales; su prueba independiente de conservación permanece activa.

Una revisión independiente reprodujo y cerró los casos de alias de días de pago, huella histórica al recibir calendario, inicialización de solicitudes históricas, conservación de prórrogas y firma de oferta tras dispersión. Se ejecutaron pruebas VM de código real y controles montados con fallas de almacenamiento.

## Límites

No se completó QA visual de navegador: Chromium instalado no pudo arrancar por restricciones del sistema (`socket(): Operation not permitted`), incluso en el intento revisado de ejecución ampliada. Las pruebas de estructura/VM no sustituyen revisión visual ni pruebas bancarias o de producción. No se añadieron servicios externos ni controles de seguridad reales del lado servidor.
