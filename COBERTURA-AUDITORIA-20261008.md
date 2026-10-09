# Cobertura de los hallazgos originales

Estados: **corregido** = cambio de código con pruebas de funciones/estructura; **acotado** = se evita la afirmación o acción incorrecta, pero falta una integración; **pendiente** = requiere definición o implementación adicional. Ningún estado implica certificación visual en navegador.

## Cálculos

| Hallazgo | Estado | Resultado |
|---|---|---|
| F1. Insolutos devengaba desde firma y el cálculo de cuota desde dispersión | Corregido | Base canónica de dispersión en nuevas tablas; instantáneas contractuales existentes protegidas |
| F2. Prepago reducía cuotas en vez de plazo | Corregido | Cuota fija, nuevo reparto capital/interés y plazo reducido; residual final |
| F3. Fecha retroactiva evitaba la espera y usaba vencimientos actuales | Corregido | Elegibilidad y reparto por fecha efectiva; administrador/motivo; futuras bloqueadas; orden cronológico protegido |
| F4. Capital futuro parcialmente anticipado quedaba fuera del prepago | Corregido | Capital pendiente elegible independientemente del estado de presentación |
| F5. Interés de todo el periodo se recalculaba como si el prepago existiera desde su inicio | Corregido | Segmentos por fecha efectiva, incluidos varios abonos en el mismo periodo |
| F6. Captura decimal del paciente multiplicaba por 100 | Corregido | Análisis monetario conserva signo/decimales y rechaza formatos inválidos |
| F7. Payout omitido/cero podía sustituirse por toda la dispersión | Corregido | Cero preservado y falta de importe señalada para conciliación; no se inventa una asignación |
| F8. Pendiente a doctor usaba el principal aprobado completo | Corregido | Agrega dispersiones realmente pendientes; identifica importes sin resolver |
| F9. “unsigned/no firmado” se confundía con firmado y las acciones directas omitían requisitos | Corregido | Estados explícitos; no preparación/reenvío de firmados; oferta aceptada, referencias y mínimos requeridos; firma manual exige PDF con contenido |

## Backoffice operativo

| Hallazgo | Estado | Resultado |
|---|---|---|
| O1. Solo consulta guardaba datos personales y referencias | Corregido | Capacidades revalidadas en manejadores y editores retenidos |
| O2. Aprobar un rechazado dejaba estados contradictorios y eventos repetidos | Corregido | Transiciones idempotentes; reapertura explícita de administrador, motivo e historial; no reoriginación de contratado/aceptado |
| O3. Agrupación de personas por nombre y claves cambiantes | Corregido / acotado | ID estable cuando existe; legado sin identidad compartida queda separado para conciliación, sin autofusión |
| O4. Asociación de paciente a doctor por substring y sin prestador secundario | Corregido / acotado | Identificadores por procedimiento; selección explícita; nombres legados ambiguos sin asignación inferida |
| O5. Payload de perfil exponía datos pese a capacidad denegada | Corregido | Una misma capacidad para las dos superficies |
| O6. Links de detalle del Dashboard volvían al listado | Corregido | Ruta exacta de solicitud/detalle |
| O7. Totales omitían familias de rechazo y etapas en proceso | Corregido | Predicados coherentes con estados canónicos |
| O8. Actividad reciente inventaba aprobaciones | Corregido | Eventos reales; sin sustitución de un prestador rechazado por “aprobado” |
| O9. Historial no mostraba action/comment o ignoraba timeline | Corregido | Mapeo y fallback correctos |
| O10. Filtros de solicitudes desaparecían al volver | Corregido | Filtros y página conservados |
| O11. “Página 3 de 3” al estar en página 1 | Corregido | Página actual y total independientes |
| O12. bank_cover/csf no correspondían con aprobación fiscal | Corregido | Identidad normalizada del documento |
| O13. Botones afirmaban validar contacto/datos pero solo agregaban eventos | Acotado | Se presentan como revisión manual y guardan actor/fecha; no simulan una validación externa |
| O14. Historial consolidado truncaba antes de ordenar globalmente | Corregido | Orden cronológico común antes del límite |
| O15. Nombres/etiquetas internas de roles vacíos o truncados | Corregido | Etiquetas no vacías coherentes para atribución |
| O16. Periodos fijos de junio, fechas inventadas y fallback a todos los datos | Corregido | Mes/año actual CDMX; filtros reales e inclusivos; sin fabricar fechas ni resultados |
| O17. Distribución por doctor inventaba mínimos y contaba procedimientos ajenos | Corregido | Solo enlaces exactos y cantidades reales |

## Paciente, doctor y sitio público

