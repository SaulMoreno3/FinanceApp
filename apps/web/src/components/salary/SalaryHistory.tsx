import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertCircle, FileText } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/common/TableSkeleton";
import type { SalaryListResponse, SalaryRecord } from "./salary.types";
import { formatEuro } from "./salary.format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface SalaryHistoryProps {
    refreshTrigger: number;
    onView: (id: string) => void;
}

interface YearSummary {
    year: number;
    months: number[];
    total: number;
}

export default function SalaryHistory({ refreshTrigger, onView }: SalaryHistoryProps) {
    const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize remote loading state
        setLoading(true);
        setError(false);
        fetchAPI<SalaryListResponse>("/salary?limit=1000")
            .then((response) => {
                if (active) setSalaries(response.data);
            })
            .catch(() => {
                if (active) setError(true);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
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

    if (loading) {
        return <TableSkeleton columns={6} rows={5} withHeader />;
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Could not load salary history.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Monthly net income</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table className="min-w-[980px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Year</TableHead>
                                {MONTHS.map((month) => <TableHead key={month} className="text-right">{month}</TableHead>)}
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {summaries.map((summary) => (
                                <TableRow key={summary.year}>
                                    <TableCell className="font-semibold">{summary.year}</TableCell>
                                    {summary.months.map((amount, month) => (
                                        <TableCell key={month} className="whitespace-nowrap text-right text-muted-foreground">
                                            {amount ? formatEuro(amount) : "—"}
                                        </TableCell>
                                    ))}
                                    <TableCell className="whitespace-nowrap text-right font-semibold">{formatEuro(summary.total)}</TableCell>
                                </TableRow>
                            ))}
                            {summaries.length === 0 && (
                                <TableRow><TableCell colSpan={14} className="py-8 text-center text-muted-foreground">No salary records found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>All records</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-6">Date</TableHead>
                                <TableHead>Company</TableHead>
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                                <TableHead>File</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {salaries.map((salary) => (
                                <TableRow key={salary.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onView(salary.id)}>
                                    <TableCell className="pl-6 font-medium">{format(new Date(salary.date), "dd MMM yyyy")}</TableCell>
                                    <TableCell className="font-semibold text-foreground/80">{salary.company || "Unknown"}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{salary.grossSalary != null ? formatEuro(salary.grossSalary) : "—"}</TableCell>
                                    <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-500">{salary.netSalary != null ? formatEuro(salary.netSalary) : "—"}</TableCell>
                                    <TableCell>
                                        {salary.fileName ? <Badge variant="outline" className="gap-1 font-normal"><FileText className="h-3 w-3" />PDF</Badge> : <span className="text-xs italic text-muted-foreground">No file</span>}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {salaries.length === 0 && (
                                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No salary records found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
