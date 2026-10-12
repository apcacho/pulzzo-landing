# CRM: recomposición del dashboard

Fecha: 12 de octubre de 2026 (UTC). Base: `e9adc72406a02173fbfba6e2ec1304908a96f576`.

## Referencia y cambios

Se inspeccionó la captura proporcionada, de 2048 × 895 píxeles. Mostraba tarjetas muy extendidas, filas con alturas desiguales, gráficos de una sola categoría y explicaciones con excesivo protagonismo. La comparación con Backoffice se hizo contra su contrato de diseño en el código.

- Encabezado «Resumen comercial» y filtros de mes, año y responsable agrupados.
- Ancho de lectura máximo de 1440 px; cuatro KPI compactos, con dos columnas en móvil.
- Dos tarjetas principales alineadas. La cartera mantiene sus categorías y valores; los pendientes se presentan como contadores, con aviso coral para vencidos. A 1100 px o menos se apilan estas dos tarjetas para compensar el espacio ocupado por la barra lateral.
- Origen y conversión forman una segunda fila de dos tarjetas. Actividad por usuario permanece dentro de la sección del mes, en un bloque compacto separado.
- Una sola categoría muestra su conteo exacto sin simular una comparación mediante una barra de ancho completo. Los gráficos de varias categorías conservan origen cero y escala real.
- Las definiciones extensas están disponibles en desplegables nativos. Período, alcance actual/mensual, base y numerador de conversión siguen accesibles, sin cambiar los cálculos.
- Secciones de 21 px, títulos de tarjeta de 17 px y cifras KPI de 30 px, con las variables de Backoffice. Se corrigió la especificidad de los párrafos secundarios exclusivamente dentro del dashboard.
- Se conservan cinco pares de vistas mutuamente excluyentes, tablas con encabezados, valores exactos, navegación por teclado y estados sin datos verdaderos.

## Integridad y límites

Los cambios afectan a la presentación del dashboard, su plantilla y sus pruebas. No modifican motores financieros, almacenamiento, cálculos de métricas, permisos, onboarding, publicación de proveedores ni correo. La hoja incrustada se genera desde sus archivos canónicos.

No se publicaron cambios ni se activaron conexiones o credenciales. No se ha renderizado la nueva interfaz en un navegador: la validación de estilos y geometría basada en código no equivale a una inspección visual de los nuevos píxeles. No se reintentaron rutas de navegador previamente bloqueadas.

## Verificación

Resultado final comprobado:

- 78 suites de regresión completas, incluidas las 77 anteriores y la nueva suite de composición con ocho grupos.
- 29 pruebas de correo aprobadas.
- Generación de CSS incrustado actualizada y validada; CSS analizado sin advertencias.
- Build y validador del Worker, migraciones y 69 archivos públicos permitidos aprobados.
- Revisión independiente de estados vacíos/dispersos/densos, etiquetas largas, cinco vistas exclusivas y desplegables nativos.
- Cascada efectiva de títulos 21/17 px, KPI 30 px y notas 11 px; controles táctiles de 44 px también en pantallas anchas.
- Geometría basada en código para 320, 390, 768, 821, 1100, 1180, 1440 y 2048 px. No incluye medidas renderizadas.
- El código de cálculos de analytics anterior a los renderizadores es idéntico byte por byte a la base (SHA-256: `74d94cbc783ad6d60bccddcdc2ed88105367a45b105cac2593cb6f910c1fbbb6`).
- `git diff --check` aprobado. Ningún hallazgo bloqueante pendiente en la revisión independiente.
