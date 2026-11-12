import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SalaryHistory from "@/components/salary/SalaryHistory";
import SalaryDetailModal from "@/components/salary/SalaryDetail";
import SalaryForm from "@/components/salary/SalaryForm";
import type { SalaryRecord } from "@/components/salary/salary.types";
import { fetchAPI } from "@/lib/api";

export default function SalaryHistoryPage() {
    const navigate = useNavigate();
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [editingSalary, setEditingSalary] = useState<SalaryRecord>();
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleEdit = async (salary: SalaryRecord) => {
        const fullData = await fetchAPI<SalaryRecord>(`/salary/${salary.id}`).catch(() => salary);
        setEditingSalary(fullData);
        setIsEditOpen(true);
    };

    return (
        <div className="space-y-8 p-4 md:p-8">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => navigate("/salary")} aria-label="Back to salaries"><ArrowLeft className="h-4 w-4" /></Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Salary history</h1>
                    <p className="mt-1 text-muted-foreground">Review all your payroll and income records.</p>
                </div>
            </div>
            <SalaryHistory refreshTrigger={refreshTrigger} onView={setViewingId} onEdit={handleEdit} />
            <SalaryDetailModal salaryId={viewingId} onClose={() => setViewingId(null)} />
            <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingSalary(undefined); }}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Salary Record</DialogTitle>
                        <DialogDescription>Update the details of your salary record.</DialogDescription>
                    </DialogHeader>
                    <SalaryForm initialData={editingSalary} onCancel={() => setIsEditOpen(false)} onSuccess={() => { setIsEditOpen(false); setEditingSalary(undefined); setRefreshTrigger((value) => value + 1); }} />
                </DialogContent>
            </Dialog>
        </div>
    );
}
