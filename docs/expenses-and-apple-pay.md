# Gastos, crédito y Apple Pay

La nueva sección se encuentra en `/expenses`. Los saldos y movimientos bancarios siguen disponibles en Bancos; Gastos analiza las compras por su fecha, tarjeta, comercio y categoría.

Desde el 11/11/2026, los pagos autenticados del iPhone se contabilizan al recibirse,
sin esperar al banco ni a que se asocie la tarjeta. Consulta los detalles actuales
de Pluxee, disponible, presupuestos y categorías en [Gastos confirmados](confirmed-spending-20261111.md).

## Puesta en marcha

1. Abre **Gastos → Conectar iPhone**. Prueba **Autorizar consulta de tarjetas** si quieres que el banco entregue el detalle de crédito. Debes completar el consentimiento en el banco; algunas entidades o productos no ofrecen ese permiso. Cancelar el proceso conserva la conexión anterior de cuentas.
2. Si el banco devuelve una tarjeta, úsala. Si no, añade una tarjeta manual. Para débito, vincúlala a la cuenta de cargo; para crédito, introduce la deuda total al cierre de una fecha o deja el saldo como desconocido. El límite de crédito no es el saldo pendiente.
3. Crea una clave para tu iPhone. Por defecto, **Una sola clave para todas mis tarjetas** exige enviar `card` en cada pago. Las claves antiguas mantienen su alcance de una tarjeta hasta que su propietario pulsa **Usar con todas mis tarjetas**. La clave se muestra una sola vez, se guarda únicamente su hash y se puede revocar; no permite iniciar sesión ni leer datos.
4. Sigue la guía de Atajos incluida en la pantalla. Comprueba una compra real antes de confiar en la automatización.
5. Importa el histórico de la tarjeta desde **Extractos**. Cuando el banco y la tarjeta manual representan el mismo producto, la opción **Unificar tarjetas** conserva sus compras, extractos y claves y utiliza el saldo del banco. La ficha manual duplicada se retira; no se eliminan sus movimientos.

## Automatización en iPhone

En **Shortcuts → Automation → + → Transaction**, selecciona tus tarjetas y **Run Immediately**. Con una clave antigua de alcance CARD, selecciona únicamente su tarjeta. La automatización se configura en el iPhone; el servidor no puede instalarla ni conceder sus permisos remotamente.

Acciones:

1. **Date → Current Date**.
2. **Format Date → Custom**, con `yyyy-MM-dd'T'HH:mm:ss.SSSXXX`. Su resultado **Formatted Date** se usa en `date` y `eventId`, sin instalar acciones de terceros. La unicidad queda limitada a una tarjeta por milisegundo; un identificador nativo del pago o UUID estable sería preferible si está disponible.
3. **Get Contents of URL**, método **POST** y **Request Body → JSON**.

Dirección en producción: `https://finance.saulmoreno.es/api/expenses/capture`.

Cabecera: `Authorization: Bearer TU_CLAVE_DE_CAPTURA`.

| Campo JSON | Tipo | Valor |
| --- | --- | --- |
| `eventId` | texto | Variable Formatted Date; conservarla en reintentos |
| `date` | texto | Fecha ISO 8601 del evento, con zona horaria |
| `amount` | número | Importe positivo de la entrada del atajo |
| `currency` | texto | Divisa real del importe, por ejemplo `EUR` |
| `merchant` | texto | Comercio de la entrada del atajo |
| `card` | texto | Shortcut Input → Card; nombre de la tarjeta, obligatorio con alcance WALLET |
| `type` | texto | `PURCHASE`; `REFUND` para una devolución registrada expresamente |

En amount, merchant y card, selecciona **Shortcut Input** y vuelve a tocar la variable para seleccionar **Amount**, **Merchant** o **Card**. No escribas el nombre de la variable como texto fijo ni envíes el objeto Transacción completo. No se necesita número completo de tarjeta, PIN ni credenciales bancarias.

### Tarjetas desconocidas: conservar primero, vincular después

Cada nombre recibido se guarda por usuario y divisa. Solo se normalizan mayúsculas, anchura Unicode y espacios: no se hacen coincidencias aproximadas ni se deduce crédito/débito. Si dos tarjetas envían exactamente la misma etiqueta, Atajos debe enviar un identificador distinto; Finance no puede distinguir información que no recibe.

La primera captura de un nombre desconocido devuelve HTTP 201 con `status: RECORDED`, `needsCardLink: true`, `walletCardId` y `duplicate: false`. El pago ya está incluido en el gasto. Asocia ese nombre con su tarjeta real para precisar su saldo y origen del dinero. La asociación conserva las categorías y no vuelve a sumar la compra. No se permite cambiar silenciosamente una vinculación ya utilizada.

