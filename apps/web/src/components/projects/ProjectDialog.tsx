import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectStatus, ProjectSummary } from './project.types';

export interface ProjectFormData {
    name: string;
    description?: string;
    client?: string;
    budget?: number;
    status: ProjectStatus;
}

interface ProjectDialogProps {
    open: boolean;
    project?: ProjectSummary | null;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: ProjectFormData) => Promise<void>;
}

export function ProjectDialog({ open, project, onOpenChange, onSubmit }: ProjectDialogProps) {
    const [name, setName] = useState(project?.name ?? '');
    const [description, setDescription] = useState(project?.description ?? '');
    const [client, setClient] = useState(project?.client ?? '');
    const [budget, setBudget] = useState(project?.budget ? String(project.budget) : '');
    const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'ACTIVE');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const parsedBudget = budget ? Number(budget) : undefined;
        if (!name.trim() || (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0))) return;
        setIsSaving(true);
        setError('');
        try {
            await onSubmit({
                name: name.trim(),
                description: description.trim() || undefined,
                client: client.trim() || undefined,
                budget: parsedBudget,
                status,
            });
            onOpenChange(false);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Project could not be saved');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[540px]">
                <DialogHeader>
                    <DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle>
                    <DialogDescription>Set up the workspace that will hold this project's complete account book.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="project-name">Project name</Label>
                        <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus required placeholder="Website redesign" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="project-client">Client or company</Label>
                            <Input id="project-client" value={client} onChange={(event) => setClient(event.target.value)} maxLength={120} placeholder="Acme Ltd." />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="project-budget">Expense budget</Label>
                            <Input id="project-budget" type="number" min="0.01" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="25000.00" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ACTIVE">Active</SelectItem>
                                <SelectItem value="COMPLETED">Completed</SelectItem>
                                <SelectItem value="ARCHIVED">Archived</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="project-description">Description</Label>
                        <Textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Scope, goals, or internal notes" />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSaving || !name.trim()}>{isSaving ? 'Saving...' : project ? 'Save changes' : 'Create project'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
