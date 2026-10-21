# Revisión v53

Revisión de producto y de calidad sobre la demo local, en escritorio de 1280 px y de 1440 px. Se corrigió lo evidente. Lo que cambia una regla, un texto legal o una decisión de negocio quedó como pregunta.

Rama: `cursor/campanas-v48-cff6`.

## 1. Corregido

### Pestañas del expediente, de Cartera, de configuración y del periodo

En el expediente, a 1280 px, la barra partía las palabras. Se leía «Resume / n», «Documento / s», «Bur / ó» y «Historia / l». La misma regla apretaba otras barras de pestañas.

Ahora la barra no parte palabras: si no caben, se desplaza de lado y cada pestaña conserva el nombre completo, a 36 px de alto. Aplica a expediente, perfil de paciente, Cartera, dispersión, buró, flujos, configuración y los botones Hoy / Semana / Mes / Año. Comprobado a 1280 px (la barra mide 877 px y el contenido 1050 px) y a 1440 px.

### Montos con dos decimales

En Solicitudes, expediente, dashboard y perfiles, un monto cerrado se veía como `$85,000` o `$136,000`, sin centavos. En Configuración, el ejemplo de límites decía `$10,000` y `$300,000`. En la solicitud del paciente, el mismo caso podía salir sin `.00`.

Esos montos visibles quedan con dos decimales: `$85,000.00`, `$136,000.00`, `$10,000.00 MXN` a `$300,000.00 MXN`. El aviso de «fuera de límites» en la oferta usa el mismo formato. Las tablas de Cartera ya lo tenían.

### Fechas en DD/MM/AAAA

El dashboard decía el periodo como `2026-10-01 a 2026-10-31`. En Cobranza, el próximo vencimiento, el último recordatorio, los recibos, los acuerdos y el historial de contacto mostraban la fecha al revés. La nota de una gestión de cobranza también.

La frase del periodo queda `01/10/2026 a 31/10/2026`. Esas fechas de Cobranza y de la nota de gestión quedan en día/mes/año. En Cartera, la próxima cuota, los pagos, el calendario, la cobranza y la fecha de una liquidación también. Lo que se guarda sigue en formato técnico; solo cambia lo que se lee. El calendario del navegador, en los campos «Desde» y «Hasta», sigue el formato del propio control.

### Estado «Contrato firmado»

En Pacientes, Patricia Núñez y otros perfiles con contrato firmado decían «Estado no definido». La demo ya trataba ese estado como firmado; solo faltaba el nombre en pantalla.

El directorio muestra «Contrato firmado». Lo mismo ocurre con las claves `firmado` y `firmada`, que la app ya consideraba firma hecha.

### Lo que se revisó y no traía error de consola

Sin errores de consola, sin `NaN` y sin `undefined` suelto, a 1280 px y a 1440 px:

- Backoffice: Dashboard, CRM, Solicitudes, Pacientes, Solicitudes de doctores, Doctores y clínicas (incluido el expediente de Dr. Roberto Salinas y sus pestañas), Revisión documental, Cartera (Resumen, Créditos, Pagos y movimientos, Calendario, Cobranza) y Configuración (Usuarios y grupos, CRM, Correo CRM, límites del crédito, Cartera, Historial).
- Expediente APP-PUL-1001: Resumen, Datos, Documentos, Buró, Oferta, Referencias, Contrato, Dispersión y pagos, Historial y Payload.
- Páginas públicas: inicio, solicitud, ingresos y registros de paciente y de doctor, preguntas frecuentes, CRM demo y captura asistida.
- Entrada con la cuenta KAM de demostración: abre en CRM y no muestra el resto del menú.

Los bordes oscuros de los campos de la tabla de fases ya estaban corregidos en v52. En esta pasada no aparecieron campos nuevos con ese borde.

## 2. Dudas para decidir

1. **El dashboard abre en el mes de hoy y por eso los montos se ven iguales.** En octubre de 2026, solicitado, aprobado y aceptado muestran `$136,000.00`. En proceso, rechazado y pago a doctor muestran `$0.00`. No es una suma duplicada: ese mes solo entran créditos de la demo que ya están aceptados. Las solicitudes de junio quedan fuera del mes.
   Recomendación: dejar el cálculo como está. Si quieres ver el embudo completo al entrar, el periodo inicial de la demo puede ser el año, no el mes.
   Ejemplo: hoy el mes dice `$136,000.00` aceptados y `$0.00` en proceso, aunque en junio sí hay solicitudes en revisión.

2. **El filtro «Aceptado» del directorio de pacientes no incluye a quien ya firmó.** El filtro busca la palabra «acept» en la clave interna. «Contrato firmado» no la contiene, así que Patricia no sale al elegir Aceptado.
   Recomendación: si «Aceptado» debe incluir contratos firmados, hay que sumar ese estado al filtro. Si solo significa «aceptó la oferta y aún no firma», dejarlo.
   Ejemplo: Patricia ya dice «Contrato firmado», pero el filtro Aceptado no la muestra.

3. **Las gráficas de Cartera abrevian el eje (`$85K`, `$1.2M`) y las tablas usan centavos.**
   Recomendación: dejar la abreviatura solo en el eje de la gráfica, para que quepa, y los centavos en tablas y tarjetas.
   Ejemplo: el eje dice `$85K` y la celda de al lado dice `$85,000.00`.

4. **Hay nombres de demostración que se leen mal.** En APP-PUL-1001 el doctor aparece como «Dr. igel Bonillas» y el titular como «ANA PAULA CACHO RUIZ CACHO RUIZ».
   Recomendación: corregir solo el texto si fue un error de captura, por ejemplo «Dr. Miguel Bonillas» y el nombre del titular una sola vez. No cambié los datos porque pueden ser a propósito para probar duplicados.
   Ejemplo: el resumen de Ana Sofía Martínez muestra «Dr. igel Bonillas».

5. **En CRM, «Exportar CSV» ocupa dos renglones, con las dos palabras enteras.**
   Recomendación: dejarlo. Forzar una sola línea obliga a reconstruir el CRM embebido.
   Ejemplo: el botón se lee «Exportar» y, debajo, «CSV».

6. **La pestaña Payload muestra el JSON tal cual, con `null` y fechas `2026-06-01`.**
   Recomendación: no maquillarlo. Es el dato técnico de la demo, no una pantalla para el paciente.
   Ejemplo: se ve `"preferredPaymentDay": null` y `"applicationDate": "2026-06-01"`.

7. **CRM abre sin clientes hasta que alguien pulsa «Cargar ejemplos ficticios».** La pantalla vacía no se rompe.
   Recomendación: dejar el vacío. Cargar ejemplos al entrar mezclaría datos de prueba sin que el usuario lo pida.
   Ejemplo: la primera visita dice cero clientes; después de cargar ejemplos aparecen los ficticios.

## 3. Pendiente / no tocado

- No se recorrió clic a clic cada paso del wizard de la solicitud ni del alta del doctor. Esas pantallas abren, sin error de consola, y el monto de la solicitud ya sale con centavos cuando el paso lo calcula.
- No se disparó cada aviso ni cada notificación de CRM. La sección abre y el estado vacío no truena.
- No se cambiaron textos legales, permisos, etapas, SLA simulado ni la forma de calcular saldos, intereses o cobranza.
- El manifiesto de hashes de `VERSION.json` se dejó como está. La nota y el pie pasaron a v53.
- Los controles de fecha del navegador siguen en el formato del control. Lo que se lee en frases y en tablas ya está en DD/MM/AAAA.
