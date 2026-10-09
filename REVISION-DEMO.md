# PULZZO: correcciones del prototipo para revisión

## Entrega actual: Cartera y Configuración · 8 de octubre de 2026

Las secciones siguientes conservan el historial de revisiones. Para las reglas actuales consulta [REGLAS-CARTERA-CONFIGURACION.md](REGLAS-CARTERA-CONFIGURACION.md). Esta entrega incorpora Cartera con cinco pestañas, Configuración con siete, reglas operativas versionadas y el registro compartido de cobros.

- Cartera reúne métricas y filtros, créditos, recibos, calendario y gestiones manuales. Incluye pagos iniciales/comisión previos a dispersión en movimientos; la lista de créditos activos mantiene el alcance de créditos dispersados.
- Configuración conecta versiones de comisión/plazos de prórroga, espera de prepago/liquidación y valores predeterminados de créditos nuevos: global/insolutos, mensual/quincenal y tasa/modalidad de comisión de apertura. Ofrece vigencia, alcances, simulación y evidencia de autorización demo para afectar acciones futuras de existentes. No reescribe contratos ni cobros históricos.
- Cobros: recepción explícita, folio, referencia, actor, aplicaciones y saldo no aplicado; protección de repetición, almacenamiento fallido y estado obsoleto. Reverso enlazado del último recibo verificable con permiso/motivo; no devolución de dinero.
- Prórrogas conservan pagos parciales posteriores y vencimiento real. Liquidación revalida fecha y saldo.
- IVA de comisión de apertura en ofertas nuevas/no aceptadas: base e impuesto separados. Los casos históricos se conservan con advertencia de revisión fiscal, sin aumento retroactivo. IVA sobre capital no se añade; validación fiscal/18-A pendiente.
- Pendientes explícitos: condonaciones, resolver sobrantes mediante reasignación/devolución, convenios/avisos automáticos, backend y fiscalidad de producción. Los controles no soportados se identifican como consulta o pendientes.
- Revisión de navegador visual/escritorio/móvil sigue pendiente por la restricción de sandbox ya documentada. Ninguna prueba determinista se presenta como navegación real.
- Validación actual: 27 suites deterministas; incluye conservación de principal global e insoluto tras pago/prepago/reconstrucción/reverso, IVA de apertura y viaje backoffice → portal, permisos, almacenamiento fallido, fechas/vigencias y no mutación histórica. Los conteos de entregas previas más abajo son históricos.
- La auditoría encontró y corrigió un caso donde reconstruir una tabla insoluta después de prepagar reintroducía capital pagado; se añadieron escenarios con distintas fechas y reversos.
- El portal muestra base/IVA/total de comisión, modalidad y monto financiado; el pago al proveedor usa la dispersión registrada, nunca el principal financiado como sustituto.



Esta copia es un demo local. No se ha reemplazado el sitio publicado, creado una integración de backend, consultado Buró, enviado un código real ni realizado operaciones financieras. Usa únicamente datos y archivos ficticios.

## Abrir la revisión

1. Descomprime el ZIP en una carpeta nueva. No reemplaces la copia publicada.
2. Con Node.js disponible, abre una terminal en esa carpeta y ejecuta `node preview.cjs`.
3. Abre `http://127.0.0.1:8080/` en un navegador. Todas las páginas deben usar ese mismo origen para compartir el estado demo. Detén el servidor con Ctrl+C.
4. Para ejecutar las pruebas incluidas: `node tests/run.cjs`. Se validó con Node.js 24; no requieren instalar paquetes.

También puedes abrir `index.html` directamente para revisar la página, pero el intercambio entre roles requiere el mismo origen HTTP local: el almacenamiento de URLs `file:` varía por navegador. Las imágenes están incluidas; las fuentes web pueden usar su alternativa local si no hay conexión.

## Recorrido de revisión sugerido

- Landing: selecciona monto y plazo, continúa al registro demo y comprueba que la estimación conserva tu elección.
- Paciente: registro/verificación de ejemplo, avances y regreso, carga de archivos ficticios, recarga, reemplazo y eliminación. El SAT es una simulación; no permite capturar su contraseña.
- Portal: una solicitud en evaluación no debe permitir aceptar una oferta. Revisa que se conserven centavos, plazo y calendario mensual/quincenal.
- Al final de la página de solicitud, abre “Recorrido demo local: paciente ↔ backoffice”. Envía el caso ficticio; en `backoffice.html` entra con un usuario demo con permisos e impórtalo. Usa el editor de oferta existente, envía la oferta y expórtala al portal demo. Regresa al paciente y recibe la oferta. Después de aceptarla, puedes devolver la decisión al backoffice con el mismo control.
- El traspaso es manual, local y explícito. No sustituye automáticamente expedientes existentes. Solo incluye metadatos de documentos, no los archivos originales. Una oferta aceptada o firmada no admite sustitución financiera silenciosa.
- Médico: registra datos ficticios, verifica con el código de ejemplo mostrado y abre el perfil médico. El acceso vuelve al perfil local correspondiente; no es autenticación real.
- Backoffice: comprueba permisos del rol de solo lectura, pago parcial de comisión, edición de ofertas y conservación del trabajo al recargar.

