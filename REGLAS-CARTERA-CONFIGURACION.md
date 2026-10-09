# PULZZO · Reglas de Cartera y Configuración

## Alcance de esta revisión

Demo local con datos ficticios, sin banco, conciliación bancaria, autenticación de producción ni envío de mensajes. Cartera reutiliza el mismo crédito, calendario y registro de pagos del expediente; no crea un segundo saldo.

## Reglas conservadas

- **Amortización:** se puede elegir sobre monto global del crédito o sobre saldo insoluto. La selección se conserva por crédito; cambiar el valor predeterminado para créditos nuevos no sustituye tablas existentes.
- **Frecuencia:** mensual o quincenal, con los días y el calendario existentes. Se mantienen las fechas originales y las fechas reprogramadas por prórroga.
- **Pago ordinario:** se aplica a la cuota pendiente más antigua. Orden existente: interés ordinario, IVA de interés, interés moratorio, IVA de mora, comisiones, conceptos moratorios sin interés, conceptos ordinarios sin interés y capital. No se inventa una prelación nueva.
- **Pago parcial:** reduce solo los conceptos efectivamente cubiertos. Una cuota parcial vencida sigue identificada como vencida.
- **Adelanto de cuotas:** cubre cuotas futuras sin convertirlo en prepago a capital ni cambiar automáticamente el calendario.
- **Prepago a capital y liquidación anticipada:** disponibles inicialmente después de tres meses desde la dispersión. El prepago reduce el plazo, no el pago periódico contratado.
- **Prórrogas:** inicialmente 15 o 30 días en mensual y 15 en quincenal. La fecha de 30 días mensual y la quincenal siguen el patrón contractual de días de pago, no una suma arbitraria de días naturales.
- **Comisión de prórroga:** inicialmente el mayor entre 3% del capital diferido y $300 para 15 días; el mayor entre 5% y $500 para 30 días. Se agrega IVA de 16% a la comisión.
- **Requisito para prorrogar:** cubrir interés ordinario e IVA, mora existente e IVA y comisión de extensión e IVA. El capital pendiente se difiere. Debe capturarse el dinero realmente recibido y su referencia; una simulación no acredita un cobro.
- **Restricciones de prórroga:** no se extienden pagos iniciales, cuotas cerradas/programadas ni créditos liquidados. Se bloquea una segunda prórroga activa sobre la misma cuota. No se agrega un máximo global por crédito ni se promete cierre/cancelación de prórrogas aún no implementados.
- **Comisión de apertura:** upfront se cobra por separado antes de liberar la dispersión; financiada se incorpora al monto financiado. No se descuenta silenciosamente de la dispersión al proveedor.
- **Sobrantes:** se muestran como recibidos no aplicados. No se consideran capital amortizado ni se devuelven automáticamente.

## IVA y conservación de contratos

El demo separa IVA de interés ordinario, mora y comisión de extensión; nunca grava directamente el capital. No existe un interruptor para desactivar IVA por ser SOFOM.

Las ofertas nuevas/no aceptadas incorporan comisión de apertura base más IVA de 16%, con desglose persistido. Ejemplo: procedimiento de $100,000 y apertura de 3% → comisión base $3,000 + IVA $480. En modalidad financiada el monto financiado es $103,480; upfront el crédito mantiene $100,000 y el cobro previo es $3,480. Esto financia un impuesto sobre la comisión; no aplica IVA al capital del procedimiento.

Los créditos aceptados, firmados, dispersados o con pagos previos conservan sus condiciones registradas. Si la comisión histórica no desglosa IVA, se advierte la revisión pendiente; no se recalcula la deuda sin migración revisada y autorizada.

La base nominal demostrativa no implementa ni certifica la metodología fiscal de intereses reales del artículo 18-A. Antes de producción se requieren validación del acreedor, contrato, régimen, destino del crédito, base, momento de causación y CFDI por el responsable fiscal.

## Configuración y vigencia

La configuración muestra siete secciones: condiciones de producto; comisiones e impuestos; pagos y liquidación; prórrogas; mora y cobranza; dispersión; usuarios, permisos e historial.

