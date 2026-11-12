# Revisión de movimientos sin categoría

En **Gastos → Sin categoría**, la tabla incluye gastos y devoluciones conciliados
de todo el historial de la divisa seleccionada. No incluye ingresos, traspasos,
liquidaciones de tarjeta ni movimientos futuros, excluidos o duplicados.

- Filtros independientes de cuenta/tarjeta, periodo y búsqueda de comercio.
- Páginas de 50 movimientos, con ajuste automático al vaciar la última página.
- Categoría en un desplegable por fila; guardado inmediato por la API existente.
- «Crear categoría…» permite categorías propias de hasta 80 caracteres.
- «Recordar» es opcional y desactivado inicialmente: crea una regla para otros
  cargos del mismo comercio, sin sustituir correcciones manuales.
- Un fallo conserva el movimiento para reintentar; solo el éxito lo retira.
- Las categorías disponibles combinan las habituales y las categorías del usuario.
- En móvil la tabla tiene desplazamiento horizontal dentro de su contenedor.

API autenticada: `GET /expenses/uncategorized`, parámetros `currency`, `account`,
`month`, `search`, `page` (desde cero), `limit` (1–100). Filtra el resultado de la
misma conciliación y clasificación que el resumen de gastos, siempre por usuario.
No requiere migraciones de base de datos.

Verificación: pruebas unitarias de filtros, devoluciones, paginación y no mutación;
integración HTTP con base aislada, aislamiento entre usuarios, edición de categorías
históricas/bancarias y conservación de saldos y gasto mensual; recorrido real de
navegador con datos ficticios, categoría nueva, regla por comercio, error de guardado,
búsqueda, paginación y vista móvil. Capturas en `output/playwright/uncategorized-*.png`.