## Qué se corrigió

- Cálculos de ejemplo consistentes entre landing, solicitud y portal; selección de plazo y centavos preservados.
- Estados y controles de oferta, contrato y nueva solicitud; aceptación bloqueada mientras la oferta no esté disponible.
- Calendarios según plazo, frecuencia y días seleccionados, con distribución exacta de centavos entre quincenas.
- Documentos: claves consistentes y metadatos recuperables. Tras recargar, el navegador requiere volver a seleccionar el archivo ficticio para visualizarlo; el demo no promete conservar el archivo original.
- Contraseñas SAT: sin captura ni almacenamiento; limpieza de campos secretos antiguos conocidos sin exponer su contenido.
- Registro, acceso y verificación demostrativos; navegación médica reparada y estado separado del paciente.
- Backoffice: pagos parciales de comisión conservan el saldo pendiente; porcentajes con unidades explícitas; editor financiero único y condiciones aceptadas/firmadas bloqueadas; controles y manejadores protegidos por rol; datos guardados no se reseembran al recargar; correcciones generales de proveedores visibles y montos del expediente coherentes.
- Traspaso explícito de un caso ficticio entre paciente y backoffice, con comprobación de identidad de solicitud y condiciones de oferta.

## Decisiones pendientes, sin inventar reglas comerciales

- El estimador usa los factores de costo total que ya tenía la landing: 6 meses 18%, 12 meses 28%, 18 meses 38% y 24 meses 48%. Son ejemplos, no tasas anuales comerciales aprobadas.
- El desglose contractual de capital/interés/saldo, IVA y base de días no fue inventado. El calendario del paciente deja ese desglose “Por definir”.
- Se preservan las reglas existentes de aprobación, apetito de riesgo, pagos iniciales y comisión Upfront por defecto.
- Existe una diferencia previa entre la vigencia de Buró de tres años en lógica demo y la redacción de un año con extensiones condicionadas. Requiere definición del negocio antes de producción.

## Límite de la verificación

Las pruebas también verifican que los bloques CSS originales y los archivos de imagen permanecen intactos. La unificación visual de doctores añade un bloque CSS limitado a esa sección y su opción del menú.

Las pruebas automatizadas ejecutan funciones y manejadores reales del código en un entorno determinista, además de compilación JavaScript y comprobación de vínculos locales. No equivalen a una prueba visual ni a una navegación completa en un navegador real.

No se pudo ejecutar Chromium en el entorno de revisión: la creación de sockets fue denegada antes del arranque. Por tanto, la presentación final en escritorio/móvil, las validaciones nativas de formularios y el comportamiento real del historial quedan pendientes de la revisión en un navegador permitido. No se publicará esta copia sin autorización.

## Resultado de pruebas de esta entrega

- 9 suites deterministas aprobadas.
- 18 casos de acceso/registro del paciente, 19 casos de backoffice y 9 casos de navegación/presentación de doctores, además de verificaciones de flujo de paciente, médico e intercambio local.
- Casos concretos: comisión de $5,500 con pago de $1 deja $5,499; 1% y 0.5% conservan sus unidades; $5,066.67 conserva centavos; principal financiado $50,250.50 no se redondea a pesos enteros; ofertas borrador no llegan como aceptables al portal; roles de solo lectura no modifican finanzas.
- 222 vínculos/recursos locales existentes; 29 bloques JavaScript y 3 scripts externos/locales compilan; CSS e imágenes originales preservados; revisión de diferencias sin errores de espacios.
- Revisión adicional del código y repetición independiente de las pruebas aprobadas. La validación visual sigue pendiente, como se indica arriba.

## Actualización: doctores del backoffice — 7 de octubre de 2026

- La sección Doctores y clínicas utiliza la estructura de Pacientes: listado de ancho completo, botón «Ver doctor» / «Ver clínica» y perfil independiente con «Volver a doctores y clínicas».
- Se reutilizan tipografías, encabezados, tarjetas, cuatro indicadores y pestañas del diseño existente. Los acentos de identidad, selección y navegación son naranjas. Aprobación conserva verde, rechazo rojo y pendientes ámbar.
- Los filtros por nombre, ID, RFC, ubicación, tipo y estatus conservan su selección al regresar del perfil. Los accesos desde el dashboard siguen abriendo el perfil elegido.
- Etiquetas del perfil, documentación, fiscal y banco y datos de atención se muestran en español; los booleanos aparecen como «Sí» / «No». Los valores almacenados y las reglas de negocio no cambian.
- Se conservan las acciones y permisos anteriores, la cola general de correcciones y las correcciones previas de cálculos y acceso. No se editaron la landing, el portal médico ni los textos legales en esta actualización.
- Pruebas específicas: listado/detalle, regreso, selección, filtros/vacíos, nueve pestañas, accesos del dashboard, edición de procedimientos, aprobación fiscal, permisos, correcciones y reglas CSS de adaptación móvil.
- Pendiente: comprobar visualmente escritorio y móvil en un navegador permitido. Las aserciones de estructura y estilos no sustituyen esa revisión. No se modificó el sitio publicado ni se envió código a GitHub.


