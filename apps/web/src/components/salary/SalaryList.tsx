import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, Calendar } from "lucide-react";
import type { SalaryRecord, SalaryListResponse } from "./salary.types";
import { fetchAPI } from "@/lib/api";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEuro } from "./salary.format";

interface SalaryListProps {
    refreshTrigger: number;
}

export default function SalaryList({ refreshTrigger }: SalaryListProps) {
    const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSalaries = async () => {
        try {
            setLoading(true);
            const res = await fetchAPI<SalaryListResponse>('/salary?limit=100');
            setSalaries(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote data synchronization
        fetchSalaries();
    }, [refreshTrigger]);

    // Calculate stats
    const totalNet = salaries.reduce((acc, curr) => acc + Number(curr.netSalary || 0), 0);
    const averageNet = salaries.length > 0 ? totalNet / salaries.length : 0;
    const lastMonth = salaries.length > 0 ? salaries[0].netSalary : 0; // Assuming sorted by date DESC

    if (loading) {
        return (
            <div className="space-y-6">
                <SalaryStatsSkeleton />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Net Income</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatEuro(totalNet)}</div>
                        <p className="text-xs text-muted-foreground">Lifetime earnings</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Average Net</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatEuro(averageNet)}</div>
                        <p className="text-xs text-muted-foreground">Per payroll</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Latest Payroll</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatEuro(lastMonth)}</div>
                        <p className="text-xs text-muted-foreground">
                            {salaries.length > 0 ? format(new Date(salaries[0].date), "MMMM yyyy") : "-"}
                        </p>
                    </CardContent>
                </Card>
            </div>

        </div>
    );
}

function SalaryStatsSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-4 w-[100px]" />
                        <Skeleton className="h-4 w-4 rounded-full" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-[120px] mb-1" />
                        <Skeleton className="h-3 w-[80px]" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
