import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertCircle, FileText } from "lucide-react";
import { Pencil, Trash2 } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface SalaryHistoryProps {
    refreshTrigger: number;
    onView: (id: string) => void;
    onEdit: (salary: SalaryRecord) => void;
}

export default function SalaryHistory({ refreshTrigger, onView, onEdit }: SalaryHistoryProps) {
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

        return () => {
            active = false;
        };
    }, [refreshTrigger]);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this salary record?")) return;
        try {
            await fetchAPI<void>(`/salary/${id}`, { method: "DELETE" });
            setSalaries((current) => current.filter((salary) => salary.id !== id));
        } catch (deleteError) {
            console.error(deleteError);
        }
    };

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
        <div>
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
                                <TableHead className="text-right pr-6">Actions</TableHead>
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
                                    <TableCell className="pr-6 text-right">
                                        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                                            <Button variant="ghost" size="icon" onClick={() => onEdit(salary)} aria-label="Edit salary record">
                                                <Pencil className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(salary.id)} aria-label="Delete salary record">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {salaries.length === 0 && (
                                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No salary records found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