## Revisión responsive — 7 de octubre de 2026

Se corrigieron defectos verificables de estructura/CSS sin sustituir el diseño original:
- Registro de pacientes y doctores: una columna en 1024–1279px; columnas fluidas en el registro de pacientes desde1280px.
- Navegación pública: menú compacto hasta1279px y cierre al regresar a desktop; tarjetas de inicio en dos columnas a768–1023px.
- Respuesta FAQ larga sin recorte y margen de anclas legales bajo el encabezado fijo. No se modificó el texto legal.
- Solicitud de pacientes: identidad en una columna en tablet, campos móviles de16px y texto de autorización ajustable.
- Verificación médica: mensajes de error visibles y anunciables para código incorrecto/cuenta cambiada o ausente.
- Perfil médico: controles ajustables, etiquetas sin anchura mínima excesiva y cuerpo de vista previa/cámara desplazable.
- Backoffice: encabezado ajustable, menú con desplazamiento, cierre explícito/externo/Escape, estado accesible y diálogos contenidos en la altura disponible; tablas conservan su desplazamiento horizontal.

Validación: `node tests/run.cjs` pasa10 suites. Incluye comprobaciones de estructura/cascada, presupuestos de ancho y comportamiento del menú en un DOM simulado. Se conservaron los hashes de todos los bloques CSS originales y las imágenes. No se ejecutó un navegador ni se verificaron capturas a320,375,390,768,1024 o1440px: la ruta de navegador disponible quedó bloqueada. Estos resultados no certifican perfección visual ni sustituyen la revisión real de la copia privada.

## Refinamiento de Doctores, Ofertas e Historial — 7 de octubre de 2026

- Se revisaron las tres capturas facilitadas: directorio de doctores, tabla de ofertas e historial operativo.
- Doctores: nombres y encabezados de peso medio, etiquetas más discretas, tarjetas con bordes y sombras suaves, botones secundarios más ligeros y jerarquía clara en el perfil. El naranja permanece limitado a doctores; los estados conservan sus colores semánticos.
- Ofertas: encabezados y estados menos pesados, cifras alineadas y con dígitos tabulares, identificadores sin cortes y botones discretos en aqua. Se preserva la tabla completa con desplazamiento horizontal en pantallas pequeñas.
- Historial: se corrige la colocación de la tarjeta del evento, que aparecía comprimida en la primera columna por la combinación del marcador CSS y un elemento vacío. La fecha, acción y descripción ahora tienen una columna flexible explícita, con una línea vertical discreta entre eventos.
- Cambios de presentación únicamente: todos los scripts, valores financieros, plantillas de datos, filtros, permisos y acciones del backoffice permanecen idénticos. No se modificaron portales ni textos legales en esta actualización.
- Validación: 11 suites aprobadas, revisión independiente sin hallazgos pendientes y controles de alcance CSS, legibilidad estructural, objetivos táctiles de 44px y hashes de scripts. La revisión de las capturas originales sí se realizó; la nueva versión no se renderizó en un navegador, por lo que la validación visual final de escritorio y móvil sigue pendiente.

## Homologación tipográfica de todo el backoffice — 7 de octubre de 2026

Esta actualización sustituye el ajuste tipográfico parcial anterior por una única jerarquía compartida. Se inspeccionaron visualmente las siete capturas de referencia facilitadas, incluida la vista completa del Dashboard.

