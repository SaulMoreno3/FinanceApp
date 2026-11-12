# Fecha salarial estimada

La planificación identifica el empleador de la nómina válida más reciente y busca sus abonos bancarios contabilizados en EUR. Excluye bases de cotización, pagos futuros, entradas de inversión/cambio de divisa y traspasos clasificados. Si no hay empleador reciente, solo considera un único grupo identificado explícitamente como nómina/salario en el banco. Las fechas de emisión de los documentos no se utilizan como fechas de cobro.

Se requieren al menos tres pagos, meses consecutivos y un último pago dentro de los últimos 60 días. Los cobros múltiples dentro de un periodo se consideran ambiguos. Se comparan días de mes y fin de mes; un ajuste a viernes/lunes solo se admite si hay al menos dos fines de semana que lo respaldan. No se infieren festivos. Se informa de confianza, evidencia y margen histórico, sin prometer la fecha futura.

La propuesta precarga nombre, último importe bancario, próxima fecha y pauta mensual. Un periodo ya cobrado antes de su fecha habitual no vuelve a pronosticarse. El usuario sigue pudiendo revisar el importe y confirmar la inclusión; si ya hay ingresos activos, se avisa para evitar duplicarlos. No se escribe automáticamente una nómina nueva ni se cambia un ingreso manual.

El campo JSON opcional `salarySchedule` guarda día nominal, ajuste de fin de semana y mes de anclaje. Las recurrencias anteriores conservan su calendario. Editar fecha, tipo o frecuencia en el formulario desactiva la pauta inferida y respeta el calendario manual. El esquema verifica que el primer vencimiento coincide con la pauta. No requiere migración SQL.

Pruebas: cobros reales frente a fechas de nómina, cambio de empleador, datos insuficientes/antiguos, traspasos y pendientes, pagos extra ambiguos, fin de mes, fines de semana, periodos ya cobrados y persistencia del calendario.
