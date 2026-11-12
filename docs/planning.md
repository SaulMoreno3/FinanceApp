# Mi planificación

Ruta `/planning`, accesible desde la navegación principal. No añade funciones de gastos compartidos.

- Gastos: movimientos bancarios contabilizados, categorías corregibles, principales comercios, evolución de seis meses y comparación con el mismo tramo del mes previo. Los ingresos son entradas bancarias, no se suman de nuevo las nóminas o alquileres de otros módulos. Pendientes y otras monedas no entran en el total EUR.
- Suscripciones: propuestas por comercio normalizado, moneda, regularidad temporal e importe. Mínimo tres cobros para recurrencias semanales/mensuales/trimestrales y dos anuales; se muestran cobros de evidencia y cambios de importe. Confirmación, descarte reversible, alta manual, edición e inactivación. No cancela contratos externos. La detección analiza hasta 800 días de historial disponible.
- Caja: saldos bancarios persistidos menos una reserva configurable. Previsión a 90 días con recurrencias confirmadas, gasto variable y calendarios opcionales de préstamos/pisos. No da por pagadas cuotas vencidas. Las rentas prepagadas no se cuentan nuevamente por el importe ya recibido. Se muestran fechas y límites del saldo inicial. No incluye el fondo virtual bancario basado en una constante global.
- Pisos: reutiliza el motor existente de Real Estate; diferencia beneficio operativo de caja tras la hipoteca, costes, meses sin renta prevista y rentabilidades. Un denominador cero sigue produciendo un porcentaje no calculable, no infinito. No modifica los contratos ni el cálculo fiscal.
- Pendientes: saldos antiguos, posibles duplicados del mes seleccionado, operaciones sin FX registrado, nóminas dudosas, cuotas vencidas y cierres que han cambiado. Marcar revisado conserva el dato original.
- Cierre mensual: solo meses terminados, copia del análisis bancario y huella de movimientos/clasificaciones. El patrimonio y la deuda se guardan a fecha de revisión, sin simular un saldo histórico que no existe. Una nueva revisión reemplaza la anterior; no es un libro contable inmutable.

## Persistencia y seguridad

`finance_plans` contiene un documento validado por usuario y versión. Las escrituras comparan versión para no sobrescribir otra pestaña. Todas las lecturas y escrituras se limitan al usuario autenticado. Las clasificaciones verifican además la propiedad y el signo del movimiento. `finance_month_closings` tiene clave compuesta usuario/mes. La migración solo añade estas dos tablas; no cambia movimientos, préstamos, ventas ni nóminas existentes.

## Límites del análisis

Los traspasos se excluyen cuando hay una pareja inequívoca entre cuentas propias y una descripción compatible, o un indicador explícito de traspaso interno/fondos. La clasificación manual prevalece. Cobros repetidos pueden ser recibos en vez de suscripciones: siempre requieren revisión. La ausencia de datos no demuestra ausencia de gasto. Para historiales de más de 50.000 movimientos se devuelve un error explícito, sin publicar un total truncado.

No dupliques una hipoteca entre Deudas y Real Estate ni un gasto variable dentro de una recurrencia; los interruptores permiten elegir las fuentes. La previsión comienza mañana y no constituye una garantía. Las otras monedas se muestran separadas. El patrimonio mantiene el alcance ya existente en Net Worth.

## Validación

`pnpm test`, compilaciones API/web y ESLint de los componentes nuevos. Pruebas unitarias de periodicidad, falsos positivos, monedas, traspasos, fin de mes/año bisiesto, reservas, huellas y validación. La prueba HTTP opcional requiere `PLANNING_INTEGRATION=true`, una API local en `localhost:3109` y una base aislada llamada `financeapp_test` en `127.0.0.1:55439`; crea y elimina exclusivamente sus usuarios ficticios. Usar `prisma db push` en una base nueva de pruebas: el historial de migraciones anterior presenta una dependencia ausente en `clear_getquin_conversions` al arrancar desde cero; no se ha reescrito ese historial.

## Conservación

Comparación contra la copia del servidor del 9 de septiembre. Las únicas integraciones en archivos existentes son añadir la ruta autenticada, la ruta web, una entrada de navegación y las relaciones/modelos de las dos tablas. Los módulos existentes de banca, patrimonio, fiscalidad, préstamo y Real Estate se conservan; el nuevo servicio los consulta. No se modifican el registro privado, las contraseñas mínimas ni los volúmenes de documentos.