- Cobertura: Dashboard, Solicitudes de pacientes, Pacientes, Doctores y clínicas, Documentos, Correcciones, Ofertas, Historial operativo y Configuración demo; también encabezado, navegación, filtros, formularios, tablas, pestañas, perfiles y diálogos.
- Referencia de escala: encabezado principal de 25px, secciones de 21px, títulos de tarjeta de 17px y texto de 13px, derivados del Dashboard existente. Se conservan las familias originales de texto y encabezados. Los encabezados principales siguen iguales entre módulos; Admin, Reset demo y controles auxiliares bajan a peso 500.
- Nombres de pacientes, solicitudes y doctores/clínicas: el mismo estilo de 16px y peso 600, con sus perfiles en 21px y peso 600. Filtros, etiquetas, estados y acciones usan los mismos roles tipográficos en todos los módulos. En móvil, todos los campos usan 16px para evitar el zoom de enfoque de iOS.
- Se consolidaron las declaraciones tipográficas del archivo de refinamiento existente. No se añadió otra hoja de excepciones por módulo. Los estilos antiguos del prototipo permanecen intactos; una capa compartida y delimitada controla únicamente la tipografía, incluidos los estilos en línea que generan las plantillas.
- Se conservan los ajustes de distribución, contención responsive, navegación accesible, desplazamiento de tablas, alineación financiera y reparación del historial. No se alteraron colores semánticos, acentos médicos, acciones, permisos, cálculos ni textos legales. Todos los scripts del backoffice siguen idénticos byte a byte.
- Validación: 12 suites aprobadas mediante `node tests/run.cjs`: las 11 existentes y una nueva prueba de mapeo tipográfico sobre las plantillas reales de los nueve módulos, las diez pestañas de solicitudes, las cuatro de pacientes, las nueve de doctores, el encabezado y un diálogo. También se verifican los valores responsive, el alcance exclusivo al backoffice y los hashes de los scripts.
- Límite de validación: las capturas originales sí se inspeccionaron; esta nueva compilación no se abrió en un navegador. Las pruebas de código, plantillas y roles no certifican píxeles ni sustituyen la revisión visual final en escritorio y móvil.

Los importes principales del Dashboard conservan peso 560 y sus filas de métricas peso 520, como en la referencia. Los informes de Buró incrustados en marcos independientes conservan su tipografía propia; esta homologación cubre la interfaz y los controles del backoffice que los contienen, sin modificar esos informes.

## Separación de flechas en desplegables — 7 de octubre de 2026

- Se inspeccionó la captura del filtro «Estatus del paciente». Los desplegables de selección única del backoffice comparten ahora una flecha discreta con 14px de margen derecho y 44px de espacio reservado para el texto, incluidos filtros y diálogos.
- El cambio reside en la hoja de refinamiento existente y conserva los controles nativos, sus opciones, eventos, estado deshabilitado, foco y colores. Los selectores múltiples y las listas de varias filas mantienen su apariencia nativa; el modo de colores forzados recupera la flecha del sistema.
- Validación: 13 suites aprobadas. La prueba nueva comprueba el contrato CSS, las exclusiones y 17 controles generados por las plantillas reales. El HTML y todos los scripts del backoffice permanecen idénticos. La captura original sí se revisó; no se realizó una nueva comprobación visual en navegador.


## Búsqueda y acciones de las colas · 7 de octubre de 2026

- Doctores y clínicas: se elimina la selección visual persistente del primer perfil. El contorno naranja aparece al pasar el puntero o al enfocar por teclado el botón de la tarjeta.
- Documentos y Correcciones: búsqueda por nombre, solicitud, RFC, teléfono, CURP y correo del expediente propietario. Se normalizan acentos, mayúsculas, espacios y formato telefónico; la consulta se conserva al volver del expediente y tiene botón Limpiar. No se mezclan contactos de referencias u otros expedientes.
- Correcciones: botón Atender corrección o Ver expediente según permisos. Abre la solicitud/perfil y la pestaña correspondiente; conserva el motivo y el regreso a Correcciones. Los documentos o expedientes que ya no existen se muestran como no disponibles. Abrir una fila no cambia estados ni envía comunicaciones.
- Las tablas de ambas colas conservan desplazamiento horizontal en pantallas pequeñas.
- Verificación: 14 suites de regresión de fuente y DOM/VM, incluidos seis campos de búsqueda por separado, normalización, consulta vacía, limpieza, destinos, retorno, permisos y registros ausentes. Capturas de referencia inspeccionadas; comprobación visual en navegador nuevo no ejecutada por las limitaciones del entorno.

## Separación de solicitudes y directorio de doctores y clínicas

