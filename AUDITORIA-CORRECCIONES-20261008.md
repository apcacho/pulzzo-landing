# Correcciones de auditoría · 8 de octubre de 2026

## Alcance y resultado

Esta revisión corrige defectos reproducibles en la demo local y añade pruebas contra las funciones reales. No constituye una certificación de producción ni una garantía de ausencia de errores. La demo guarda información en el navegador; no conecta pagos bancarios, firma electrónica real, mensajes externos ni un servidor de expedientes.

## Cálculos y cartera

- La captura monetaria conserva decimales; no convierte 1,234.56 en 123,456.
- Las tablas nuevas de saldos insolutos toman la dispersión como inicio del devengo. Las tablas contractuales ya guardadas conservan sus importes; no se reprecifican silenciosamente.
- El prepago conserva la cuota contractual, aumenta su componente de capital y reduce el plazo. Solo la última cuota residual puede ser menor.
- Un abono a mitad del periodo divide el interés por fechas: saldo anterior hasta el día previo y saldo reducido desde la fecha efectiva. Los abonos repetidos conservan esos segmentos y los conceptos ya pagados.
- Las cuotas futuras parcialmente anticipadas conservan su capital pendiente elegible para prepago.
- La espera de tres meses y la selección de cuotas se evalúan en la fecha efectiva del pago, no con el estado del día de captura.
- Se bloquean fechas futuras. El registro retroactivo requiere administrador y motivo; se conserva fecha efectiva, fecha de registro y actor.
- Se impide insertar un pago anterior a una operación posterior ya registrada. No hay un motor completo de reconstrucción cronológica; la interfaz explica el bloqueo en lugar de atribuirle un saldo histórico falso.
- Abonar todo el capital no elimina intereses o IVA ya devengados. La liquidación total es una operación distinta.
- La cotización de liquidación muestra importe y fecha aunque todavía no se haya capturado el dinero recibido; cambiar la fecha invalida la cotización.
- No se cambia el IVA sobre capital (no aplica), las fórmulas aprobadas de prórroga de 15/30 días ni el resguardo de comisiones históricas. La comisión de apertura con IVA sigue siendo prospectiva según las reglas anteriores.

## Operación y trazabilidad

- Los guardados de datos personales, referencias y datos técnicos respetan las capacidades del rol también al invocar directamente el manejador.
- Aprobar y rechazar son transiciones coherentes y repetibles sin duplicar eventos. La reapertura de una solicitud rechazada es una acción explícita de administrador con motivo e historial. Una oferta aceptada o un crédito contratado no vuelve a originación.
- La reapertura conserva la oferta anterior en historial y exige preparar una nueva oferta.
- Los estados de firma se comparan exactamente: “unsigned” o “no firmado” nunca habilitan pagos. Los manejadores de contrato vuelven a comprobar los mismos requisitos del formulario y no regresan uno firmado a preparación. Marcar firma manual exige un PDF seleccionado con contenido.
- Las ofertas vencen al terminar su fecha en Ciudad de México. Las aceptadas conservan su condición histórica. Una nueva versión archiva la decisión anterior y reinicia únicamente la decisión vigente.
- El panel inicia con el mes y año actuales en Ciudad de México. Las fechas finales del filtro son inclusivas. Un periodo sin resultados queda vacío; no sustituye los datos por registros de otro periodo ni inventa fechas.
- Se corrigen rutas de detalle, familias de rechazo, contenido y orden del historial, página anunciada y conservación de filtros.
- La actividad del panel se basa en registros reales, sin fabricar aprobaciones.
- La identidad de pacientes y prestadores se basa en identificadores estables. No se fusionan personas solo por nombre ni se asigna un paciente por coincidencia parcial del nombre del doctor. Los legados ambiguos quedan separados o pendientes de conciliación.
- Se normalizan claves de documentos bancarios/fiscales. Las revisiones manuales guardan metadatos y se presentan como revisiones, sin afirmar validaciones externas inexistentes.

## Portal del paciente, doctor y sitio público

