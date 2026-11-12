import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ARAGON_BANDS, PERSONAL_MINIMUM, SAVINGS_BANDS, STATE_BANDS } from './tax-estimator';

const amount = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);
const percent = (value: number) => `${amount(value * 100)} %`;
const limits = [...new Set([...STATE_BANDS, ...ARAGON_BANDS].map(([limit]) => limit))].sort((a, b) => a - b);
const interval = (from: number, to: number) => to === Infinity ? `Más de ${amount(from)} €` : `${amount(from)} – ${amount(to)} €`;
const manual = 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/';

export default function TaxInfoDialog() {
    return <Dialog>
        <DialogTrigger asChild><Button variant="outline"><Info className="mr-2 h-4 w-4" />Tabla IRPF · Zaragoza</Button></DialogTrigger>
        <DialogContent className="max-h-[88dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto text-foreground">
            <DialogHeader className="pr-5 text-left">
                <DialogTitle>IRPF en Zaragoza · Ejercicio 2025</DialogTitle>
                <DialogDescription>Rentas de 2025, declaración en 2026. Residencia fiscal en Aragón, declaración individual, persona soltera y sin hijos.</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">El cálculo presupone menos de 65 años, sin discapacidad ni ascendientes a cargo. Mínimo personal: <strong className="text-foreground">{amount(PERSONAL_MINIMUM)} €</strong>. Otras circunstancias pueden cambiar el resultado.</p>
            <section className="space-y-3">
                <h3 className="font-semibold">Tramos de la base liquidable general</h3>
                <p className="text-sm text-muted-foreground">Cada porcentaje se aplica solo a la parte de renta que cae en ese tramo. No es el porcentaje de retención de tu nómina ni se aplica entero al salario bruto. Zaragoza utiliza la escala de Aragón junto con la estatal.</p>
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-left text-xs sm:text-sm">
                        <caption className="sr-only">Tipos marginales estatales y de Aragón, sumados en los puntos donde cambia cualquiera de las escalas</caption>
                        <thead className="bg-muted text-muted-foreground"><tr><th scope="col" className="p-2 sm:p-3">Base anual</th><th scope="col" className="p-2">Estado</th><th scope="col" className="p-2">Aragón</th><th scope="col" className="p-2">Total</th></tr></thead>
                        <tbody>{limits.map((limit, index) => {
                            const state = STATE_BANDS.find(([upper]) => upper >= limit)![1];
                            const regional = ARAGON_BANDS.find(([upper]) => upper >= limit)![1];
                            return <tr key={limit} className="border-t"><th scope="row" className="p-2 font-normal sm:p-3">{interval(index ? limits[index - 1] : 0, limit)}</th><td className="p-2 whitespace-nowrap">{percent(state)}</td><td className="p-2 whitespace-nowrap">{percent(regional)}</td><td className="p-2 font-medium whitespace-nowrap">{percent(state + regional)}</td></tr>;
                        })}</tbody>
                    </table>
                </div>
                <p className="text-xs text-muted-foreground">Los límites son continuos: al superar un límite, solo el exceso entra en el siguiente tramo. Estar soltero y no tener hijos afecta a las circunstancias personales, no crea una escala distinta.</p>
            </section>
            <section className="space-y-2 text-sm">
                <h3 className="font-semibold">Cómo se calcula la estimación</h3>
                <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
                    <li>Del salario bruto se restan las cotizaciones, los gastos fiscalmente deducibles y hasta 2.000 € de gasto general de trabajo. Se aplica la reducción por rendimientos del trabajo si corresponde.</li>
                    <li>Se obtiene la base general, incorporando el beneficio de actividades económicas. Se calculan las cuotas estatal y autonómica por separado.</li>
                    <li>Se resta la cuota correspondiente al mínimo personal; no se restan 5.550 € del salario antes de aplicar los tramos. El mínimo que sobre pasa al ahorro.</li>
                    <li>Se suma el impuesto del ahorro, se resta la deducción laboral confirmada y, al final, las retenciones y pagos a cuenta. Positivo: a pagar. Negativo: a devolver.</li>
                </ol>
                <p className="rounded-lg bg-muted p-3">Ejemplo: 40.000 € brutos y 2.600 € de Seguridad Social, sin otras rentas ni deducciones → base general de 35.400 € → cuota de 7.692,14 €. Con 7.500 € retenidos: aproximadamente 192,14 € a pagar.</p>
            </section>
            <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">Dividendos, intereses y ganancias · Base del ahorro</summary>
                <table className="mt-3 w-full text-left"><caption className="sr-only">Escala conjunta del ahorro de 2025</caption><thead><tr><th scope="col" className="py-2">Base anual</th><th scope="col">Tipo total</th></tr></thead><tbody>{SAVINGS_BANDS.map(([limit, rate], index) => <tr key={limit} className="border-t"><td className="py-2">{interval(index ? SAVINGS_BANDS[index - 1][0] : 0, limit)}</td><td>{percent(rate)}</td></tr>)}</tbody></table>
                <p className="mt-2 text-muted-foreground">Las pérdidas de una categoría compensan como máximo el 25 % del saldo positivo de la otra. No se incluyen saldos pendientes de otros ejercicios.</p>
            </details>
            <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">Deducción laboral y alcance</summary>
                <p className="mt-3 text-muted-foreground">En 2025, hasta 340 € por trabajo efectivo por cuenta ajena: importe completo hasta 16.576 € brutos; después disminuye en 0,20 € por cada euro adicional hasta 18.276 €. Las demás rentas no pueden superar 6.500 €. Se limita a la cuota atribuible al trabajo y no genera devolución por sí sola.</p>
                <p className="mt-2 text-muted-foreground">Puedes incluirla en el desglose anual confirmando que todo el ingreso de trabajo corresponde a servicios laborales efectivos y que los datos del año están completos. No se presume que pensiones o desempleo cumplan este requisito. La confirmación solo afecta a la simulación actual.</p>
                <p className="mt-2 text-muted-foreground">Estimación parcial: no incluye deducciones autonómicas, doble imposición, alquileres de Real Estate, imputaciones inmobiliarias ni todas las reglas de actividades económicas y recompra de valores. No sustituye la declaración. Los datos pendientes de revisar bloquean el resultado; las declaraciones presentadas mantienen sus cifras. Solo se han verificado las reglas de 2025.</p>
            </details>
            <footer className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
                <p>Fuentes oficiales · Revisado el 9 de septiembre de 2026</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <a className="underline underline-offset-4" href={`${manual}c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-general/gravamen-estatal.html`} target="_blank" rel="noreferrer">AEAT · Escala estatal</a>
                    <a className="underline underline-offset-4" href={`${manual}c15-calculo-impuesto-determinacion-cuotas-integras/gravamen-base-liquidable-general/gravamen-autonomico/comunidad-autonoma-aragon.html`} target="_blank" rel="noreferrer">AEAT · Escala de Aragón</a>
                    <a className="underline underline-offset-4" href={`${manual}c14-adecuacion-impuesto-circunstancias-personales/minimo-contribuyente.html`} target="_blank" rel="noreferrer">AEAT · Mínimo personal</a>
                    <a className="underline underline-offset-4" href={`${manual}c18-cuota-liquida-resultante-autoliquidacion/deducciones-cuota-liquida-total/deduccion-obtencion-rendimientos-trabajo.html`} target="_blank" rel="noreferrer">AEAT · Deducción laboral</a>
                </div>
            </footer>
        </DialogContent>
    </Dialog>;
}