Los parámetros conectados al motor tienen versiones, fecha de vigencia, vista previa y alcance: solo créditos nuevos, existentes y nuevos de forma prospectiva, o créditos seleccionados. Los valores predeterminados de amortización, frecuencia y comisión de apertura se limitan a créditos nuevos; cada oferta conserva su selección explícita. Valores iniciales del motor: amortización global, frecuencia mensual, apertura de 5% en modalidad upfront. La tasa y modalidad registradas en cada crédito tienen prioridad. La oferta guardada conserva los importes, el IVA, la frecuencia y la versión de configuración utilizada.

Cambiar condiciones para créditos existentes exige autorización explícita de demo y referencia justificativa. Las versiones se aplican a acciones nuevas, no reescriben cobros ni prórrogas ya registradas, ni recalculan retroactivamente contratos. Las capacidades no conectadas al motor se identifican como pendientes o solo lectura.

## Registro y controles

- Cada cobro nuevo tiene identificador, referencia, actor y desglose de aplicación. Recibido = aplicado + no aplicado.
- Los reintentos repetidos no deben duplicar el movimiento. Los importes inválidos se rechazan.
- La liquidación debe volver a validarse con fecha y saldo vigentes; una simulación vieja no basta para aplicar el pago.
- El reverso conserva el movimiento original, agrega un movimiento enlazado y exige motivo y permiso. No representa devolución bancaria. Las operaciones posteriores pueden impedir un reverso seguro.
- Si no se puede guardar localmente, se informa el fallo y no se presenta la operación como exitosa.
- Los permisos de la demo son controles de interfaz y manejadores locales; no sustituyen autorización segura de servidor.

## Cartera

- **Resumen:** cuatro indicadores principales: capital pendiente, importe vencido, recibido neto en el mes y próximos vencimientos a 30 días. Gráficas compactas y una lista de atención prioritaria llevan a los registros correspondientes; los conteos quedan como contexto secundario. El importe vencido es distinto del capital total de créditos que tienen atraso.
- **Créditos:** una fila por crédito en escritorio y tarjetas en móvil; por defecto se muestran dispersados activos y existe consulta de liquidados. Cliente y crédito encabezan la consulta; importes, próximo pago, vencido y estado quedan visibles. Los detalles secundarios se consultan en el expediente.
- **Pagos y movimientos:** recibos y aplicaciones del registro compartido, incluidos sobrantes y reversos enlazados.
- **Calendario:** una fila por cuota, fecha contractual/original y fecha vigente; las prórrogas no crean otra cuota duplicada.
- **Cobranza:** vencimientos, atraso, notas y siguiente acción manual. No contacta a nadie automáticamente.

## Uso de los nuevos controles

- Los filtros principales se mantienen compactos en escritorio. «Más filtros» revela opciones adicionales, las etiquetas muestran los filtros activos y «Limpiar» reinicia la consulta. En móvil, «Filtros» abre un panel con cierre y navegación de teclado.
- «Registrar pago» abre un panel lateral en escritorio y una pantalla completa en móvil. Conserva visibles el nombre y número de crédito exactos; no cambia el crédito seleccionado en otro expediente. Monto, tipo, fecha, método, referencia real y cuota alimentan el mismo motor de recibos existente.
- La distribución y el sobrante son una vista previa sobre una copia aislada del crédito. No guardan cobros, saldos ni auditoría. «Confirmar y registrar pago» valida y guarda mediante el registro compartido; al terminar vuelve a Cartera actualizada. Cancelar, cerrar o Escape descartan la captura. Si cambian datos, configuración o permisos, es necesario reabrir el panel.
- Los porcentajes de Configuración se capturan como porcentajes humanos: 3 significa 3%, convertido internamente a 0.03. La revisión previa muestra antes/después, vigencia, alcance y cantidad de créditos existentes afectados. Editar cualquier dato invalida la revisión y obliga a revisarla de nuevo antes de guardar.
- Los controles compactos de escritorio y los objetivos táctiles de 44 px en móvil conservan los colores y permisos previos. El pie de confirmación permanece separado del contenido desplazable del registro de pagos.

## Pendiente explícito

Devengo automático de nueva mora y configuración de su tasa; condonaciones operativas; reasignación o devolución de sobrantes; convenios de pago y recordatorios automáticos (segunda etapa); conciliación bancaria; backend y auditoría inmutable de producción; validación fiscal integral; migración autorizada de contratos históricos con desglose fiscal incompleto. No se modifican textos legales en esta revisión.