| Hallazgo | Estado | Resultado |
|---|---|---|
| P1. Pestaña vieja sobrescribía una solicitud nueva | Corregido | Versión canónica de solicitud y cuenta verificadas antes de guardar |
| P2. Re-registro de doctor borraba expediente | Corregido | Reanuda/explica cuenta existente; no reemplaza sus datos |
| P3. Nuevo doctor no tenía captura fiscal/médica alcanzable | Corregido | Rutas e inputs iniciales y gate de ingreso a la demo |
| P4. Falla de aceptación dejaba aceptado en memoria | Corregido | Rollback y reintento; extendido a rechazo/firma/pago y bridge |
| P5. Bridge copiaba flags sin referencias/identidad y creaba PDF vacío | Corregido | Evidencia consistente; ningún archivo fabricado por grupo vacío |
| P6. Oferta revisada conservaba rechazo viejo y no podía aceptarse | Corregido | Versiones verificadas; historial de rechazo anterior y decisión vigente limpia |
| P7. Banco aprobado mostraba corrección inventada | Corregido | Aviso derivado del estado real |
| P8. Vigencia solo informativa, sin bloqueo | Corregido | Fin del día CDMX; guardado/envío/aceptación protegidos; contratos aceptados preservados |
| P9. Nombres de archivo HTML sin escapar | Corregido | Escape al renderizar; la auditoría no afirma haber ejecutado un ataque en navegador |
| P10. Referido/búsqueda confirmaba recepción/guardado inexistente | Acotado | Mensaje honesto de demo; sin afirmar envío o persistencia externa |
| P11. Links de pie de página no hacían la acción indicada | Corregido / acotado | Alta/portal apuntan al flujo correcto; redes sin integración declaran indisponibilidad |
| P12. Calendario paciente sin datos de cartera contractual | Pendiente de integración | Calendario explícitamente ilustrativo; no se presenta como saldo/servicio contractual |
| P13. Pacientes/pagos del doctor eran arrays fijos sin aviso | Acotado | Listas rotuladas como ejemplos; sincronización y conciliación reales pendientes |
| P14. Documentos y firma del portal guardan metadatos, no originales verificables | Pendiente de integración | No se afirma almacenamiento de documentos originales ni firma de producción |
| P15. Edición de campos enviados del doctor/correcciones | Pendiente de definición | La captura inicial está resuelta; falta definir quién desbloquea y revisa correcciones después del envío |
| P16. Fotografía sin límite ni manejo de lectura/cuota | Corregido | Límite visible de 5 MiB, tipo admitido, error/abort/cuota, reintento, foto anterior conservada y protección frente a lectores/cuentas obsoletos |
| P18. Validación sustantiva de todos los documentos metadata-only | Pendiente de producción | No se certifica tratamiento seguro de originales, almacenamiento remoto o retención de datos |
| P17. Geolocalización real coexistía con demo | Pendiente de definición | Deben definirse necesidad, consentimiento y retención antes de datos reales; no se cambió la política legal |

## Accesibilidad

| Hallazgo | Estado | Resultado |
|---|---|---|
| U1. Ingreso del paciente imposible de elegir con teclado | Corregido | Radio semántico y navegación por teclado |
| U2. Diálogos genéricos del backoffice sin foco/trampa/Escape | Corregido | Semántica, etiquetas, foco inicial, aislamiento, Tab/Escape y retorno |
| U3. Diálogos de documentos/contrato del paciente sin teclado | Corregido | Foco, trampa, Escape y retorno |
| U4. Calcular liquidación no mostraba resultado sin monto recibido | Corregido | Importe y fecha independientes del campo del dinero recibido |
| U5. Toasts/errores sin anuncio y campos sin asociación de error | Corregido | Regiones vivas, estado inválido y descripción de error |
| U6. Filtro móvil no aislaba fondo y perdía foco fuera de la sección | Corregido | Inert del fondo y manejador documental |
| U7. Configuración perdía foco al renderizar | Corregido | Regresa a sección seleccionada o mensaje de éxito |
| U8. Buró blanco sobre blanco y solo hover | Corregido | Contraste, foco de teclado y texto accesible |
| U9. Modal de solicitud del doctor sin manejo de foco | Corregido | Foco inicial, Tab/Escape y retorno |
| U11. Vista previa documental del doctor sin foco/teclado | Corregido | Semántica, foco inicial, Tab, Escape/cierre/fondo y retorno |
| U10. Navegador real, pantallas pequeñas, zoom, lectores y PDF iframe | No ejecutado | Las pruebas estructurales/VM no sustituyen QA visual o de tecnología asistiva |

## Propuestas no confundidas con defectos resueltos

- Advertir antes de descartar un formulario parcialmente lleno: decisión de producto pendiente.
- Sustituir IDs escritos por un selector de créditos en Configuración: mejora pendiente.
- Reglas de mora, artículo 18-A, migración fiscal histórica, sobrantes/devoluciones y reconciliación cronológica completa: fuera de esta corrección y sin simulación de aprobación legal.
- Seguridad/autenticación de producción, permisos reales de servidor y disponibilidad multiusuario: no implementadas por una demo local.

El código y la matriz deben leerse junto con las pruebas y con `AUDITORIA-CORRECCIONES-20261008.md`. Se preserva el texto legal A55.

## Actualización: integración de portales demo

La sustitución de calendarios ilustrativos y listas médicas fijas ya está implementada en la revisión local candidata mediante proyecciones con alcance por cuenta/expediente. También está implementado el circuito de corrección de campos de incorporación médica observados por backoffice. La integración usa exportación/recepción explícita en el mismo navegador; no resuelve autenticación ni backend de producción.

Quedan pendientes la prueba visual real de escritorio/móvil, infraestructura multiusuario, fuentes bancarias y documentales reales y las decisiones de política enumeradas en `REGLAS-INTEGRACION-PORTALES-DEMO.md`. Las pruebas ejecutables nuevas cubren identidades, privacidad, paridad de cartera, estados y fallos; no sustituyen esas verificaciones pendientes.

Resultado final local de esta candidata: 41 archivos de regresión aprobados, con pruebas montadas de recepción/envío, reintentos por cuota, replay y bloqueo de correcciones ya en buzón. Las 21 pruebas del nuevo archivo de proyecciones cubren paridad con Cartera, aislamiento por proveedor, conciliación explícita e historial de actor. No se ejecutó un navegador real.
