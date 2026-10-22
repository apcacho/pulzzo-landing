# Revisión v53

Revisión de producto y de calidad sobre la demo local, en escritorio de 1280 px y de 1440 px. Se corrigió lo evidente. Lo que cambia una regla, un texto legal o una decisión de negocio quedó como pregunta.

Rama: `cursor/campanas-v48-cff6`.

## Cobertura

Cada archivo HTML se abrió a 1280 px y a 1440 px. En esa pasada no hubo error de consola, ni `NaN`, ni `undefined` suelto, ni «Estado no definido». Las dos copias de `references/` son el historial del 13 de octubre: se abrieron y no se editaron.

| Archivo | Qué se recorrió |
| --- | --- |
| `backoffice.html` | Menú, pestañas y subpestañas de admin, líder, KAM y ejecutivo de cobranza. Detalle abajo. |
| `solicitud-paciente.html` | Solicitud completa y portal del paciente, con una cuenta demo local. |
| `registro-paciente.html` | Alta del paciente. |
| `registro-doctor.html` | Alta del doctor y perfil: datos, documentos, fiscal, procedimientos, pacientes, historial, enlace, pagos y embudo. |
| `login-paciente.html` | Entrada del paciente. |
| `login-doctor.html` | Entrada del doctor. |
| `verificacion-cuenta.html` | Verificación del paciente. |
| `verificacion-doctor.html` | Verificación del doctor. |
| `index.html` | Simulador, pestañas de cómo funciona, directorio y formulario de doctor no afiliado. |
| `faq.html` | Preguntas frecuentes. |
| `crm.html` | Correo CRM. |
| `crm-demo.html` | Abre el CRM dentro del backoffice. |
| `asistido-demo.html` | Captura asistida. |
| `terminos-condiciones.html` | Términos. |
| `aviso-privacidad.html` | Aviso de privacidad. |
| `references/original-onboarding/solicitud-paciente(20261013-110002).html` | Copia histórica. |
| `references/original-onboarding/registro-doctor(20261013-105758).html` | Copia histórica. |

### Backoffice por rol

En admin, a 1280 px y a 1440 px: Dashboard, CRM, Solicitudes de pacientes (Solicitudes y Ofertas), Pacientes, Solicitudes de doctores y clínicas, Doctores y clínicas, Revisión documental (Por revisar y Correcciones), Cartera (Resumen, Créditos, Pagos y movimientos, Calendario, Cobranza) y Configuración (Usuarios y grupos, CRM, Correo CRM, Valores por defecto y límites del crédito, Cartera con Pagos y liquidación, Prórrogas, Mora y cobranza y Dispersión, e Historial).

Expediente APP-PUL-1001: Resumen, Datos personales, Documentos, Buró, Oferta, Referencias, Contrato / firma, Dispersión y pagos (Resumen y dispersión, Pagos y amortización, Movimientos), Historial y Payload operativo.

CRM embebido, para admin, líder y KAM: Clientes y Proveedores, y dentro de cada uno Contactos, Tareas y Dashboard. En la barra también están Revisar identidad, Avisos, Sin asignar, Mis enlaces de referido, Enlaces de referido, MyPhone y Cargar ejemplos ficticios. No se cargaron los ejemplos ficticios.

Líder (`lider.kam@pulzzo.mx`) y KAM (`ana.kam@pulzzo.mx`) solo ven CRM. El título queda «CRM · Clientes».

Ejecutivo de cobranza (`cartera@pulzzo.mx`): Dashboard, Solicitudes de pacientes (Solicitudes y Ofertas), Pacientes y Cartera en sus cinco pestañas. No ve CRM, doctores ni Configuración.

### Solicitud del paciente

Con una cuenta demo verificada, en este orden: ubicación, procedimiento, estimación, identidad, ingresos, documentos y autorización de Buró.

En el procedimiento se eligió «Sí, es para mí», «No, es para alguien más» y «Aún no lo sé». También «Ya tengo doctor, clínica u hospital», «Quiero ver opciones Pulzzo» y «Aún no lo sé».

Identidad: INE, comprobante de domicilio y selfie, y el paso de revisión. Buró: el texto dice que es un prototipo, que no consulta Buró y que el código de prueba es 123456.

