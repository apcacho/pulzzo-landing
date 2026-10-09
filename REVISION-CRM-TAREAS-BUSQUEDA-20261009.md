# Nueva tarea: selección buscable de contacto

Base preservada: `a8bf8c8d3b3ed739fcf689c2845fabbaba8748cc`.

## Comportamiento

- Búsqueda por nombre, correo y teléfono dentro de los contactos activos de la cartera y tipo actuales. Ignora mayúsculas, acentos, espacios repetidos y formato telefónico.
- RFC y CURP se consultan únicamente desde el registro de Backoffice vinculado de forma inequívoca al contacto accesible. No se cruzan identidades por nombre, correo o teléfono, ni se muestran identificadores fiscales en la lista.
- Selección nativa con etiqueta, ayuda y conteo accesibles; sin elegir automáticamente el primer resultado. Los nombres repetidos se distinguen con correo y teléfono.
- Cambiar o limpiar la búsqueda borra la selección anterior. Sin coincidencias hay un mensaje explícito. Guardar exige un ID exacto del conjunto autorizado y vuelve a comprobar disponibilidad, coincidencia y revisión.
- Reprogramar mantiene fijo el contacto de la tarea. Cambios externos conservan el borrador mientras exista acceso; una pérdida de acceso cierra el formulario.
- Estilos con los tokens del Backoffice, controles táctiles y campo adaptable. El CSS continúa siendo la fuente canónica y el adaptador síncrono se regenera con su verificación de coherencia.

## Límites

Las dos capturas adjuntas no pudieron descargarse: el flujo de materialización autorizado devolvió HTTP 403. No se inspeccionaron sus píxeles. El usuario identificó después el control mediante su texto exacto: «Cargar ejemplos ficticios», dentro del bloque de bienvenida. Esa aclaración permitió corregir el comportamiento sin inferir el contenido visual de las capturas.

Las pruebas de manejadores y estructura no constituyen validación visual. No se intentó eludir las restricciones del navegador ya constatadas. No se publicaron cambios, no se configuraron credenciales y no se hicieron comunicaciones externas.

## Validación ejecutada

- `npm test`: 66 suites de regresión y 29 pruebas del módulo de correo, todas aprobadas.
- Nuevas suites: 17 grupos de manejadores del selector, 14 de identidad/privacidad y 15 del bloque inicial/carga atómica, incluidas búsquedas por RFC/CURP, referencias ambiguas, reasignación y archivado, interrupciones, reapertura y envío obsoleto.
- `npm run build`, `node scripts/validate-mail-build.mjs`, comprobación de sintaxis y `git diff --check`: aprobados. 63 archivos públicos permitidos; sin código fuente ni secretos en la salida pública.
- Revisión independiente de alcance, IDs, limpieza de eventos, estilos y coherencia del adaptador. La búsqueda utiliza una proyección por lote transitoria; el envío vuelve a validar el contacto individual. En la prueba sintética de 250 contactos el filtrado montado tardó 11.6–17.2 ms (no es una medición visual ni una garantía de rendimiento en otros dispositivos).

## Bloque inicial y ejemplos ficticios

- El estado vacío es compacto, alineado a la izquierda y usa los controles compartidos del Backoffice: Crear prospecto y Cargar ejemplos ficticios. Cuando ya hay fichas accesibles, muestra Ver contactos en lugar de sugerir una carga innecesaria.
- La carga anterior retornaba solamente un aviso si encontraba a Mariana; no seleccionaba una ficha y podía conservar filtros que escondían los resultados. Ahora abre la ficha del tipo actual, retira los filtros y confirma la acción sin cambiar el rol.
- Los tres contactos y sus tareas iniciales se guardan en una sola transacción. Un conflicto de identidad o fallo de almacenamiento no deja una carga parcial. No se reinician ni borran datos existentes.
- La repetición reutiliza IDs estables y no reinicia tareas editadas o cerradas. Se reconocen las muestras anteriores exactas y se completan cargas antiguas incompletas de forma atómica. Las carteras de Ana y Luis mantienen ejemplos distintos; no se revelan ni reasignan contactos inaccesibles o archivados.

La revisión independiente final no encontró bloqueos funcionales, de privacidad ni de idempotencia. Se verificaron los eventos reales del adaptador incrustado en un DOM determinista; no equivale a una revisión de píxeles en navegador.
