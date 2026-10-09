# Directorio y perfil público · demo local

## Alcance

Implementación sobre `d8267d59effe677264b67f37dbef4b00a6693d07`, en un worktree separado. No se activó Gmail, no se cambiaron reglas financieras ni se desplegó el sitio.

El directorio es una simulación en el mismo navegador y origen. No constituye un backend multiusuario, una verificación real de identidad ni una publicación en internet. Los roles siguen siendo los de la demo. Usar exclusivamente datos y fotografías ficticios.

## Flujo

1. El KAM responsable, el titular o el equipo autorizado prepara un borrador de datos públicos. No se copian documentos, RFC, CLABE, movimientos financieros ni notas internas.
2. El titular revisa una vista previa y autoriza expresamente esa versión. El KAM no puede confirmar por él.
3. Backoffice aprueba la versión, pide una corrección con motivo o rechaza esa versión. Aprobar no publica.
4. Una acción explícita publica la versión aprobada en el directorio local. El alta del proveedor también debe estar aprobada.
5. Cualquier cambio crea otro borrador. La versión publicada anterior se conserva mientras se completa la autorización y revisión del cambio. Corregir o rechazar una versión nueva no retira la anterior.

Los estados de alta, revisión de expediente, versión pública y publicación se presentan por separado. El rótulo anterior «En directorio» ya no se deduce únicamente de tener el alta aprobada.

## Fotografía opcional y tarea interna

- Se puede publicar sin foto; se muestra un avatar.
- La falta de foto en una versión publicada genera una tarea canónica y única para el KAM responsable, dentro del CRM existente y sin fecha de vencimiento inventada.
- Cargar una foto en un borrador no cierra la tarea. La tarea se cierra cuando una versión con foto se publica.
- Si otra versión publicada vuelve a quedar sin foto, se reabre la misma tarea.
- Una reasignación cambia quién puede ver y atender la tarea; no crea duplicados ni mantiene acceso para el responsable anterior.
- Si un expediente antiguo aún no tiene prospecto/responsable CRM vinculado, backoffice lo señala expresamente. No se inventa un KAM ni se atribuye el perfil por nombre, correo o teléfono.
- Solo se aceptan PNG, JPEG, WebP o GIF de hasta 5 MiB, con comprobación del contenido binario y decodificación de imagen en los controles del navegador. Se preserva el dato anterior si falla lectura, validación o almacenamiento.

## Pantallas

- Landing: resultados procedentes únicamente de versiones publicadas; filtros por especialidad, procedimiento, estado, ciudad y texto; controles con flecha consistente y estado vacío honesto.
- Portal médico: edición del borrador público, foto opcional, vista previa y autorización de versión, separados del registro y la documentación privados.
- Backoffice: resumen con hipervínculos válidos; bloque editable del perfil público; revisión/publicación explícitas e historial por actor y versión. Los textos que no sean URL completas no se convierten en destinos inventados.
- CRM: preparación asistida del borrador y fotografía, alerta/tarea interna y formulario «Nuevo prospecto» separado en datos de contacto y origen/responsable. Las ayudas del teléfono y referido aparecen junto al campo correspondiente.

## Seguridad de la demo

Los vínculos usan identificadores estables de proveedor, cuenta, contacto y expediente; los recibos del registro asistido deben coincidir. Se comprueban cambios de cuenta, sesión, asignación, versión, cierre de ventana y navegación antes de guardar, también después de leer/decodificar fotografías. Cada cambio del perfil público usa una escritura local atómica con revisión esperada. El almacenamiento local no proporciona autenticación de producción ni compare-and-swap entre procesos.

## Validación

Ver el resultado final de pruebas entregado junto al cambio. Las suites de publicación, contexto, tareas CRM y auditoría de integración ejecutan módulos reales en Node/DOM/VM; la regresión conserva pruebas financieras, de identidad, correcciones y navegación.

La comprobación visual de las pantallas nuevas en un navegador real no se pudo completar en este entorno: el lanzamiento fue bloqueado por permisos de socket. No se debe interpretar la validación de código/VM como verificación de píxeles. Las cinco capturas originales sí fueron inspeccionadas visualmente antes del cambio.

### Resultado comprobado

- `npm test`: 71 suites de regresión, más 29 pruebas del módulo de correo, sin fallos.
- Cinco suites nuevas incluidas en el agregado: núcleo de publicación, contexto/filtros, interfaz del titular, CRM/tarea de foto y auditoría independiente.
- Auditoría independiente: 10 casos de integración aprobados, incluyendo cambios de rol/vista durante decodificación, versiones anteriores, IDs largos, cuotas y tareas tras reasignación.
- `npm run build` y `node scripts/validate-mail-build.mjs`: aprobados; 69 archivos estáticos permitidos, sin fuentes privadas ni secretos en la salida pública.
- Embedding de CRM regenerado con el generador existente y verificación de coincidencia aprobada.
- `git diff --check`: aprobado.
- Los snapshots de comportamiento de las pruebas antiguas se actualizaron únicamente después de revisar los cambios de presentación e integración; se mantuvieron sus aserciones semánticas y las pruebas de negocio existentes.
- Prueba de navegador opcional preparada para un entorno que permita ejecutarla. No ejecutada satisfactoriamente aquí; no se asegura responsividad visual ni comportamiento real de foco/touch/lector de pantalla.
