import { useState } from "react";
import { Button } from "@/components/ui/button";
import { History, Plus } from "lucide-react";
import SalaryList from "@/components/salary/SalaryList";
import SalaryForm from "@/components/salary/SalaryForm";
import SalaryDetailModal from "@/components/salary/SalaryDetail";
import SalaryHistory from "@/components/salary/SalaryHistory";
import type { SalaryRecord } from "@/components/salary/salary.types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { fetchAPI } from "@/lib/api";

export default function SalaryPage() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const [editingSalary, setEditingSalary] = useState<SalaryRecord | undefined>(undefined);

    const handleCreateSuccess = () => {
        setIsCreateOpen(false);
        setEditingSalary(undefined);
        setRefreshTrigger(prev => prev + 1);
    };

    const handleEdit = async (salary: SalaryRecord) => {
        try {
            const fullData = await fetchAPI<SalaryRecord>(`/salary/${salary.id}`);
            setEditingSalary(fullData);
            setIsCreateOpen(true);
        } catch (error) {
            console.error(error);
            // Fallback to partial data if fetch fails
            setEditingSalary(salary);
            setIsCreateOpen(true);
        }
    };

    const handleCancel = () => {
        setIsCreateOpen(false);
        setEditingSalary(undefined);
    };

    return (
        <div className="space-y-8 py-8 container mx-auto max-w-7xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Salaries</h1>
                    <p className="text-muted-foreground mt-1">Manage your payrolls and income history.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsHistoryOpen(true)} size="lg">
                        <History className="w-4 h-4 mr-2" />
                        History
                    </Button>
                    <Button onClick={() => { setEditingSalary(undefined); setIsCreateOpen(true); }} size="lg" className="shadow-sm">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Record
                    </Button>
                </div>
            </div>

            <SalaryList refreshTrigger={refreshTrigger} />

            {/* Create/Edit Modal */}
            <Dialog open={isCreateOpen} onOpenChange={(open) => {
                setIsCreateOpen(open);
                if (!open) setEditingSalary(undefined);
            }}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingSalary ? "Edit Salary Record" : "Add New Salary"}</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {editingSalary ? "Update the details of your salary record." : "Fill in the form below to create a new salary record."}
                        </DialogDescription>
                    </DialogHeader>
                    <SalaryForm
                        key={editingSalary?.id || 'new'}
                        initialData={editingSalary}
                        onSuccess={handleCreateSuccess}
                        onCancel={handleCancel}
                    />
                </DialogContent>
            </Dialog>

            {/* Detail Modal */}
            <SalaryDetailModal
                salaryId={viewingId}
                onClose={() => setViewingId(null)}
            />

            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-7xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Salary history</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Review your records and monthly income totals by year.
                        </DialogDescription>
                    </DialogHeader>
                    <SalaryHistory refreshTrigger={refreshTrigger} onView={setViewingId} onEdit={handleEdit} />
                </DialogContent>
            </Dialog>
        </div>
    );
}