Portal, ya con la solicitud enviada y una oferta de ejemplo: Resumen, Datos personales, Documentos, Oferta y contrato e Historial. En oferta están Ver oferta, Aceptar oferta, Rechazar oferta y el estado de firma. La tabla de amortización dice que el calendario llega del backoffice y no calcula uno ilustrativo. Hay una notificación en el resumen. Los recibos de nómina están en el paso de documentos de un ingreso de nómina.

### Doctor

El alta muestra el registro del perfil, documentos y foto. El perfil, a 1280 px y a 1440 px: Datos médicos, Documentos, Fiscal y banco, Procedimientos, Pacientes interesados, Pacientes por operar, Historial, Mi enlace (enlace de referido y QR de demostración), Pagos y Embudo.

### Landing

El simulador se movió a $100,000. La mensualidad, el total y el monto del procedimiento salen con centavos. El directorio, al buscar «López» sin fichas publicadas, muestra el vacío previsto. El formulario de referido de un doctor no afiliado se envió con datos ficticios y respondió que la demostración no guarda ni contacta a nadie.

## 1. Corregido

### Pestañas del expediente, de Cartera, de configuración y del periodo

En el expediente, a 1280 px, la barra partía las palabras. Se leía «Resume / n», «Documento / s», «Bur / ó» y «Historia / l». La misma regla apretaba otras barras de pestañas.

Ahora la barra no parte palabras: si no caben, se desplaza de lado y cada pestaña conserva el nombre completo, a 36 px de alto. Aplica a expediente, perfil de paciente, Cartera, dispersión, buró, flujos, configuración y los botones Hoy / Semana / Mes / Año. Comprobado a 1280 px (la barra mide 877 px y el contenido 1050 px) y a 1440 px.

### Montos con dos decimales

En Solicitudes, expediente, dashboard y perfiles, un monto cerrado se veía como `$85,000` o `$136,000`, sin centavos. En Configuración, el ejemplo de límites decía `$10,000` y `$300,000`. En la solicitud del paciente, el mismo caso podía salir sin `.00`.

Esos montos visibles quedan con dos decimales: `$85,000.00`, `$136,000.00`, `$10,000.00 MXN` a `$300,000.00 MXN`. El aviso de «fuera de límites» en la oferta usa el mismo formato. Las tablas de Cartera ya lo tenían.

En el simulador de la landing, la mensualidad y el total ya tenían centavos y el monto del procedimiento no. Ahora ese monto, los extremos del control (`$10,000.00` y `$300,000.00`) y la tarjeta «Oferta estimada» también los llevan. Con $100,000 el resumen dice `$100,000.00`, mensualidad `$10,666.67` y total `$128,000.00`.

### Fechas en DD/MM/AAAA

El dashboard decía el periodo como `2026-10-01 a 2026-10-31`. En Cobranza, el próximo vencimiento, el último recordatorio, los recibos, los acuerdos y el historial de contacto mostraban la fecha al revés. La nota de una gestión de cobranza también.

La frase del periodo queda `01/10/2026 a 31/10/2026`. Esas fechas de Cobranza y de la nota de gestión quedan en día/mes/año. En Cartera, la próxima cuota, los pagos, el calendario, la cobranza y la fecha de una liquidación también. Lo que se guarda sigue en formato técnico; solo cambia lo que se lee. El calendario del navegador, en los campos «Desde» y «Hasta», sigue el formato del propio control.

En Ofertas, la columna «Vigencia registrada» decía `2026-06-09`. Ahora dice `09/06/2026`. La vigencia que ve el paciente en la oferta usa el mismo día/mes/año cuando el dato viene como `2026-11-30`. En Correcciones, la fecha pequeña decía `2026-05-29`; ahora dice `29/05/2026`. El calendario ilustrativo del paciente escribe sus fechas de ejemplo como `28/02/2026`. La tabla real del portal no inventa ese calendario: espera el corte del backoffice.

### Estado «Contrato firmado»

En Pacientes, Patricia Núñez y otros perfiles con contrato firmado decían «Estado no definido». La demo ya trataba ese estado como firmado; solo faltaba el nombre en pantalla.

El directorio muestra «Contrato firmado». Lo mismo ocurre con las claves `firmado` y `firmada`, que la app ya consideraba firma hecha.

## 2. Dudas para decidir

