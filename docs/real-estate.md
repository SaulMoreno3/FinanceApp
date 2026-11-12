# Real Estate

Sección `/real-estate` para gestionar inmuebles en EUR con persistencia por usuario, diseño claro/oscuro y adaptación móvil.

## Uso

1. Añadir inmueble: nombre, fecha, precio (admite 0 €), impuestos y gastos de adquisición, reforma inicial y valor actual opcional.
2. Activar hipoteca si corresponde: principal, TIN, plazo, primera cuota y gastos iniciales. La entrada y el capital propio se calculan automáticamente.
3. Añadir periodos de alquiler con fechas inclusivas, renta mensual y día de cobro. Un piso admite un único tramo activo a la vez.
4. «Revisar renta» divide el tramo desde la fecha elegida; permite fijar una nueva renta o aplicar una variación porcentual sin cambiar los meses anteriores.
5. Registrar gastos puntuales, mensuales o anuales con fecha de inicio y fin opcional.
6. Consultar resumen, historial, recibos e hipoteca por ejercicio.

Los cobros automáticos dan por cobrados los vencimientos pasados, incluido el historial indicado. Los futuros quedan previstos. Cada recibo permite marcar impago (0 €), cobro parcial, fecha real o restaurar el comportamiento del tramo. No se emiten transferencias bancarias. Las recurrencias son deterministas y no requieren abrir la aplicación cada mes ni un cron que inserte duplicados.

## Cálculos

- Coste total = precio + impuestos + notaría + registro + agencia + reforma inicial + otros costes + gastos iniciales de financiación.
- Capital propio inicial = coste total − principal del préstamo.
- Resultado operativo = rentas previstas del ejercicio − gastos operativos del ejercicio.
- Flujo de caja previsto = resultado operativo − cuotas hipotecarias completas.
- Rentabilidad bruta = rentas previstas / precio de compra.
- Rentabilidad neta operativa = resultado operativo / coste total.
- Retorno sobre capital propio = flujo de caja previsto / capital propio inicial.
- Rentabilidad neta sobre valor actual = resultado operativo / valor actual estimado.

Los porcentajes corresponden al ejercicio seleccionado, sin extrapolar meses no alquilados. Se muestran antes del IRPF. Con denominador cero o ausente se muestra «No aplicable», nunca infinito: un piso gratuito sigue mostrando ingresos, gastos y caja, y puede medirse sobre su valor actual si se introduce.

Los meses incompletos se prorratean por días naturales inclusivos, con redondeo acumulativo al céntimo. La caja se atribuye a la fecha de cobro, incluso si pertenece a otro ejercicio. Los gastos recurrentes se consideran contabilizados en la fecha programada. El préstamo usa amortización francesa mensual con TIN constante, redondeo al céntimo y ajuste final; admite interés 0 %. El principal amortizado reduce caja y deuda, no el resultado operativo.

Referencias de las convenciones: [simulador hipotecario del Banco de España](https://clientebancario.bde.es/pcb/es/menu-horizontal/podemosayudarte/simuladores/simulador_prestamo_hipotecario_personal.html) y [rentabilidad bruta del alquiler, Bankinter](https://www.bankinter.com/banca/preguntas-frecuentes/hipotecas/saber-si-precio-compra-vivienda-es-correcto).

## Alcance

No calcula automáticamente impuestos de adquisición ni IRPF del alquiler: se introducen costes reales. Tampoco incluye hipotecas variables, amortizaciones extraordinarias, alquiler por habitaciones ni porcentajes de copropiedad. Los inmuebles, rentas e hipotecas se gestionan en este módulo; todavía no se sincronizan con Patrimonio, Transacciones, Deudas o el cálculo fiscal de Reports.

## API y base de datos

Ruta autenticada `/real-estate`: listado, alta, consulta, actualización, eliminación y `POST /:id/rent-change`. Cada agregado tiene dueño y versión; modificaciones simultáneas devuelven 409. La validación rechaza fechas inválidas, solapamientos, duplicados, recibos huérfanos y financiación superior al coste total. Revisar un periodo con cobros manuales afectados exige resolver esos cobros antes para preservar su historial.

Migración aditiva: `apps/api/prisma/migrations/20260907120000_add_real_estate/migration.sql`. Crea `real_estate_properties` con relación al usuario, JSONB validado en aplicación y versión. Antes de iniciar la nueva API en el entorno de destino:

```sh
pnpm --filter api prisma:generate
pnpm --filter api db:migrate
pnpm --filter api build
pnpm --filter web build
```

Usar la configuración de conexión del entorno correspondiente. Desplegado en 5tb el 7 de septiembre de 2026. Migración aplicada correctamente; API y web reconstruidas y verificadas en https://finance.saulmoreno.es. Copia previa de código y base de datos: `/home/preda/financeapp-backup-o6FZCqD8`. Imágenes de reversión: `financeapp-api:before-real-estate` y `financeapp-web:before-real-estate`.

## Verificación realizada

- Suite completa: 63 pruebas aprobadas (50 API, 13 web), incluidas 22 de cálculo inmobiliario y 10 de integración contando el contenedor del grupo.
- Integración con HTTP, JWT, Prisma y PostgreSQL aislado: persistencia, autenticación, separación por usuario, revisiones históricas, validaciones, conflicto de versiones y eliminación.
- TypeScript y compilación de API/web correctos; ESLint de los archivos frontend afectados correcto.
- Navegador: alta de piso gratuito, fecha histórica, renta de 800 €, subida del 5 % desde julio, comunidad de 50 €/mes y persistencia tras recarga. Resultado 2026: 9.840 € rentas, 9.240 € resultado operativo, 7,7 % sobre valor actual de 120.000 €; cobrado al 7 de septiembre: 7.320 €.
- Inspección de hipoteca: 120.000 €, 3 %, 300 meses → cuota inicial 569,05 €.
- Inspección visual en claro y oscuro; vista móvil de 390 px sin desbordamiento horizontal de la página.

Las pruebas de integración se omiten si falta `REAL_ESTATE_TEST_DATABASE_URL`. Sólo admiten host local y base `financeapp_review`; nunca deben apuntar a datos reales. La vista `http://127.0.0.1:5173/tmp/real-estate-preview.html` usa datos ficticios en una base efímera separada.
