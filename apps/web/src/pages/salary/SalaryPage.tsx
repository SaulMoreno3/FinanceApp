import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { History, Plus } from "lucide-react";
import SalaryList from "@/components/salary/SalaryList";
import SalaryForm from "@/components/salary/SalaryForm";
import SalaryCalendar from "@/components/salary/SalaryCalendar";
import type { SalaryRecord } from "@/components/salary/salary.types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

export default function SalaryPage() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const navigate = useNavigate();

    const [editingSalary, setEditingSalary] = useState<SalaryRecord | undefined>(undefined);

    const handleCreateSuccess = () => {
        setIsCreateOpen(false);
        setEditingSalary(undefined);
        setRefreshTrigger(prev => prev + 1);
    };

    const handleCancel = () => {
        setIsCreateOpen(false);
        setEditingSalary(undefined);
    };

    return (
        <div className="space-y-8 p-4 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Salaries</h1>
                    <p className="text-muted-foreground mt-1">Manage your payrolls and income history.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => navigate("/salary/history")} size="lg">
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
            <SalaryCalendar refreshTrigger={refreshTrigger} />

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

        </div>
    );
}