- Una pestaña antigua no sobrescribe una solicitud o cuenta más reciente.
- Los fallos de almacenamiento no dejan aceptaciones, rechazos u otras decisiones aparentes sin guardar. El intercambio local revierte cambios si falla su persistencia.
- Registrar nuevamente al mismo doctor no destruye su expediente. Los datos fiscales/médicos tienen una ruta de captura alcanzable.
- Los indicadores de documentación completa requieren evidencia correspondiente. No se crean archivos vacíos para fingir un expediente completo.
- Las correcciones bancarias reflejan los documentos reales; no se genera una corrección inventada sobre una aprobación válida.
- Los nombres de archivos se escapan antes de incluirse en HTML. La fotografía del doctor muestra un límite de 5 MiB y conserva la anterior ante tamaño/tipo no admitido, errores de lectura, cuota o cambios de cuenta; las lecturas antiguas no pisan una foto nueva.
- Referidos y acciones públicas explican cuando son demostraciones locales o integraciones pendientes; no confirman envíos externos inexistentes. Los enlaces de pie de página llevan a destinos reales o explican su indisponibilidad.

## Accesibilidad

- Las opciones de ingreso admiten teclado y semántica de radio.
- Los diálogos del backoffice y paciente reciben foco, contienen Tab, admiten Escape y restauran el foco al cerrar. Las etiquetas y botones de cierre son identificables.
- Los filtros móviles aíslan el fondo y recuperan el foco que salga del diálogo.
- Guardar o cambiar una sección de Configuración devuelve el foco a un destino útil.
- Avisos y cotizaciones usan regiones de anuncio accesible. El texto emergente de Buró deja de ser blanco sobre blanco y tiene acceso por teclado y nombre accesible.

## Verificación y límites

Se ejecutan pruebas de funciones reales en Node/VM, contratos de estructura, sintaxis, persistencia, reversas, conservación de capital y reparto de recibos. Hay una revisión independiente con matrices adicionales de fechas, cuotas, abonos y fallos de almacenamiento.

No se ha ejecutado una certificación visual con navegador real, lectores de pantalla, teclado móvil, zoom o todas las anchuras. Las pruebas de DOM simulado no se presentan como evidencia visual. Tampoco se han realizado pagos, contactos externos, firma legal ni cambios bancarios reales.

El calendario del paciente sigue identificado como ilustrativo y las listas de pacientes/pagos del doctor como ejemplos fijos; no están sincronizados con la cartera contractual. La captura inicial del doctor está resuelta; el desbloqueo de campos enviados para correcciones necesita una definición de permisos y revisión.

Siguen requiriendo integración o decisiones separadas: conciliación histórica completa, mora automática y su tasa, metodología fiscal del artículo 18-A, migración fiscal histórica autorizada, devolución/reasignación de sobrantes, sincronización de servidor y controles de seguridad de producción. Los saldos a favor por interés ya pagado se conservan y deben revisarse; no se devuelven ni reasignan automáticamente.

No se modificó el texto legal A55. No se hizo push, merge ni despliegue público como parte de esta corrección.

### Resultado de la batería local

- `node tests/run.cjs`: 37 suites aprobadas sobre esta versión.
- Nueva matriz financiera: 124 comprobaciones contra funciones de producción.
- Nueva matriz operativa: 19 casos, incluidos rollback por cuota y rechazo de pestaña obsoleta.
- Nueva matriz de fechas/ofertas/contratos: 10 grupos.
- Pruebas de accesibilidad estructural y de manejadores, y de integridad del paciente/doctor: aprobadas.
- `git diff --check`: sin incidencias.

Las instantáneas de scripts de las pruebas de color/presentación se actualizaron únicamente para la revisión de comportamiento aprobada; no se eliminaron las comprobaciones funcionales ni se cambiaron resultados financieros esperados para ocultar fallos. La conservación de estilos admite exclusivamente la corrección auditada del tooltip de Buró y las adiciones de presentación ya autorizadas.

## Integración demo posterior a esta auditoría

Se agrega una revisión candidata de calendario real de Cartera en paciente, datos propios por proveedor en doctor, IDs estables y conciliación legacy explícita. El perfil médico admite corrección únicamente de campos observados, con reenvío y revisión posterior. Las reglas y límites se describen en `REGLAS-INTEGRACION-PORTALES-DEMO.md`.

Esta actualización no incorpora producción, mora automática, condonaciones, devoluciones bancarias ni replay de recibos retroactivos. La revisión visual sigue sin ejecutarse. Los resultados de la suite final deben corresponder al commit candidato y no deben confundirse con la cobertura previa de 37 suites.

Resultado posterior: suite integral de 41 archivos aprobada, conservando los 37 originales; `git diff --check` limpio. Los snapshots de comportamiento se actualizan por los cambios funcionales intencionales de integración, mientras los contratos de CSS/activos y las regresiones financieras siguen activos. Sin publicación, ZIP ni QA visual en esta fase.
