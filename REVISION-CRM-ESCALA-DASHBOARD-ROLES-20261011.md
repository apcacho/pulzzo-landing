# CRM: escala, dashboard y roles de consulta

Base preservada: `1b7e9b42aad1b96ea755bd55740a7ede471e1da9`.

## Alcance solicitado

- Resultados de selección de contacto alineados a la izquierda, con la acción a la derecha.
- Selector de tarea por lotes de 20, paginación de contactos y carga por columna de Kanban. Los tamaños son decisiones de presentación, no reglas comerciales.
- Dashboard compacto: cuatro indicadores mensuales, separación entre resultados del mes y estado actual, y vista Gráfico/Tabla excluyente.
- Períodos y días del dashboard en `America/Mexico_City`.
- KAM con acceso a su cartera asignada; líder con consulta de todas las carteras; administrador conserva sus capacidades actuales. El líder no recibe permisos de edición, reasignación ni aprobación financiera.

## Seguridad y límites de la demo

Las sesiones, usuarios, datos y archivos siguen siendo una simulación local del navegador. No existe autenticación multiusuario de producción para el CRM comercial. El servidor de correo es un módulo independiente; esta revisión no activa Gmail ni crea credenciales.

Se verificó el alcance del cliente CRM en contactos, búsquedas, tareas, historial, expedientes vinculados, indicadores y archivos. Las escrituras se comprueban en la API local además de en la interfaz. Los roles de Operaciones, Riesgo, Gestión de prestadores y Consulta conservan su separación. Ninguna supervisión comercial concede facultades de firma, autorización personal del titular, aprobación de crédito, desembolso ni publicación de perfiles.

El CRM montado utiliza clientes con comprobación de rol, asignación y sesión vigentes. Los adaptadores locales sin alcance usados por las integraciones anteriores de titular/backoffice y el callback de transacción de confianza del titular mantienen compatibilidad; no son una frontera de autorización de producción. El almacenamiento sigue siendo editable desde el navegador y sus comprobaciones de revisión no constituyen una operación compare-and-swap entre pestañas.

Para producción se requieren sesiones verificadas por servidor, consultas paginadas y autorización por objeto/capacidad en cada lectura y escritura, incluidos archivos y agregados. Ocultar controles o filtrar datos ya descargados no proporciona esa seguridad.

## Interpretación de los indicadores

Las altas, inicios de expediente y envíos se cuentan por contacto único mediante registros enlazados. La conversión compara prospectos creados en el mes con los de esa misma cohorte enviados por el titular durante el mismo mes; no es una tasa de aprobación. Los cambios manuales de etapa no cuentan como envíos.

Las actividades registradas pueden incluir notas; los intentos de contacto comercial se identifican por sus canales y no implican una respuesta. Origen utiliza las altas del período y conserva la atribución original. Etapas, responsable y tareas reflejan el estado actual de contactos activos y accesibles, no un cierre histórico: archivar o reasignar puede modificar la cartera incluida en una consulta de meses anteriores.

## Verificación

La base original aprobó 72 suites de regresión y 29 pruebas del módulo de correo. La revisión final aprobó:

- `npm test`: 77 suites de regresión y 29 pruebas de correo, sin fallos.
- `npm run build`, `node scripts/validate-mail-build.mjs`, consistencia del adaptador CSS y `git diff --check`: aprobados. El build contiene 69 archivos públicos permitidos y mantiene código de servidor y fuentes fuera de la carpeta pública.
- Nuevas verificaciones: 6 grupos de escala con 10,000 contactos ficticios, 5 grupos de interfaz del líder, 15 grupos de dashboard compacto y horarios, 13 grupos de API/roles y pruebas de archivos con revocación asíncrona. La navegación incluye 24 grupos de regresión.
- Revisión independiente de alcance, APIs, sesiones, acceso a archivos, enlaces de invitación, publicación, historial y fixtures. Una sesión CRM con identidad ausente o inválida vuelve al login; no cae en el dashboard financiero.

La prueba de escala mide límites deterministas de nodos y de lecturas por render, no tiempos de respuesta ni rendimiento visual: 25/50/100 filas por página, 20 tarjetas iniciales por columna, 20 resultados iniciales en el selector y como máximo 21 opciones ocultas para conservar el ID seleccionado. Cargar más conserva la selección; cambiar la consulta la borra. Los conteos representan todas las coincidencias autorizadas.

Se inspeccionaron los píxeles de las tres capturas recibidas el 11 de octubre. La tabla señalada era la alternativa de datos del gráfico desplegada, no un segundo conjunto de contactos. La revisión visual de la versión implementada en un navegador permanece pendiente: este entorno tiene restricciones de lanzamiento previamente verificadas y no se intentan eludir.

No se publica esta revisión en Site ni GitHub como parte de la preparación local.
