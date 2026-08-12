import { useMemo, useState } from "react";
import { Calculator, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { estimateAragonIrpf, type TaxEstimatorInput } from "./tax-estimator";

interface AnnualSummary {
    taxYear: number;
    totalIncome: number;
    taxPaid: number;
}

interface TaxEstimatorProps {
    annualSummaries: AnnualSummary[];
}

const formatCurrency = (value: number) => new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
}).format(value);

const emptyInput: TaxEstimatorInput = {
    employmentGross: 0,
    selfEmploymentProfit: 0,
    savingsIncome: 0,
    capitalGains: 0,
    socialSecurity: 0,
    workExpenses: 0,
    personalDeductions: 0,
    withholdings: 0,
    advancePayments: 0,
};

function defaultsForYear(year: number, summaries: AnnualSummary[]): TaxEstimatorInput {
    const summary = summaries.find((item) => item.taxYear === year);
    return {
        ...emptyInput,
        employmentGross: Number(summary?.totalIncome ?? 0),
        withholdings: Number(summary?.taxPaid ?? 0),
    };
}

export default function TaxEstimator({ annualSummaries }: TaxEstimatorProps) {
    const years = [...new Set([new Date().getFullYear(), ...annualSummaries.map((item) => item.taxYear)])].sort((a, b) => b - a);
    const [year, setYear] = useState(years[0]);
    const [input, setInput] = useState<TaxEstimatorInput>(() => defaultsForYear(years[0], annualSummaries));
    const result = useMemo(() => estimateAragonIrpf(input), [input]);
    const isDue = result.result > 0;

    const changeYear = (nextYear: number) => {
        setYear(nextYear);
        setInput(defaultsForYear(nextYear, annualSummaries));
    };

    const update = (field: keyof TaxEstimatorInput, value: string) => {
        setInput((current) => ({ ...current, [field]: Number(value) || 0 }));
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                        <div className="flex items-center gap-2"><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Estimated IRPF</CardTitle><Badge variant="outline">Aragón</Badge></div>
                        <CardDescription className="mt-1">Indicative forecast for Zaragoza based on the available records.</CardDescription>
                    </div>
                    <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={year} onChange={(event) => changeYear(Number(event.target.value))} aria-label="Tax year">
                        {years.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <MoneyInput label="Employment gross income" value={input.employmentGross} onChange={(value) => update("employmentGross", value)} />
                    <MoneyInput label="Self-employed net profit" value={input.selfEmploymentProfit} onChange={(value) => update("selfEmploymentProfit", value)} />
                    <MoneyInput label="Savings income" value={input.savingsIncome} onChange={(value) => update("savingsIncome", value)} />
                    <MoneyInput label="Realised capital gains" value={input.capitalGains} onChange={(value) => update("capitalGains", value)} />
                    <MoneyInput label="Social Security" value={input.socialSecurity} onChange={(value) => update("socialSecurity", value)} />
                    <MoneyInput label="Work expenses" value={input.workExpenses} onChange={(value) => update("workExpenses", value)} />
                    <MoneyInput label="Other deductions" value={input.personalDeductions} onChange={(value) => update("personalDeductions", value)} />
                    <MoneyInput label="Withholdings" value={input.withholdings} onChange={(value) => update("withholdings", value)} />
                    <MoneyInput label="Advance payments" value={input.advancePayments} onChange={(value) => update("advancePayments", value)} />
                </div>

                <div className={`rounded-lg border p-4 ${isDue ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimated result for {year}</p>
                    <p className={`mt-1 text-3xl font-bold ${isDue ? "text-rose-500" : "text-emerald-500"}`}>{isDue ? `To pay ${formatCurrency(result.result)}` : `Refund ${formatCurrency(Math.abs(result.result))}`}</p>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Summary label="General taxable base" value={result.generalBase} />
                    <Summary label="Savings taxable base" value={result.savingsBase} />
                    <Summary label="Estimated tax" value={result.estimatedTax} />
                    <Summary label="Already paid" value={result.amountPaid} />
                </div>

                <p className="flex gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" />This is an estimate, not an official tax calculation. It uses simplified Aragón bands and does not include every personal, regional or family deduction. Review the inputs before relying on the result.</p>
            </CardContent>
        </Card>
    );
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
    return <div className="space-y-2"><Label className="text-xs text-muted-foreground">{label}</Label><Input type="number" min="0" step="0.01" value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Summary({ label, value }: { label: string; value: number }) {
    return <div className="rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{formatCurrency(value)}</p></div>;
}
