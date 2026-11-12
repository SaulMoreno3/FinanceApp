# Gastos confirmados y retribución flexible

Los pagos autenticados del iPhone se contabilizan al recibirse. No requieren
confirmación bancaria y no se ocultan aunque aún falte asociar su tarjeta.
Una asociación posterior conserva la categoría y no duplica el gasto.

El tipo FLEXIBLE mantiene separados el consumo y saldo de retribución flexible
del dinero bancario y del crédito. El saldo debe indicarse expresamente; una
nómina no acredita cuánto dinero permanece disponible en una tarjeta.
Las recargas son idempotentes y no generan ingresos nuevos ni gastos.

Las etiquetas ambiguas de Wallet no identifican por sí solas crédito o débito.
La categoría se calcula por corrección individual, regla del propietario,
categoría específica de origen o comercio identificado, en ese orden. Los
nombres ambiguos permanecen pendientes de revisión.

El disponible descuenta crédito conocido, débitos posteriores al saldo,
reserva prudente de pagos sin asociar, próximos compromisos y reserva personal.
No incorpora Pluxee, inversiones o nóminas futuras. Se muestra como estimación
cuando faltan saldos o hay financiación sin identificar.

Los presupuestos sugeridos usan la mediana de hasta tres meses previos con
datos y requieren confirmación. El mes actual se compara contra los mismos
días del anterior. Tener movimientos no acredita que un periodo esté completo.
