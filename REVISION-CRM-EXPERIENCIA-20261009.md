# CRM · revisión integral de experiencia

## Alcance local

Esta versión desarrolla los siete cambios aprobados sobre el diseño existente de PULZZO. Conserva el CRM nativo en `backoffice.html#crm`, sin iframe de aplicación ni una segunda navegación. No publica, no configura credenciales y no activa Gmail. Usa únicamente datos y archivos ficticios.

## Cambios

1. **Filtros legibles.** Búsqueda, etapa y responsable ocupan una barra de ancho completo fuera del directorio estrecho. Las columnas pasan a una fila por control en móvil. El indicador de selección conserva su área de 44 px y los campos usan los tokens de Backoffice.
2. **Acciones de contacto.** WhatsApp, llamada, copia y registro comparten alineación y altura mínima; la explicación queda en una fila independiente con 12 px de separación. Abrir una aplicación o copiar sigue sin registrar una interacción.
3. **Registro del titular.** La entrada comparte el fondo navy, tarjeta blanca y acentos aqua/coral del onboarding existente. Encabezados de acceso centrados; títulos internos de Backoffice a la izquierda. Datos, documentos y confirmaciones mantienen sus responsabilidades y bloqueos.
4. **Contacto manual.** Secciones de interacción, siguiente paso y evidencia. Los vínculos técnicos opcionales están en un desplegable separado. Validación y guardado permanecen en el mismo formulario canónico.
5. **Lista y Kanban.** Las dos presentaciones comparten filtros y contactos. Tarjetas arrastrables y botón nativo “Mover a…” para teclado/móvil. Proveedores incluyen reunión agendada. Las columnas se redistribuyen sin desplazar horizontalmente toda la página.
6. **Dashboard real.** Barras de etapa, origen, actividad y pendientes; conversión con denominador explícito y tabla por responsable. Todos los gráficos incluyen cantidades y alternativa tabular. Un período sin datos muestra un estado vacío, sin valores inventados.
7. **Coherencia y accesibilidad.** Tokens del Backoffice, controles compactos de escritorio, objetivos de 44 px en móvil, nombres largos, foco después de selección/movimiento y cierre de formularios al navegar. Respuestas asíncronas antiguas de copia/evidencia no reabren vistas descartadas.

## Reglas de negocio

- `moveCommercialStage` valida rol, propiedad, revisión de almacenamiento y etapa original. Movimiento, auditoría y tarea fechada se guardan juntos o ninguno se guarda.
- “Sin respuesta” y “No interesado” conservan el motivo obligatorio. Un movimiento repetido sin cambios no añade historial ni tareas.
- “Enviado a revisión” es una columna del sistema. No admite entrada por arrastre ni cambio comercial; solo la confirma el envío válido del titular. Un envío confirmado no se deshace desde Kanban.
- Mover a solicitud/registro en captura no crea un expediente ni infla los indicadores. Inicios y envíos requieren eventos auténticos del expediente correspondiente.
- No se aprueba un crédito ni un proveedor desde el CRM. El KAM no puede realizar consentimiento, OTP, aceptación de oferta o firma del titular.
- Expediente enviado, versiones documentales, correcciones observadas, atribución y motores financieros conservan su flujo existente.

## Definiciones del Dashboard

- **Mes/año:** calendario UTC; por defecto el mes actual. Los eventos futuros se excluyen.
- **Altas:** contactos únicos con creación real durante el período.
- **Inicios/envíos:** contactos únicos con expediente vinculado y eventos válidos durante el período.
- **Actividades:** registros manuales por fecha real de contacto; los cambios de etapa no cuentan. La actividad por usuario usa el autor original.
- **Origen:** distribución del origen original de las altas del mes.
- **Conversión:** altas del mes enviadas por el titular en ese mismo mes / altas del mes. No es aprobación. Si no hay altas, no se muestra un porcentaje sin base.
- **Etapas y pendientes:** estado actual de la cartera accesible, no un corte histórico. La tabla por responsable refleja la asignación actual.
- Se excluyen contactos archivados y ajenos al rol. Un filtro no amplía permisos.

## Validación y límites

Se inspeccionaron los píxeles de las ocho capturas proporcionadas para concretar los defectos originales. Las pruebas automatizadas de esta versión ejecutan los manejadores y stores reales, además de contratos de estructura y CSS. Esto no equivale a renderizar las pantallas nuevas.

La nueva visualización en navegador sigue pendiente: este entorno tiene una restricción ya confirmada al iniciar Chromium y al abrir la vista previa local. No se repitió ni se eludió esa restricción. Se incluyen suites opcionales de navegador, fuera de `npm test`, para un entorno donde Chromium esté permitido.

### Resultados ejecutados

- 58 suites de regresión y 29 pruebas de correo: aprobadas.
- 15 grupos de integración nativa Backoffice/CRM: aprobados dentro del agregado.
- 29 casos nuevos de movimientos comerciales y 28 de analítica: aprobados.
- Prueba de registro de pacientes/proveedores con manejadores reales y 9 grupos independientes de carreras asíncronas/foco: aprobados.
- Build local y validación del Worker, migraciones y 63 archivos públicos permitidos: aprobados.
- Suites opcionales de navegador: preparadas, no ejecutadas.

### Lista de comprobación visual pendiente

En 320, 390, 768, 1280 y 1440 px, con nombres españoles largos y ampliación de texto:

- Ninguna etiqueta seleccionada queda debajo del indicador o recortada; “Todos los accesibles” y cada etapa son legibles.
- Acciones de una fila comparten altura; el texto secundario queda debajo, sin tocar los botones.
- Contacto manual cabe en el viewport con desplazamiento del diálogo; cerrar, Escape y Atrás funcionan sin enviar.
- Kanban no introduce scroll horizontal de página; abrir una tarjeta revela la ficha; mover con teclado conserva el foco.
- Envíos de sistema no aceptan arrastre; errores de revisión desactualizada no alteran tarjetas ni métricas.
- Gráficos y tablas muestran las mismas cantidades. Vacío, cero por ciento y ausencia de denominador son estados diferentes.
- Registro del titular mantiene su encabezado centrado y controles utilizables, sin traslapes.

Los stacks Plus Jakarta Sans/Inter se conservan. El portal del titular no añade una dependencia remota de fuentes ni cambia la política de seguridad; usa fallback si esas tipografías no están disponibles.