- Diez módulos: «Solicitudes de doctores y clínicas» reúne altas por resolver (incompletas, revisión, correcciones y rechazadas). El filtro «Estado del alta» permite consultar las aprobadas o todas. «Doctores y clínicas» contiene los expedientes permanentes de altas aprobadas.
- Ambas vistas reutilizan el mismo registro y el mismo ID. Se conservan procedimientos, documentos, notas, historial, permisos y las nueve pestañas. Los filtros y los controles tienen contextos e identificadores independientes por vista.
- El hito persistente `onboarding.approved` determina pertenencia al directorio. `status` sigue reflejando la revisión operativa, y los documentos mantienen sus propios estados. Los distintivos distinguen «Alta aprobada · En directorio» de «Revisión actual». Pedir correcciones, rechazar fiscal/banco o registrar un rechazo posterior no borra la aprobación ni retira silenciosamente el expediente.
- Migración idempotente: solo el estado anterior `aprobado` o un evento exacto «Perfil aprobado» acredita el alta. La aprobación fiscal o de documentos no acredita el alta. Se conserva la fecha del evento si existe; si no, se muestra «Sin fecha registrada», sin inventarla. No se reinician datos guardados ni se duplican registros.
- Las aprobaciones nuevas registran su fecha una sola vez. Las solicitudes rechazadas sin aprobación previa nunca entran en el directorio. El historial de altas aprobadas sigue disponible aunque la revisión actual sea rechazada.
- Búsqueda sobre datos propios: nombre, ID de perfil/alta, RFC, CURP, correo, teléfono, ubicación y procedimientos. La coincidencia de nombre con un paciente no agrega IDs ajenos.
- Dashboard y correcciones abren el expediente según su hito de aprobación. Desde una lista se conserva esa lista de origen; desde correcciones se conserva el contexto y se vuelve a la misma búsqueda. Se mantienen la pestaña y el expediente después de las decisiones.
- Estilo naranja en ambas vistas y escala tipográfica compartida. Etiqueta larga del menú con salto de línea y sidebar desplazable para evitar recortes en pantallas pequeñas.
- Validación: 15 suites mediante `node tests/run.cjs`, incluidas 10 nuevas regresiones de migración, persistencia, pertenencia, documentos posteriores, rechazos, filtros, búsqueda, rutas, permisos y Reset demo. Las comprobaciones son de código, DOM simulado y VM. La revisión visual en un navegador del nuevo build continúa sin ejecutarse por las limitaciones del entorno ya documentadas.

## Correcciones, Ofertas e Historial operativo — 8 de octubre de 2026

- Correcciones: un registro local por incidencia documental, migración idempotente y conservación de registros antiguos duplicados como antecedentes. Estados pendiente, recibida por registro manual del operador, en revisión y resuelta; reapertura explícita. Solicitante, responsable interno y siguiente acción se distinguen. La aprobación de un documento resuelve únicamente su incidencia. Las incidencias de perfil se resuelven desde la cola, sin aprobar automáticamente el expediente ni modificar consecuencias del crédito.
- Búsqueda por los seis campos existentes, filtros por entidad/estado, antigüedad desde la fecha registrada, acciones por permisos y asignación a usuarios con las capacidades necesarias. No se inventan fechas, respuestas del cliente, vencimientos ni comunicaciones. El estado y sus autores/fechas sobreviven a la recarga; abrir o filtrar no cambia datos.
- Ofertas: la cola incluye solicitudes aprobadas aún sin oferta, borradores, enviadas, aceptadas y rechazadas. Búsqueda por seis campos, filtro de estado, vigencia únicamente si ya existe y siguiente acción. Preparar/Editar/Ver abre el único editor existente. Los estados equivalentes de aceptación y las firmas mantienen bloqueadas las condiciones. El regreso conserva filtros y foco.
- Historial: búsqueda, fechas desde/hasta, usuario, entidad, acción y páginas de 30 eventos. Enlaces al expediente exacto con regreso al filtro original; referencias inexistentes o ambiguas no abren otro expediente. Los eventos anteriores no reciben valores anteriores/posteriores inventados. Desde esta versión se registran únicamente cambios de estados operativos y responsable interno, sin copias de perfiles, contraseñas, CIEC, documentos o datos financieros completos.
- Configuración demo permanece idéntica. También se conserva la separación entre altas y directorio permanente aprobado, los mismos registros/IDs, el hito de aprobación, la tipografía compartida, controles nativos y estilos anteriores. La nueva hoja CSS contiene únicamente distribución de filtros, acciones y tarjetas de las tres colas.
- Validación: 16 suites de regresión aprobadas, incluidos 13 nuevos casos DOM/VM; revisión independiente con seis pruebas adversariales adicionales y verificaciones de migración/fechas. Comprobaciones de sintaxis JavaScript, enlaces locales, alcance CSS, permisos, solo lectura, recarga, campos incompletos, destinos exactos, navegación y conservación de Configuración. No hay configuración de lint o typecheck en este prototipo estático. La comprobación visual del build nuevo en navegador permanece sin ejecutar por las limitaciones del entorno; las pruebas de código no certifican geometría ni píxeles.
- Límite: demo local del navegador. No se han enviado ofertas o comunicaciones externas, conectado un backend, publicado en GitHub ni modificado textos legales. El historial local no es una auditoría de servidor ni resistente a manipulación.

## Revisión documental unificada — 2026-10-08