Los siguientes pagos devuelven `status: RECORDED` y su `cardId`. No es necesario conocer ni enumerar todas las tarjetas antes del primer pago. El servidor no crea tarjetas ficticias de crédito ni inventa saldo inicial. Una unificación manual/proveedor conserva también las etiquetas de Wallet.

Si Atajos no ofrece la divisa, se puede fijar para pagos en esa moneda; ese atajo no debe utilizarse para compras en otra divisa. La API rechaza divisas distintas de la tarjeta. Para un pago en moneda extranjera se necesita el importe liquidado en la moneda de la tarjeta, que se obtiene del banco/extracto.

Reintentos: conserva exactamente el mismo eventId, fecha, importe, comercio, tipo y card hasta recibir confirmación. La API devuelve `duplicate: true` al repetir el evento, incluso si la tarjeta se vinculó después de recibirlo. Reutilizar un identificador con otros datos devuelve 409. Las capturas admiten eventos de los últimos siete días; los pagos ya guardados pueden vincularse más tarde.

Las automatizaciones de pago sin contacto no equivalen a leer todo Wallet. No recuperan histórico y no se presupone cobertura de tarjeta física, suscripciones, compras online ni pagos desde Apple Watch. Si no hay conexión, el atajo sencillo puede fallar; revisa el error y completa con el extracto. No se promete una cola sin conexión que no exista.

## Extractos CSV

Se ofrece plantilla descargable, pegado de texto, carga de archivo, vista previa y confirmación. Se admite hasta 1,5 MB y 5.000 movimientos por archivo. No se interpretan PDFs automáticamente; es necesario convertir la tabla a CSV si el emisor solo entrega PDF.

```csv
date,description,amount,currency,id,type
2026-11-02,Mercadona,-35.20,EUR,compra-001,purchase
2026-11-03,Devolucion tienda,5.20,EUR,devolucion-001,refund
2026-12-01,Payment,30.00,EUR,pago-001,repayment
```

Compras/comisiones negativas; devoluciones y pagos de la tarjeta positivos. Se aceptan encabezados en inglés/español, fechas ISO o DD/MM/AAAA, comas o punto y coma y comillas CSV. Solo movimientos confirmados y una divisa por tarjeta/archivo. Los traspasos y tipos ajenos al extracto de tarjeta se rechazan.

Los movimientos de efectivo identificados expresamente admiten el tipo CSV `cash transfer`: afectan al saldo de crédito, pero no al consumo. Una retirada con comisión desglosada se separa en principal de efectivo y comisión (gasto). No se considera que todo el efectivo retirado ya esté gastado ni se inventa un saldo actual de caja.

Las importaciones revisadas de capturas de pantalla pueden guardarse como `MANUAL` y `provisional=true`, sin atribuirlas a Apple Pay. Se incluyen provisionalmente en gasto, aparecen en Revisión y se concilian como las capturas de Apple Pay cuando llega una compra confirmada inequívoca. Los PDF originales y el manifiesto de extracción se conservan aparte; un CSV de auditoría no sustituye los indicadores de origen/provisionalidad.

Los pagos de tarjeta parciales, anticipados o manuales se concilian con su cargo bancario de signo contrario, misma divisa e importe, diferencia máxima de dos días y descripción de pago de tarjeta (o `To EUR` en ambos lados). La coincidencia debe ser única en ambos sentidos. Un pago conciliado sigue reduciendo la deuda de la tarjeta y su cargo bancario se trata como traspaso, sin sumar otro gasto. Esto no depende de que el importe coincida con el saldo del extracto mensual. Una cuota futura no reduce la deuda de hoy.

Conviene conservar los identificadores originales del emisor. Si faltan, se derivan de fecha, importe, comercio, tipo y ocurrencia repetida en el archivo: repetir el mismo extracto no lo duplica y dos compras idénticas en él se conservan. Sin identificadores, exportaciones parciales solapadas de compras idénticas son ambiguas; revisa esos casos y utiliza periodos completos estables.

## Conciliación y cálculos

