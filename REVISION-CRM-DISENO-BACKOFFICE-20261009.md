# CRM: coherencia con el Backoffice existente

Fecha: 9 de octubre de 2026. Base conservada: `c181594cfdfc61f40e80a86c0b3159d55edbb009`.

## Corrección

El CRM se monta como contenido nativo dentro del Backoffice, sin iframe, segunda cabecera ni desplazamiento vertical independiente. Conserva un ámbito de estilos para evitar colisiones con los identificadores y clases de las otras secciones, pero hereda los mismos valores de diseño del Backoffice.

La comparación se hizo contra el código existente, no contra una propuesta visual nueva:

- `backoffice.html`: paleta navy `#07142F`, aqua `#20C7D4`, coral `#FF8A5B`, fondo `#F8FAFC`, bordes `#D7E1EE` / `#E8EEF6`; fuentes Inter y Plus Jakarta Sans con las mismas alternativas de sistema.
- `assets/css/backoffice-refinement.css`: escalas y pesos compartidos de títulos, texto, campos, botones y cifras; 36 px para acciones y 38 px para campos en escritorio, 44 px para controles táctiles; flecha nativa de selección con espacio derecho de 44 px.
- Directorio de proveedores: paneles con radio de 20 px y sombra suave, separación y márgenes de filtros y fichas.
- Dashboard: tarjetas KPI de 22 px, cifras de 30 px y peso 560, separación de 14 px.
- Revisión documental: encabezado y contenido del diálogo con márgenes de 22 × 24 px; cierre accesible, cancelación y navegación preservados.

Las acciones de clientes son aqua y las de proveedores coral. Las selecciones tienen fondo claro; el verde no indica una aprobación comercial por el simple hecho de registrar una actividad. Etiquetas, campos, avisos y datos secundarios respetan los mismos roles tipográficos. Los nombres largos pueden partirse sin ocultar la acción Editar.

## Integridad

Los motores financieros, almacenamiento CRM, registro asistido, atribución, correcciones y evidencias no cambiaron. El programa inline original de Backoffice mantiene exactamente su SHA-256. La nueva integración conserva las restricciones de roles simulados, selección de KAM, historial atrás/adelante, cambio de sección, cierre de sesión y descarte de operaciones asíncronas de vistas retiradas.

## Verificación

- 54 suites de regresión, incluidas las 53 previas y el nuevo contrato de diseño.
- 29 pruebas del módulo de correo.
- Pruebas de DOM/manejadores para montaje nativo, navegación, cierre y reinstalación de la vista.
- CSS procesado sin advertencias; revisión independiente de especificidad, controles táctiles, espacio de flechas y nombres largos.
- Generación local y validación del Worker, migraciones y 62 archivos estáticos permitidos.

Estos resultados no equivalen a una validación visual. La captura adjunta no pudo recuperarse por un rechazo de acceso. El navegador disponible rechazó la URL local de prueba con `ERR_BLOCKED_BY_CLIENT`; no se usó otro acceso para eludirlo ni la versión publicada para pruebas. Quedan sin verificar los píxeles, geometría real en escritorio/móvil y accesibilidad del navegador.

No se publicaron cambios, no se activó Gmail, no se crearon credenciales y no se enviaron mensajes reales. El sitio publicado anterior continúa vigente hasta una publicación coordinada por separado.