- Navegación principal simplificada: Dashboard, Solicitudes de pacientes, Pacientes, Solicitudes de doctores y clínicas, Doctores y clínicas y Revisión documental. Configuración demo conserva su implementación y permisos previos.
- Revisión documental contiene Por revisar y Correcciones. Las rutas internas antiguas `documents` y `corrections` siguen funcionando; comparten título, pestañas y controles redondeados de Solicitudes. El filtro de documentos abre en Por revisar y permite consultar todos los estados, incluidos aprobados.
- Ofertas se consulta como pestaña secundaria de Solicitudes de pacientes. Se conserva la ruta interna `offers`, el editor existente, las solicitudes aprobadas sin oferta y los bloqueos de ofertas aceptadas. No se cambian cálculos financieros.
- Historial operativo permanece accesible desde Dashboard; los historiales de cada expediente mantienen sus pestañas y filtros. El visor ofrece acceso al historial del expediente; las correcciones de datos tienen acceso al perfil y retorno a la cola de origen.
- Cada fila usa una acción Revisar. El visor identifica tipo de entidad, ID exacto y documento; en grupos, selecciona un adjunto almacenado. Expone las decisiones canónicas y el seguimiento de corrección autorizado por rol. Motivos y metadatos se muestran solo cuando están registrados; no se generan archivos ni fechas de carga.
- Vista previa solo para imagen o PDF con bytes locales embebidos. Los registros demo que contienen únicamente un nombre muestran “Vista previa no disponible”. No se descargan archivos ni se abren enlaces externos automáticamente.
- Abrir, cambiar pestaña, cancelar o cerrar no crea documentos. Las decisiones revalidan permisos, entidad, documento y adjunto; un registro sustituido o un adjunto reordenado invalida la acción pendiente. La corrección y su auditoría se identifican por entidad, expediente, documento e ID para evitar colisiones.
- Los formularios de motivo y asignación vuelven al mismo visor al cancelar o guardar. La consulta conserva filtros y devuelve el foco al origen o al buscador tras actualizar la lista.

Validación: 17 suites de regresión por JavaScript/DOM simulado, contratos de fuente/CSS, permisos y datos. La nueva suite incluye acciones de paciente, proveedor, adjuntos agrupados, correcciones generales, referencias huérfanas, permisos revocados y contextos obsoletos. Se inspeccionaron los píxeles de las referencias aportadas; no se ejecutó QA visual del nuevo build en navegador, por las limitaciones del entorno ya registradas. No confundir las comprobaciones de estructura/estilo con una prueba de geometría o accesibilidad real en navegador.

Alcance preservado: demo local; sin mensajes reales al cliente, sin integración de underwriting, sin reglas de rechazo automático ni plazos añadidos, sin cambios legales A55, sin modificar GitHub/main o el sitio público original.

## Nueva versión local y controles coherentes — 2026-10-08

- Se retira «Registrar recibida» del flujo habitual. Un documento vuelve a revisión únicamente tras importar un archivo nuevo real en el visor de su expediente y adjunto exactos. Abrir el visor, cambiar pestañas o conservar metadatos anteriores no acredita recepción.
- «Importar nueva versión local» admite PDF e imágenes PNG/JPEG/WebP/GIF de hasta 512 KB con confirmación de datos ficticios. Valida tipo, tamaño, bytes y cabecera; conserva las versiones anteriores, decisiones previas y responsable. La nueva versión queda pendiente de decisión, sin aprobación ni resolución automática. En documentos agrupados conserva las decisiones de los demás adjuntos.
- El traspaso es explícito y local en este navegador. Los portales de paciente y doctor todavía no sincronizan sus sustituciones con el backoffice. Esta revisión no conecta un backend ni identifica expedientes por nombre. El adaptador de demostración existente valida el archivo importado; no simula una respuesta del cliente ni una carga remota.
- Las correcciones exclusivamente de datos utilizan «Revisar datos» para iniciar la revisión del operador. No registran recepción de archivos. Se conservan los estados antiguos para compatibilidad, junto con permisos, asignación e historial.
- Controles de acción con escala compartida: altura mínima de 44 px, radio de 12 px, espaciado y tipografía comunes. Acciones primarias en aqua sólido; acciones secundarias en aqua claro con borde fino. En expedientes, filas y diálogos de proveedor se utilizan los equivalentes naranjas. Las acciones destructivas siguen rojas y las aprobaciones explícitamente verdes conservan su semántica.
- La selección usa un solo borde de 1 px y fondo tenue, sin halo apilado. El foco de teclado sigue visible con contorno de 2 px y admite colores forzados. Las etiquetas largas y grupos de botones permiten salto de línea en móvil; no se fuerzan anchos idénticos a todos los textos. Los estados deshabilitados conservan bloqueo y diferenciación.
- Verificación nueva: 18 suites aprobadas, incluidos 52 casos de revisión documental, contratos de CSS/fuente y pruebas JavaScript/DOM simulado. Revisión independiente del alcance y de las protecciones de carga local completada. No se ha ejecutado revisión visual del nuevo build en navegador. Las cinco capturas nuevas no pudieron inspeccionarse: la descarga autorizada de Library devolvió HTTP 403; esta revisión de estilo sigue la especificación verbal y los tokens existentes, no inferencias sobre esos píxeles.

## Corrección de escala y encabezado — 2026-10-08

