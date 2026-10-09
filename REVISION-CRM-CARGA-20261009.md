# CRM: carga inicial con estilos

## Cambio

El adaptador de CRM instala ahora una hoja de estilos completa y síncrona dentro de su Shadow DOM antes de insertar la interfaz. Los estilos se incluyen en el mismo archivo JavaScript que Backoffice ya cargaba. Se eliminan las dos solicitudes CSS iniciadas al entrar al CRM. No hay espera artificial, temporizador ni pantalla de carga añadida.

La fuente editable del adaptador es `scripts/crm-demo-embed.source.js`. Las fuentes CSS siguen siendo `assets/css/crm-demo.css` y `assets/css/crm-demo-embed.css`, en ese orden. `npm run build:crm` genera `assets/js/crm-demo-embed.js`; no editar ese archivo generado. `npm run check:crm` y `npm test` detectan cualquier desajuste. El build general regenera el adaptador antes de copiar los archivos públicos. Los imports CSS y URLs externas/relativas nuevos fallan explícitamente hasta definir cómo empaquetarlos, evitando reintroducir dependencias de red o rutas incorrectas.

El aislamiento del CRM, estilos del Backoffice, navegación, identidad de sesión y reglas operativas se conservan. Si no puede instalarse la hoja o iniciar la aplicación, se retira el host fallido y aparece una alerta con Reintentar CRM. Un botón retirado no puede reabrir CRM tras cambiar de sección o cerrar sesión.

## Rendimiento: hechos y límites

- Antes: adaptador de 3.813 bytes y dos CSS de 20.001 y 25.365 bytes; 49.179 bytes en total.
- Ahora: adaptador con estilos de 49.895 bytes. No hay solicitudes de hojas de estilo al montar CRM.
- Compresión gzip nivel 9 local: antes 1.698 + 4.820 + 5.575 = 12.093 bytes; ahora 11.324 bytes. Son tamaños de compresión de referencia, no una captura del servidor.
- El coste de estilos se adelanta a la carga normal del adaptador de Backoffice. Su transferencia inicial aumenta frente al adaptador anterior, a cambio de evitar esperar dos recursos al abrir CRM. Los CSS originales se conservan para compatibilidad y como fuentes, pero el montaje nativo ya no los descarga.
- No se midieron milisegundos de carga ni se verificaron fotogramas reales del navegador. No se afirma una mejora porcentual de velocidad. La mejora comprobada es estructural: cero dependencias CSS de red durante la apertura y estilos insertados antes del contenido.

## Verificación

- Pruebas de generación reproducible, deriva de CSS/adaptador y rechazo de imports/URLs externas.
- Integración con código real en DOM/History simulado: estilos completos antes de iniciar UI, sin eventos CSS necesarios, fallo de hoja, fallo de inicialización, reintento limpio, botón obsoleto, navegación Back/reentrada y cierre de sesión.
- Regresión completa, build local y validación del Worker/archivos públicos.
- Quedan sin validar: primer fotograma y geometría en navegador real, tiempos de red reales y cabeceras CSP del despliegue. El repositorio no declara una CSP que prohíba los estilos inline y ya usa estilos inline en Backoffice. Una política CSP nueva deberá contemplar estos estilos.

No se publicó ni desplegó esta corrección.
