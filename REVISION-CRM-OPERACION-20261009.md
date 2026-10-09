# CRM · seguimiento y operación · 9 de octubre de 2026

## Alcance

Mejoras sobre la sección CRM del backoffice existente. Se conservan la lista y el Kanban comercial, los gráficos derivados de datos locales, la tipografía, los colores y los controles compartidos del backoffice. Solo datos ficticios y almacenamiento de demostración. Los selectores de rol no equivalen a autenticación ni a permisos de producción.

No se enviaron correos, mensajes ni llamadas; no se publicó esta revisión ni se cambiaron credenciales, accesos o almacenamiento de producción.

## Criterios funcionales

### Estado operativo y referencias

- Un prospecto sin expediente no está pendiente de importación.
- El expediente en captura y el envío real del titular son estados distintos. Solo un envío válido puede quedar pendiente de recepción en backoffice.
- El estado operativo es informativo y no sustituye una decisión de crédito.
- Las referencias se eligen entre registros existentes verificables de la ficha accesible. No se aceptan asociaciones a otra persona mediante nombres, correos parecidos o identificadores escritos libremente.
- El acceso al expediente desde CRM conserva el ámbito del usuario demo. No concede navegación financiera de administrador a un KAM.

### Contactos que requieren atención

- «Sin próxima tarea» se refiere a ausencia de tareas abiertas de la ficha.
- «Sin contacto registrado» se refiere a ausencia de actividades manuales de llamada, WhatsApp, correo o reunión. Son intentos registrados; el resultado indica si hubo respuesta. Abrir una aplicación o copiar un teléfono no registra un contacto.
- La inactividad se calcula con la fecha real de contacto registrada, no con cambios administrativos, notas ni cargas de archivos. El umbral lo elige el usuario. No existe un plazo comercial predeterminado ni recordatorios automáticos.
- Los filtros y totales respetan la cartera accesible y el contexto cliente/proveedor; los cortes de calendario se interpretan en Ciudad de México.

### Historial administrativo

- Se presenta separado del historial de conversaciones manuales.
- Se reutilizan los eventos de auditoría existentes; consultar el historial no crea eventos adicionales.
- Solo se muestran campos permitidos. Los cambios de etapa y responsable pueden mostrar origen/destino y motivo. Cuando un evento antiguo solo contiene nombres de campos modificados, no se reconstruyen ni inventan valores anteriores.
- No se vuelcan objetos completos, credenciales, tokens de invitación o cargas de expediente.

### Identidad existente

- La revisión corresponde exclusivamente al administrador demo.
- Continuar una ficha existente inequívoca no demuestra identidad, no fusiona cuentas y no cambia su origen ni su responsable.
- Un correo o teléfono compartido, un cruce paciente/proveedor o varias cuentas no se resuelve automáticamente. Permanece pendiente de una definición de negocio y revisión autorizada.
- No se permite crear un duplicado para sortear un bloqueo; el KAM no recibe datos de otra cartera.

### Archivo y recuperación

- «No interesado» sigue siendo una etapa comercial; no archiva automáticamente.
- El archivo es manual, administrativo, con motivo y reversible para un prospecto elegible. Nunca cancela una solicitud, crédito o alta.
- Tareas abiertas, expedientes activos/enviados y vínculos operativos impiden el archivo. Debe atenderse primero el flujo correspondiente; no se agrega cancelación automática.
- Tanto archivar como recuperar requieren Administración demo; un KAM no obtiene acceso al archivo.
- La recuperación conserva el identificador y la atribución originales, exige motivo y vuelve a comprobar elegibilidad y conflictos.
- El abandono o cancelación de un registro en curso queda pendiente de reglas explícitas de negocio.

## Verificación

Comprobaciones específicas ejecutadas sobre los módulos reales de la demo:

- 13 casos de estado operativo y vínculos exactos: borrador, invitación, confirmación, envío, importación, identidad, referencias ambiguas y proyecciones sin información financiera privada.
- 24 casos de identidad/archivo/recuperación: roles, motivos, colisiones, expedientes enviados reales, protección contra elusión mediante transacciones genéricas, revisiones obsoletas y errores de almacenamiento.
- 17 casos de integración entre Store, Assisted y Office, incluidos flujos completos paciente/proveedor con verificación del titular, envío e importación y conservación de atribución.

- 13 grupos de interfaz montada: filtros y conteos, fechas CDMX, selección exacta de referencias, historial paginado y redactado, permisos, navegación/Back, consultas interrumpidas, invalidación por cambios externos, rutas de bloqueo de archivo e identidad.

El renderizado visual en navegador no se considera verificado: la ejecución de navegador estuvo bloqueada anteriormente y esta revisión no intentó eludir esa restricción. Las pruebas de manejadores montados y sus objetos DOM deterministas no verifican geometría, píxeles ni comportamiento de tecnología de asistencia.

### Resultado agregado final

- `npm test`: 62 suites de regresión y 29 pruebas de correo aprobadas; sin fallos. Las cuatro suites nuevas contienen 67 casos/grupos operativos.
- `npm run build`: aprobado, únicamente salida local.
- `node scripts/validate-mail-build.mjs`: aprobado; contrato Worker ESM, cierre seguro sin configuración, migraciones y 63 archivos públicos permitidos.
- `git diff --check`: aprobado.
- Revisión independiente de identidad, vínculos, archivo, privacidad, carreras asíncronas y navegación: sin hallazgos concretos pendientes al cierre.
- No ejecutado: renderizado visual en navegador, publicación, autenticación real, llamadas, WhatsApp, envío de correo y callbacks de producción.

Las pruebas de correo se ejecutan con dobles locales de transporte; no implican que Gmail esté conectado. Este paquete es código fuente de la demo para revisión, no una publicación ni autorización para desplegar.