- Esta corrección sustituye la escala de controles del apartado anterior. Se inspeccionaron las tres capturas de Dashboard, filtro de solicitudes y directorio de pacientes proporcionadas para esta revisión: mostraban botones grandes, un doble contorno de foco y el menú móvil visible junto a la barra lateral de escritorio.
- Botones de escritorio: mínimo de 36 px, radio de 8 px y relleno horizontal de 12 px; campos de texto y selectores simples: 38 px. Las acciones secundarias y periodos inactivos vuelven a blanco con borde fino. Los botones de directorio se ajustan al contenido. Se conservan los colores de primarias, proveedor, destrucción y aprobación.
- Móvil hasta 820 px o puntero táctil: controles de 44 px. Se preservan el chevrón nativo personalizado y su espacio derecho, la tipografía compartida, los campos especiales y la disposición de tarjetas.
- Se elimina la prioridad forzada de display en botones, que estaba mostrando el menú móvil en escritorio e interfería con elementos ocultos. El punto de apertura del menú lateral sigue en 820 px. El título y subtítulo superiores se centran mediante columnas laterales equilibradas; en móvil las acciones ocupan otra fila. Los títulos de tarjetas y los textos de campos no se centran.
- Foco: contorno de teclado de 2 px superpuesto al borde, sin separación exterior ni sombra apilada; se mantiene la compatibilidad con colores forzados.
- Verificación: 19 suites aprobadas. Se actualizan únicamente los contratos que exigían los 44 px universales, el radio de 12 px y el halo separado rechazados. La nueva suite cubre escala de escritorio/táctil, visibilidad, encabezado responsive y foco de fuente/CSS. HTML, JavaScript, importación real de archivos locales, permisos, finanzas y textos legales permanecen idénticos. No se ejecutó QA del nuevo build en navegador: la inspección de las capturas anteriores no certifica los píxeles resultantes de esta corrección.

## Alineación izquierda de encabezados — 2026-10-08

- Esta corrección sustituye el centrado del apartado anterior. El título y subtítulo compartidos de todas las secciones vuelven a la izquierda, al mismo margen del contenido en escritorio. Se elimina la columna vacía de compensación; las acciones permanecen a la derecha.
- En móvil, el menú mantiene su columna de 44 px, el encabezado queda alineado a la izquierda junto a él y las acciones conservan una fila independiente. El menú sigue oculto en escritorio.
- Se conservan la escala compacta de escritorio, los controles táctiles de 44 px, tipografía y foco. Únicamente cambia CSS de presentación; todos los HTML y JavaScript permanecen idénticos byte a byte respecto al commit 9998c5b.
- Verificación: 19 suites de regresión aprobadas, con contratos actualizados de alineación, columnas, márgenes y acciones responsive. No se ejecutó QA visual del nuevo build en navegador; las pruebas de fuente no certifican píxeles.

## Semántica de navegación y acciones — 2026-10-08

- Navegación seleccionada, subpestañas, filtros de vista y adjuntos seleccionados usan fondo tenue, texto oscuro y borde fino: aqua para pacientes y superficies compartidas; naranja para doctores y clínicas. La selección deja de parecer una acción primaria.
- Las aprobaciones explícitas de solicitudes, documentos, perfiles y fiscal/banco son verdes. «Revisar», «Ver», «Volver», «Cancelar» y «Cerrar» son secundarios blancos con borde neutro. Guardar, continuar y enviar conservan el color sólido de su contexto; rechazar permanece rojo y pedir corrección usa ámbar.
- Se elimina el reemplazo de la primera clase primaria del documento médico, que coloreaba «Revisar» como aprobación. Las clases ahora se asignan en cada plantilla correspondiente, sin buscar el texto de los botones en ejecución.
- Aceptar ofertas, firmar, aplicar pagos y dispersar conservan su acción de marca y los mismos manejadores y confirmaciones; no se convierten en aprobaciones verdes. No cambian permisos, cálculos, persistencia ni configuración.
- Se mantienen controles compactos de backoffice en escritorio y objetivos táctiles de 44 px, dimensiones de los portales, foco, estados deshabilitados y encabezados: acceso/registro centrados; plataforma interna a la izquierda. Landing y páginas legales no cambian.
- La verificación de comportamiento del backoffice compara los scripts con el baseline anterior excluyendo únicamente atributos de clase y el adaptador de color retirado. Las regresiones funcionales se complementan con contratos de color por acción y contexto. QA visual del nuevo build en navegador permanece sin ejecutar; las pruebas de fuente y DOM simulado no certifican píxeles.
- Resultado: 22 suites aprobadas (las 20 existentes y 2 nuevas). Los siete scripts de acceso/registro/verificación y portales mantienen sus hashes anteriores al retirar exclusivamente las clases semánticas añadidas. El foco inset se oscurece para contrastar con los fondos de marca; en los rechazos del portal usa blanco para mantener contraste también al pasar el cursor.

## Barra lateral plegable de backoffice — 2026-10-08

