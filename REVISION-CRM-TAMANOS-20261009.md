# CRM: tamaños de columnas y escala visual

## Evidencia y alcance

Se pudieron abrir y observar las dos capturas originales de Contactos/Kanban y Tareas. En Kanban, las columnas vacías normales terminan aproximadamente en y=725 y «Enviado a revisión» en y=768 debido al texto adicional. En Tareas, «Vencidas» y «Hoy» terminan aproximadamente en y=547, mientras que «Próximas», con una tarea, termina en y=574. Las coordenadas corresponden a cada captura original y no constituyen una comparación de escala entre capturas.

La causa comprobada en el código es `align-items:start` en ambos tableros. También existían diferencias de padding, radio, interlineado y espacio vacío entre sus componentes.

## Ajustes

- Las columnas hermanas de cada fila se estiran a la altura del contenido más alto. No se fijan alturas ni se oculta contenido para igualarlas.
- Ambos tableros comparten separación de 16 px, radio de columna de 16 px, padding de tarjetas de 14 px y tipografía de título del Backoffice.
- Se compacta el encabezado y el estado vacío de Tareas para eliminar el exceso de espacio de su estilo heredado.
- Se conservan los anchos de Kanban con desplazamiento horizontal, las tres columnas de Tareas, la fila de tareas sin fecha, las columnas apiladas en móvil y los controles táctiles de 44 px.
- Se conserva toda la lógica comercial. El adaptador CSS integrado se regenera desde sus fuentes canónicas.

## Validación y límites

- 72 suites de regresión y 29 pruebas de correo.
- Contrato nuevo de estilos para igualdad de altura natural, escala compartida, texto largo y reglas móviles.
- Compilación local y validación del Worker y de 69 archivos públicos permitidos.
- Revisión independiente del CSS y de su cascada sin hallazgos bloqueantes.

Estas comprobaciones son de código y funcionalidad. No se ejecutó una nueva captura de navegador: la ejecución de Chromium estaba bloqueada por el entorno y no se intentó eludir ese bloqueo. La geometría final renderizada en escritorio y móvil permanece pendiente de validación visual. No se publicaron cambios en Sites ni Git remoto.
