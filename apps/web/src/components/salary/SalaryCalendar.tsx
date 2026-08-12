import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/common/TableSkeleton";
import type { SalaryListResponse, SalaryRecord } from "./salary.types";
import { formatEuro } from "./salary.format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface SalaryCalendarProps {
    refreshTrigger: number;
}

interface YearSummary {
    year: number;
    months: number[];
    total: number;
}

export default function SalaryCalendar({ refreshTrigger }: SalaryCalendarProps) {
    const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize remote loading state
        setLoading(true);
        setError(false);
        fetchAPI<SalaryListResponse>("/salary?limit=100")
            .then((response) => {
                if (active) setSalaries(response.data);
            })
            .catch(() => {
                if (active) setError(true);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [refreshTrigger]);

    const summaries = useMemo<YearSummary[]>(() => {
        const byYear = new Map<number, YearSummary>();
        for (const salary of salaries) {
            const date = new Date(salary.date);
            const year = date.getFullYear();
            const month = date.getMonth();
            const summary = byYear.get(year) ?? { year, months: Array(12).fill(0), total: 0 };
            const amount = Number(salary.netSalary ?? salary.grossSalary ?? 0);
            summary.months[month] += amount;
            summary.total += amount;
            byYear.set(year, summary);
        }
        return [...byYear.values()].sort((a, b) => b.year - a.year);
    }, [salaries]);

    if (loading) return <TableSkeleton columns={6} rows={4} withHeader />;
    if (error) return <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertCircle className="h-4 w-4" />Could not load monthly income.</div>;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Monthly net income</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto px-3 sm:px-4">
                <Table className="w-full min-w-[980px] table-fixed text-xs md:min-w-0">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12 px-1 sm:px-2">Year</TableHead>
                            {MONTHS.map((month) => <TableHead key={month} className="px-1 text-right sm:px-2">{month}</TableHead>)}
                            <TableHead className="w-20 px-1 text-right sm:px-2">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {summaries.map((summary) => (
                            <TableRow key={summary.year}>
                                <TableCell className="px-1 font-semibold sm:px-2">{summary.year}</TableCell>
                                {summary.months.map((amount, month) => <TableCell key={month} className="whitespace-nowrap px-1 text-right text-muted-foreground sm:px-2">{amount ? formatEuro(amount) : "—"}</TableCell>)}
                                <TableCell className="whitespace-nowrap px-1 text-right font-semibold sm:px-2">{formatEuro(summary.total)}</TableCell>
                            </TableRow>
                        ))}
                        {summaries.length === 0 && <TableRow><TableCell colSpan={14} className="py-8 text-center text-muted-foreground">No salary records found.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