1. **El dashboard abre en el mes de hoy y por eso los montos se ven iguales.** En octubre de 2026, solicitado, aprobado y aceptado muestran `$136,000.00`. En proceso, rechazado y pago a doctor muestran `$0.00`. No es una suma duplicada: ese mes solo entran créditos de la demo que ya están aceptados. Las solicitudes de junio quedan fuera del mes.
   Recomendación: dejar el cálculo como está. Si quieres ver el embudo completo al entrar, el periodo inicial de la demo puede ser el año, no el mes.
   Ejemplo: hoy el mes dice `$136,000.00` aceptados y `$0.00` en proceso, aunque en junio sí hay solicitudes en revisión.

2. **El filtro «Aceptado» del directorio de pacientes no incluye a quien ya firmó.** El filtro busca la palabra «acept» en la clave interna. «Contrato firmado» no la contiene, así que Patricia no sale al elegir Aceptado.
   Recomendación: si «Aceptado» debe incluir contratos firmados, hay que sumar ese estado al filtro. Si solo significa «aceptó la oferta y aún no firma», dejarlo.
   Ejemplo: Patricia ya dice «Contrato firmado», pero el filtro Aceptado no la muestra.

3. **Las gráficas de Cartera abrevian el eje (`$85K`, `$1.2M`) y los atajos del simulador dicen `$30k`, `$60k`, `$100k` y `$150k`.** Las tablas y el resumen del simulador usan centavos.
   Recomendación: dejar la abreviatura en el eje y en los botones cortos, para que quepan, y los centavos en tablas, tarjetas y el resumen.
   Ejemplo: el botón dice `$30k` y, al pulsarlo, el resumen dice `$30,000.00`.

4. **Hay nombres de demostración que se leen mal.** En APP-PUL-1001 el doctor aparece como «Dr. igel Bonillas» y el titular como «ANA PAULA CACHO RUIZ CACHO RUIZ».
   Recomendación: corregir solo el texto si fue un error de captura, por ejemplo «Dr. Miguel Bonillas» y el nombre del titular una sola vez. No cambié los datos porque pueden ser a propósito para probar duplicados.
   Ejemplo: el resumen de Ana Sofía Martínez muestra «Dr. igel Bonillas».

5. **En CRM, «Exportar CSV» ocupa dos renglones, con las dos palabras enteras.**
   Recomendación: dejarlo. Forzar una sola línea obliga a reconstruir el CRM embebido.
   Ejemplo: el botón se lee «Exportar» y, debajo, «CSV».

6. **La pestaña Payload muestra el JSON tal cual, con `null` y fechas `2026-06-01`.**
   Recomendación: no maquillarlo. Es el dato técnico de la demo, no una pantalla para el paciente.
   Ejemplo: se ve `"preferredPaymentDay": null` y `"applicationDate": "2026-06-01"`.

7. **CRM abre sin clientes hasta que alguien pulsa «Cargar ejemplos ficticios».** La pantalla vacía no se rompe. No pulsé ese botón en esta pasada.
   Recomendación: dejar el vacío. Cargar ejemplos al entrar mezclaría datos de prueba sin que el usuario lo pida.
   Ejemplo: la primera visita dice cero clientes; después de cargar ejemplos aparecen los ficticios.

8. **Las preguntas frecuentes dicen «$10,000 MXN» y «$300,000 MXN» dentro de la frase del monto mínimo y máximo.** El mismo rango aparece en las opciones del formulario de doctor, escrito como «$10,000 – $30,000 MXN».
   Recomendación: no cambiar esas frases. Son texto comercial, no un monto calculado. Si se quieren centavos también ahí, hay que decidirlo aparte.
   Ejemplo: la pregunta «¿Cuál es el monto mínimo y máximo?» sigue diciendo `$10,000 MXN`.

9. **El inicio muestra `$0` junto a «COSTOS OCULTOS».**
   Recomendación: dejarlo. Es el lema de la portada, no un saldo.
   Ejemplo: la franja del héroe dice `$0` y, debajo, `COSTOS OCULTOS`.

## 3. Pendiente / no tocado

- No se disparó cada aviso ni cada notificación de CRM. La sección abre, Clientes y Proveedores cambian de vista, y el estado vacío no truena.
- No se cambiaron textos legales, permisos, etapas, SLA simulado ni la forma de calcular saldos, intereses o cobranza.
- El manifiesto de hashes de `VERSION.json` se dejó como está. La nota y el pie siguen en v53.
- Los controles de fecha del navegador siguen en el formato del control. Lo que se lee en frases y en tablas ya está en DD/MM/AAAA.
- Las copias de `references/original-onboarding/` se abrieron y no se modificaron.