- Apple Pay recibido con la clave del propietario cuenta como confirmado. La consulta bancaria es opcional. Solo las capturas manuales de documentos mantienen su indicador provisional.
- Una coincidencia automática exige misma tarjeta, tipo, importe firmado, comercio normalizado y hasta siete días de diferencia. También exige correspondencia uno a uno. Dos compras parecidas no se fusionan automáticamente.
- Cuando cambia el nombre del comercio, **Revisión** permite asociar expresamente la captura con una compra confirmada del mismo importe y tarjeta. Se guardan ambos registros. Una captura errónea puede excluirse y restaurarse.
- Una compra de débito se sustituye por el movimiento de su cuenta cuando la coincidencia es inequívoca.
- Una devolución reduce el gasto; no se transforma en nómina u otro ingreso.
- El pago mensual de la tarjeta no vuelve a ser una compra. En Gastos se muestra por separado el importe de recibos sin desglose para indicar que la cobertura es incompleta.
- Para conciliar un recibo, importa todo su periodo y confirma fechas, vencimiento y total. El total de compras confirmadas menos devoluciones debe coincidir exactamente. Se enlaza un único recibo bancario reconocido, de misma divisa e importe y próximo al vencimiento. Los periodos de extracto no pueden solaparse.
- La conciliación de extractos inicial cubre tarjetas pagadas íntegramente. Deuda arrastrada, pago parcial, intereses sin detalle o cargos con importe distinto permanecen para revisión.
- La planificación conserva provisionalmente el recibo como aproximación histórica hasta conciliarlo y señala los pendientes. Después utiliza el detalle. La mediana de gasto puede ser poco representativa mientras falten extractos o haya capturas sin conciliar.
- El crédito pendiente conocido se resta de la liquidez destinada a planificación y se incluye en los pasivos del patrimonio. Se parte del saldo bancario de la tarjeta o de una referencia manual de cierre; no se suma el límite de crédito como dinero disponible. Los saldos desconocidos generan una advertencia, nunca una deuda ficticia de cero.
- Los importes en otras divisas se analizan por separado. No se inventa una conversión para sumarlos a EUR.

## API y mantenimiento

La API de gestión exige la sesión habitual: `/expenses`, `/accounts`, `/cards`, `/tokens`, `/tokens/:id/scope`, `/wallet-cards/:id`, `/import/preview`, `/import`, `/statements`, `/review`, `/matches`, `/category`, `/budget`. Solo `POST /expenses/capture` acepta la clave limitada de Atajos. Cambiar el alcance o vincular tarjetas requiere sesión del propietario; una clave de captura no puede hacerlo. Todos los accesos se restringen al propietario y las escrituras/conciliaciones se serializan por usuario mediante una transacción PostgreSQL. El cuerpo no admite userId ni cardId arbitrarios. Una clave CARD no puede cambiar de tarjeta enviando otro nombre.

La sincronización bancaria intenta el recurso separado `/data/v1/cards`. La falta del permiso, una entidad incompatible o un fallo temporal se muestran como estados diferenciados y no convierten en fallida la sincronización de cuentas. El consentimiento ampliado solo se solicita al pulsar la opción explícita de tarjetas.

Migraciones: `20261109110000_add_expense_tracking` y `20261110110000_add_wallet_card_capture`. La segunda añade el alcance (CARD por defecto) y dos tablas de bandeja/etiquetas. Ambas son aditivas; no reclasifican ni borran el historial previo. La vuelta atrás de código puede dejar las nuevas columnas/tablas sin uso; no se deben borrar las capturas pendientes para revertir.

`20261110130000_support_statement_cash_and_provisional` añade el indicador de captura provisional y el tipo TRANSFER para efectivo. No borra movimientos existentes. Las importaciones de historial verificadas pueden ejecutarse con `src/scripts/import-verified-credit-history.ts`: por defecto solo hacen una vista previa; la escritura exige `--commit`, el propietario y la tarjeta esperados, y un manifiesto validado. `--verify-local` prueba la importación dos veces y sus métricas únicamente en la base local de integración.

Pruebas: `pnpm --filter api test`, `pnpm --filter api build`, `pnpm --filter web test`, `pnpm --filter web build`. La integración HTTP requiere una base aislada llamada `financeapp_expenses_test` en `127.0.0.1:55449`, API en `3119` y `EXPENSES_INTEGRATION=true`; las pruebas rechazan otro destino. `src/scripts/seed-expenses-demo.ts` ofrece datos visuales únicamente en esa base local.

Fuentes consultadas: [Apple: activador de transacciones](https://support.apple.com/es-us/guide/shortcuts/apd65c67538a/ios), [Apple: peticiones web desde Atajos](https://support.apple.com/en-mt/guide/shortcuts/apd58d46713f/ios), [TrueLayer: cuentas y tarjetas](https://docs.truelayer.com/docs/account-and-card-data), [Revolut: extractos de crédito](https://help.revolut.com/es-ES/help/credit-products/credit-cards/credit-card-statements/).
