# Integración de portales: demostración local

Fecha: 8 de octubre de 2026. Alcance: únicamente demo con datos ficticios, mismo navegador y origen. No es un backend, autenticación, autorización de producción, conexión bancaria, consulta de Buró ni firma legal.

## Fuente única de cartera

- El backoffice publica una proyección de lectura desde una copia separada del expediente usando el mismo `dispersionBuildSchedule` y reglas de Cartera. El paciente no calcula otra deuda ni registra movimientos.
- Se conservan filas, fechas vigentes/originales, capital, interés ordinario e IVA, mora e IVA ya registrados, comisiones, pagos, pendientes, saldo y estados. El corte corresponde a la última exportación manual; no es sincronización automática.
- Pagos iniciales y comisión de apertura de contado se presentan por separado. Las proyecciones posteriores a abonos, anticipos, prepago, prórrogas, reversos y liquidación no sustituyen la oferta aceptada ni el contrato.
- El calendario no exportado muestra un pendiente explícito. No se sustituye con mensualidades ilustrativas. Un calendario preliminar o bloqueado se identifica como tal.
- La proyección del paciente no contiene márgenes, reparto comercial ni información privada de proveedores. El contrato se identifica con un resumen SHA-256 del fingerprint existente, no con una segunda copia de toda la oferta.

## Identidades y conciliación

- `patientAccountId` y `doctorAccountId` son identificadores locales estables, agregados al registro. La migración es aditiva: no reinicia el estado ni borra contratos o cartera.
- Un doctor se vincula conscientemente con un único ID de proveedor desde backoffice. El texto del nombre solo es una etiqueta; nunca crea el vínculo.
- Las cuentas antiguas y las dispersiones sin relación inequívoca requieren conciliación explícita. Se eligen expediente, procedimiento, dispersión y proveedor por ID.
- `procedureId`, `payoutId` y `providerId` se conservan al normalizar. En expedientes aceptados, los vínculos históricos se guardan en información auxiliar, sin reescribir la oferta. Una fuente cambiada o un ID ambiguo deja de ser exportable.
- Un procedimiento o pago sin vínculo no se atribuye a un proveedor por nombre, índice aproximado, coincidencia parcial, teléfono ni correo. Un monto faltante no se completa con el total del crédito.

## Minimización del portal médico

Solo se exportan el ID de solicitud, nombre mínimo del paciente, procedimientos propios, estado operativo, fecha realmente registrada y dispersiones propias con importe, estado, fecha y referencia mínima. No viajan otras especialidades/procedimientos, otros proveedores, oferta completa, total financiado, margen, Buró, ingresos, RFC/CURP del paciente, dirección, geolocalización, referencias, notas internas ni archivos.

Las vistas sin una proyección válida muestran estado vacío o pendiente. No hay listas fijas de pacientes de ejemplo como sustitución de datos recibidos. La publicación se valida nuevamente por cuenta, proveedor, solicitud y revisión, tanto al recibir como al mostrar o abrir detalles.

## Corrección de perfil médico

1. El doctor envía explícitamente el perfil local a revisión. Sus campos quedan bloqueados.
2. Un usuario de backoffice con la capacidad existente de revisión de proveedores importa el perfil de la cuenta vinculada.
3. Selecciona exclusivamente IDs del catálogo autorizado de campos fiscales, validación médica o documentos de clínica e indica motivo. Una corrección no desbloquea el perfil entero.
4. El doctor recibe la revisión y modifica una copia de los campos observados. Los valores oficiales permanecen intactos.
5. El reenvío transporta solo diferencias, cuenta, proveedor, solicitud de corrección, nonce, versión y fingerprint de la base.
6. Backoffice rechaza campos adicionales, bases cambiadas, otra cuenta, versiones antiguas y reenvíos duplicados. La nueva revisión no equivale a aprobación.
7. Después de revisar las diferencias, la aprobación exportada permite aplicar únicamente esos cambios. Los demás datos siguen inmutables. Repetir una respuesta antigua no vuelve a desbloquear una corrección enviada.

Las capacidades existentes `providerActions` y `riskActions` se reutilizan. No se crea otra política de roles. El historial de conciliación y revisión es local; no se presenta como bitácora inmutable de producción.

## Transporte y fallos

- Los buzones se separan por tipo de mensaje, cuenta y solicitud/proveedor. Cada mensaje lleva versión de esquema, revisión creciente, fecha de corte y fingerprint de contenido. Los antiguos slots globales no se utilizan como fallback.
- La aceptación conserva su fingerprint original mientras las proyecciones de cartera pueden avanzar. Una cuenta distinta, un expediente distinto o un contrato distinto no pueden reutilizar una vista anterior.
- Las escrituras comprueban el estado conocido antes de guardar. Un fallo de almacenamiento conserva el estado anterior; los envíos combinados revierten solo su propia escritura de buzón, sin borrar un mensaje nuevo de otra pestaña.
- El usuario debe exportar y recibir de nuevo para ver cambios. Las páginas abiertas se invalidan al detectar cambio de cuenta. Los permisos y fingerprints de este demo no protegen contra alguien con acceso al mismo localStorage.

## Recorrido manual

Paciente: enviar caso → en backoffice actualizar lista y seleccionar cuenta/solicitud → importar y trabajar la oferta → exportar → recibir y aceptar/firmar demo → devolver decisión. Tras movimientos de Cartera: exportar calendario del expediente → recibir calendario en el portal.

Doctor: completar perfil → enviar a revisión → actualizar directorio en backoffice → vincular cuenta con proveedor exacto → importar perfil. Para cartera médica: conciliar vínculos legacy que hagan falta → exportar pacientes/dispersiones del proveedor → recibir en portal. Para correcciones: marcar campos/motivo → solicitar y exportar revisión → recibir, corregir y reenviar → importar, revisar diferencias y aprobar → exportar y recibir aprobación.

## Límites pendientes

No se implementaron autenticación/servidor multiusuario, sincronización entre dispositivos, originales documentales, firma electrónica, obligaciones fiscales definitivas, conciliación o desembolso bancario. El bloqueo de recibos fuera de orden sigue vigente; el replay histórico exige un ledger de eventos y reglas versionadas. Condonaciones, aplicación/devolución de excedentes y mora automática requieren decisiones de negocio y fiscales y no se simulan como efectivo cobrado. No se cambiaron tasas, reglas de IVA, cortes diarios ni reglas financieras aprobadas.

La verificación automatizada se documenta por separado. La revisión visual real en navegador continúa pendiente; pruebas de estructura, DOM simulado y funciones ejecutadas no equivalen a QA visual.

## Verificación de esta revisión

`node tests/run.cjs`: 41 archivos de regresión aprobados (37 existentes y 4 nuevos). La cobertura nueva incluye 21 escenarios de exportación de backoffice, cuatro matrices de cálculo base/frecuencia, calendario tras parcialidad/anticipo/prepago/prórroga/reverso/liquidación, privacidad por proveedor, identidad legacy, replay, permisos, contrato aceptado y rollback por cuota. Los controles montados del paciente y doctor se ejecutan con adaptadores de producción en DOM/VM simulado; también se prueba el fallo simultáneo de guardado y reversión del buzón. `git diff --check` sin errores. QA visual de navegador: no ejecutado.
