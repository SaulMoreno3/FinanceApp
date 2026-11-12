# Taxes: revisión del IRPF y ayuda de Zaragoza — 9 septiembre 2026

Alcance: Aragón 2025, declaración individual, persona soltera sin hijos, menor de 65 años, sin discapacidad ni ascendientes a cargo. No se extrapolan reglas a 2026. Se revisaron el estimador y la agregación de nóminas, proyectos, FIFO, dividendos/intereses y declaraciones presentadas.

## Resultado y cambios de comportamiento

Las escalas estatal y autonómica, mínimo personal aplicado en cuota, reducción art. 20 y compensación cruzada del ahorro del 25% coinciden con las reglas verificadas. Se conserva su implementación y las pruebas anteriores.

- La cuota del ahorro ahora redondea por separado los componentes estatal y autonómico; puede variar un céntimo respecto a redondear el total conjunto.
- Se incorpora la deducción laboral DA 61 de 2025, hasta 340 €, decreciente desde 16.576 hasta 18.276 € de ingreso bruto, con límite de otras rentas de 6.500 € y de cuota atribuible al trabajo. Se requiere confirmación expresa de trabajo efectivo y datos anuales completos. No se aplica a registros de pensiones/desempleo por defecto. Con reducciones adicionales de base no se aplica automáticamente: su atribución requiere un cálculo fiscal más amplio. La pantalla pasa cero para esas reducciones. La confirmación es local y no persiste.
- Desglose de cuotas estatal, aragonesa y del ahorro, reducción laboral, impuesto antes/después de la deducción y retenciones. Guardas frente a importes incompletos, no finitos o negativos en campos no admitidos.
- Popup accesible con escala marginal conjunta derivada de los mismos datos que usa el cálculo, mínimo, pasos, ejemplo, ahorro, supuestos y enlaces AEAT. No se duplica una tabla fiscal independiente.

## Conservación y límites

Comparación inicial byte a byte de los archivos de Taxes locales contra la instantánea SSH del servidor: sin diferencias. Parche acotado sobre esa instantánea; no se modifican las bases de datos, las declaraciones guardadas ni los datos operativos. Conservados dividendos/intereses, FIFO, avisos que bloquean estimaciones incompletas, autoridad de la declaración presentada y formularios de documentos. No se cambian Reports, Planning, GeoGuessr, préstamos ni ventas pendientes de conversión.

La revisión no convierte el estimador en un programa completo de declaración: quedan fuera deducciones autonómicas, doble imposición, pérdidas anteriores, alquileres/imputaciones de inmuebles, regímenes completos de autónomos y recompra de valores. Esos límites aparecen en el popup. Los registros con avisos siguen sin mostrar una devolución/pago aparentemente fiable.

## Fuentes oficiales contrastadas

- AEAT, escala general estatal: https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-general/gravamen-estatal.html
- AEAT, Aragón: https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-general/gravamen-autonomico/comunidad-autonoma-aragon.html
- AEAT, ahorro (ambas escalas): https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-ahorro.html
- AEAT, mínimo personal: https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c14-adecuacion-impuesto-circunstancias-personales/minimo-contribuyente.html
- AEAT, reducción laboral: https://sede.agenciatributaria.gob.es/Sede/eu_es/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c03-rendimientos-trabajo/rendimiento-neto-trabajo-integrar-base-imponible/fase-3-determinacion-rendimiento-neto-reducido.html
- AEAT, deducción laboral: https://sede.agenciatributaria.gob.es/Sede/eu_es/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c18-cuota-liquida-resultante-autoliquidacion/deducciones-cuota-liquida-total/deduccion-obtencion-rendimientos-trabajo.html

## Validación

18 pruebas frontend, incluidas 5 nuevas de deducción laboral, redondeo y continuidad de tramos; build web y ESLint de archivos modificados correctos. Prueba visual local del componente real con datos ficticios; el fixture no forma parte del despliegue.