- En escritorio, la barra inicia expandida y permite alternar entre iconos con nombres y un riel de 80 px mediante una flecha. La preferencia se guarda exclusivamente en `pulzzo.backoffice.sidebar.collapsed`; un valor ausente o inválido mantiene la vista expandida. Si el almacenamiento falla, el control sigue funcionando durante la sesión.
- El riel conserva nombres accesibles, ayudas visibles al pasar el cursor o enfocar y la selección con los mismos colores de contexto. `aria-current` identifica la sección, incluidas las rutas secundarias de Ofertas y Correcciones. Cerrar sesión conserva su acción y nombre accesible.
- Hasta 820 px se mantiene el cajón completo existente; la preferencia de escritorio no lo convierte en riel. El botón de plegado no participa en el ciclo de foco móvil, el cajón cerrado es inerte y los cambios de viewport trasladan el foco cuando el control anterior queda oculto. Escape, fondo y selección siguen cerrando el menú. Los encabezados, pestañas horizontales, controles compactos, roles y permisos no cambian.
- Validación: 23 suites aprobadas mediante `node tests/run.cjs`, incluidas siete nuevas agrupaciones de regresiones de preferencia, almacenamiento bloqueado, alternancia, etiquetas, foco, viewport, cajón, rutas y alcance CSS. Los contratos históricos restauran únicamente las tres funciones de navegación/presentación modificadas para seguir verificando los hashes del resto del comportamiento, sin sustituir los baselines previos. No existe configuración adicional de lint/typecheck en este prototipo estático.
- Estas comprobaciones son de fuente, DOM simulado y VM. No se ejecutó revisión visual, teclado real ni lector de pantalla en navegador. Sin cambios en los portales, autenticación, finanzas, GitHub/main o sitio público original; la publicación privada y el ZIP se coordinan aparte.


## Pulido de Cartera y Configuración, escritorio y móvil — 2026-10-08

- Resumen con cuatro indicadores financieros, gráficas compactas y prioridad de atención. Filtros principales en una fila de escritorio, opciones adicionales plegables, etiquetas removibles y limpieza; panel de filtros en móvil.
- Tabla de créditos simplificada y alineación de importes; tarjetas móviles para créditos, movimientos, calendario y cobranza. La misma información y acciones siguen disponibles en ambos tamaños.
- Registro de pago en panel derecho de escritorio o pantalla completa móvil, con cliente/crédito fijos, distribución previa y sobrante. El motor de recibos existente admite entrada con identidad explícita y una vista previa sobre copia aislada; no hay otro libro ni prelación alternativa. El guardado conserva permisos, comprobaciones de datos vigentes, referencias únicas, atomicidad y conciliación.
- Configuración por bloques con ayudas, porcentajes legibles y revisión antes/después, vigencia y créditos afectados; lo pendiente continúa claramente identificado. No cambian las condiciones financieras, IVA, comisiones, bases global/insoluto, versiones, reversos ni textos legales.
- Cierre, Cancelar, Escape, navegación posterior y retorno de foco liberan el panel de pago. La página de fondo queda inerte y bloqueada mientras está abierto; un cambio de datos/configuración/permisos impide guardar una captura obsoleta.
- Verificación: 31 suites aprobadas con `node tests/run.cjs` (las 27 anteriores y cuatro nuevas), mediante fuente, VM y DOM simulado; la matriz financiera compara las cinco modalidades de vista previa con sus recibos posteriores y verifica que la vista previa no cambie datos, auditoría, almacenamiento ni selección global. No se ejecutó QA visual, teclado real o lector de pantalla en navegador: el arranque de navegador está bloqueado por el entorno y no se eludió esa restricción.

## Integración local de portales y correcciones — 2026-10-08

Se sustituye el calendario ilustrativo posterior al contrato por una proyección manual de la misma Cartera, protegida por cuenta, solicitud, crédito y contrato. Las listas fijas del portal médico se sustituyen por procedimientos y dispersiones exclusivamente del proveedor vinculado. Los legacy requieren conciliación consciente de IDs; no hay asociación por nombres ni reinicio del almacenamiento.

Se agrega el recorrido de revisión de campos médicos: envío de perfil, observación de campos concretos con motivo, borrador aislado, reenvío con nonce/versión, nueva revisión y aplicación únicamente de cambios aprobados. Los buzones se separan por cuenta/solicitud y rechazan revisiones antiguas, cambios cruzados y fallos de escritura.

Detalle y recorrido: `REGLAS-INTEGRACION-PORTALES-DEMO.md`. Alcance exclusivamente demo local; no se afirma integración de producción ni QA visual. No cambian las reglas financieras, IVA ni el bloqueo seguro de recibos fuera de orden. La suite integral final y los tests nuevos se deben ejecutar sobre el commit candidato antes de publicación.

Verificación final local de integración: `node tests/run.cjs` aprobó los 41 archivos de regresión, incluidos los cuatro nuevos; `git diff --check` sin errores. No se publicó ni se actualizó el ZIP durante esta implementación. QA visual sigue pendiente.
