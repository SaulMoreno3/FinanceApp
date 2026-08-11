import { useState } from 'react';
import { CalendarClock, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectEntry, ProjectEntryType, ProjectPaymentStatus } from './project.types';

export interface ProjectEntryFormData {
    type: ProjectEntryType;
    amount: number;
    description: string;
    category?: string;
    counterparty?: string;
    reference?: string;
    notes?: string;
    paymentStatus: ProjectPaymentStatus;
    date: string;
    dueDate?: string;
    file?: File;
}

interface ProjectEntryDialogProps {
    open: boolean;
    type: ProjectEntryType;
    entry?: ProjectEntry | null;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: ProjectEntryFormData) => Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);
const inputDate = (value?: string | null) => value ? value.slice(0, 10) : '';

export function ProjectEntryDialog({ open, type, entry, onOpenChange, onSubmit }: ProjectEntryDialogProps) {
    const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
    const [description, setDescription] = useState(entry?.description ?? '');
    const [category, setCategory] = useState(entry?.category ?? '');
    const [counterparty, setCounterparty] = useState(entry?.counterparty ?? '');
    const [reference, setReference] = useState(entry?.reference ?? '');
    const [notes, setNotes] = useState(entry?.notes ?? '');
    const [date, setDate] = useState(inputDate(entry?.date) || today());
    const [dueDate, setDueDate] = useState(inputDate(entry?.dueDate));
    const [file, setFile] = useState<File | null>(null);
    const [entryType, setEntryType] = useState<ProjectEntryType>(entry?.type ?? type);
    const [paymentStatus, setPaymentStatus] = useState<ProjectPaymentStatus>(entry?.paymentStatus ?? 'PAID');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !description.trim()) return;
        setIsSaving(true);
        setError('');
        try {
            await onSubmit({
                type: entryType,
                amount: parsedAmount,
                description: description.trim(),
                category: category.trim() || undefined,
                counterparty: counterparty.trim() || undefined,
                reference: reference.trim() || undefined,
                notes: notes.trim() || undefined,
                paymentStatus,
                date,
                dueDate: dueDate || undefined,
                file: file || undefined,
            });
            onOpenChange(false);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Entry could not be saved');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle>{entry ? 'Edit ledger entry' : 'New ledger entry'}</DialogTitle>
                    <DialogDescription>Record the accounting details and keep the supporting document close at hand.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select value={entryType} onValueChange={(value) => setEntryType(value as ProjectEntryType)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="INCOME">Income</SelectItem><SelectItem value="EXPENSE">Expense</SelectItem></SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="entry-amount">Amount</Label>
                            <Input id="entry-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="0.00" />
                        </div>
                        <div className="col-span-2 space-y-2 sm:col-span-1">
                            <Label>Payment status</Label>
                            <Select value={paymentStatus} onValueChange={(value) => setPaymentStatus(value as ProjectPaymentStatus)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="PAID">Paid</SelectItem><SelectItem value="PENDING">Pending</SelectItem></SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="entry-description">Description</Label>
                        <Input id="entry-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} required placeholder="Brand identity design" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="entry-counterparty">Customer or supplier</Label><Input id="entry-counterparty" value={counterparty} onChange={(event) => setCounterparty(event.target.value)} maxLength={120} placeholder="Acme Ltd." /></div>
                        <div className="space-y-2"><Label htmlFor="entry-reference">Invoice / reference</Label><Input id="entry-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} placeholder="INV-2026-001" /></div>
                        <div className="space-y-2"><Label htmlFor="entry-category">Category</Label><Input id="entry-category" list="project-categories" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} placeholder="Services" /><datalist id="project-categories"><option value="Sales" /><option value="Services" /><option value="Materials" /><option value="Software" /><option value="Travel" /><option value="Marketing" /><option value="Taxes" /><option value="Other" /></datalist></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2"><Label htmlFor="entry-date">Issue date</Label><Input id="entry-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div>
                            <div className="space-y-2"><Label htmlFor="entry-due-date">Due date</Label><Input id="entry-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
                        </div>
                    </div>
                    <div className="space-y-2"><Label htmlFor="entry-notes">Notes</Label><Textarea id="entry-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Payment terms, tax details, or internal notes" /></div>
                    {entry ? (
                        <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" /><span>{entry.fileName ? `Attached: ${entry.fileName}` : 'No supporting document attached'}</span></div>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="entry-file" className="flex items-center gap-2"><FileUp className="h-4 w-4" />Invoice or document</Label>
                            <Input id="entry-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                            <p className="text-xs text-muted-foreground">Optional PDF, JPG, or PNG up to 10 MB.</p>
                        </div>
                    )}
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : entry ? 'Save changes' : 'Add to ledger'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
