# Revisión de Reports e IRPF — 7 septiembre 2026

La copia se descargó por SSH desde `5tb:/home/preda/FinanceApp`, rama `main`, HEAD `7ec41a8`, incluyendo los cambios sin commit y archivos de código nuevos. Se conserva el archivo original en `../financeapp-5tb-source.tar.gz`. El repositorio local anterior y el servidor no se han modificado. Esta carpeta es una instantánea de trabajo sin el historial Git remoto.

## Reports

- Corregidos los colores inválidos `hsl(var(--...))`: los tokens ya contienen valores OKLCH completos. Ejes y tooltips usan los tokens directamente, con color explícito para títulos y valores.
- Eliminados halos, degradados decorativos y el resumen de ingresos duplicado. Tarjetas neutras, tablas plegables, colores discretos y botón de actualización.
- Costes y pesos de cartera calculados con `totalCostBasisEur`; no se etiquetan importes USD como EUR. Se muestra indisponibilidad si falta la conversión.
- Distribución patrimonial: solo activos positivos valorados en EUR, identificado en pantalla; no suma divisas ni confunde activos brutos con patrimonio neto.
- Historial bancario separado por divisa. Filtros mensual/anual y tabla plegable. Error recuperable en lugar de carga infinita.
- Nóminas del ejercicio obtenidas con filtro anual y todas las páginas, excluyendo informes de cotizaciones.
- Fallos parciales identificados como datos no disponibles, sin saldos cero inventados.

## Impuestos

Corregidos:

- Escalas estatal y aragonesa separadas; el mínimo personal reduce la cuota mediante la escala, no la base antes de calcularla.
- Gasto general de trabajo de 2.000 €, limitado al rendimiento, y reducción del artículo 20 para rentas bajas.
- Remanente del mínimo personal aplicado al ahorro; compensación cruzada de pérdidas limitada al 25% y saldo no compensado visible.
- FIFO por coste unitario constante: vender parte de un lote no aumenta el coste unitario del resto. Conversión de comisiones a EUR y conservación de lotes de coste desconocido.
- Gastos de proyectos computados independientemente del orden de ingresos, también en el total anual.
- Una sola versión presentada por ejercicio: los borradores y declaraciones de otros países no sustituyen la española; las rectificativas no se suman al original.
- Retenciones operativas separadas de cifras declaradas. La estimación no mezcla un desglose incompleto con las retenciones de la declaración.
- No se presume exenta toda retribución flexible/en especie por el nombre del concepto. Los datos ambiguos, transferencias internas y lotes/conversiones incompletos requieren revisión antes de mostrar estimación.
- El formulario permite guardar el resultado final positivo, negativo o cero; vacío se conserva como desconocido.

### Alcance fiscal

Estimación limitada a **Aragón, ejercicio 2025**, tributación individual y mínimo básico de 5.550 € para menores de 65 años. No se trasladan estas reglas automáticamente a otros ejercicios o comunidades. El usuario aún no ha confirmado comunidad/ejercicio.

No es un cálculo completo de la declaración: faltan circunstancias familiares, discapacidad, otras reducciones y deducciones (incluida la deducción laboral de hasta 340 € de 2025), pérdidas pendientes de años anteriores, reglas de recompra, doble imposición y retenciones extranjeras, intereses/dividendos no registrados, régimen fiscal de autónomos y reconstrucción de transferencias entre intermediarios. El historial bancario reconstruye saldos a partir de movimientos importados, cuya integridad no se ha contrastado con extractos reales. No se ha consultado la base de datos personal ni contrastado una declaración real.

### Fuentes oficiales consultadas

- [Escala autonómica de Aragón 2025](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-general/gravamen-autonomico/comunidad-autonoma-aragon.html).
- [Escala estatal y aplicación del mínimo](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-general/gravamen-estatal.html).
- [Mínimo personal en ambas bases](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c15-calculo-impuesto-determinacion-cuotas-integras/introduccion/esquema-grafico-aplicacion-minimo-personal-familiar.html).
- [Gastos del trabajo](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c03-rendimientos-trabajo/rendimiento-neto-trabajo-integrar-base-imponible/esquema-general.html).
- [Reducción por rendimientos del trabajo](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-ayuda-presentacion/irpf-2025/7-cumplimentacion-irpf/7_1-rendimientos-trabajo-personal/7_1_6-reduccion-obtencion-rendimientos-trabajo.html).
- [Compensación de pérdidas](https://sede.agenciatributaria.gob.es/Sede/eu_es/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c12-integracion-compensacion-rentas/reglas-integracion-compensacion-rentas/integracion-compensacion-rentas-base-imponible-ahorro.html).
- [Deducción laboral 2025, todavía excluida de la estimación](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c18-cuota-liquida-resultante-autoliquidacion/deducciones-cuota-liquida-total/deduccion-obtencion-rendimientos-trabajo.html).

## Validación

- 31 pruebas pasan: 23 nuevas y 8 existentes, cubriendo estimador, agregación fiscal, schema, importes EUR y cartera.
- TypeScript de API y web, build de ambas y ESLint de los seis archivos frontend modificados pasan.
- Inspección en navegador con **datos ficticios** del componente real, en oscuro, claro y 390 px. Filtro anual y desgloses comprobados; inversión USD de 5.000 se presenta como 4.500 EUR, peso 17%, conforme al dato convertido de prueba.
- Capturas en `../reports-review/`; parche frente al código descargado en `../reports-review/changes.patch`.
- Vista local de comprobación: `http://127.0.0.1:5173/tmp/reports-preview.html`. El fixture vive en `apps/web/tmp`, excluido por Git, y no forma parte del bundle de producción.

Comandos: `pnpm test`, `pnpm --filter api build`, `pnpm --filter web build`. El ejecutor de pruebas usa Node/tsx; no necesita datos reales.
