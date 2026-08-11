import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowDownLeft, ArrowUpRight, BriefcaseBusiness, CalendarClock, CheckCircle2, CircleDollarSign,
    Download, Edit3, FileText, FolderKanban, MoreHorizontal, Plus, ReceiptText, Search, Trash2, TrendingUp, WalletCards,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProjectDialog, type ProjectFormData } from '@/components/projects/ProjectDialog';
import { ProjectEntryDialog, type ProjectEntryFormData } from '@/components/projects/ProjectEntryDialog';
import type { ProjectDetail, ProjectEntry, ProjectEntryType, ProjectSummary } from '@/components/projects/project.types';
import { fetchAPI, fetchBlob, postAPI } from '@/lib/api';
import { cn } from '@/lib/utils';

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' });
const compactMoney = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const statusLabels = { ACTIVE: 'Active', COMPLETED: 'Completed', ARCHIVED: 'Archived' } as const;

function escapeCsv(value: string | number) {
    const text = String(value);
    return `"${text.replaceAll('"', '""')}"`;
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof CircleDollarSign; tone: 'green' | 'red' | 'amber' | 'blue' }) {
    const styles = {
        green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        blue: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    };
    return (
        <Card className="overflow-hidden border-border/60 shadow-sm">
            <CardContent className="flex items-start justify-between p-5">
                <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
                <div className={cn('rounded-xl p-2.5', styles[tone])}><Icon className="h-5 w-5" /></div>
            </CardContent>
        </Card>
    );
}

export default function ProjectsPage() {
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ProjectDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState('');
    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [editingProject, setEditingProject] = useState(false);
    const [entryDialogOpen, setEntryDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<ProjectEntry | null>(null);
    const [newEntryType, setNewEntryType] = useState<ProjectEntryType>('INCOME');
    const [deleteTarget, setDeleteTarget] = useState<{ kind: 'project'; name: string } | { kind: 'entry'; id: string; name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [projectSearch, setProjectSearch] = useState('');
    const [entrySearch, setEntrySearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [paymentFilter, setPaymentFilter] = useState('ALL');

    const loadProjects = useCallback(async (preferredId?: string) => {
        const response = await fetchAPI<{ data: ProjectSummary[] }>('/projects');
        setProjects(response.data);
        setSelectedId((current) => preferredId || current || response.data[0]?.id || null);
    }, []);

    const loadDetail = useCallback(async (projectId: string) => {
        const response = await fetchAPI<ProjectDetail>(`/projects/${projectId}`);
        setDetail(response);
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            void loadProjects().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Projects could not be loaded')).finally(() => setIsLoading(false));
        }, 0);
        return () => window.clearTimeout(timeout);
    }, [loadProjects]);

    useEffect(() => {
        if (!selectedId) return;
        const timeout = window.setTimeout(() => {
            setDetailLoading(true);
            setError('');
            void loadDetail(selectedId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Project could not be loaded')).finally(() => setDetailLoading(false));
        }, 0);
        return () => window.clearTimeout(timeout);
    }, [selectedId, loadDetail]);

    const refresh = async (projectId: string) => Promise.all([loadProjects(projectId), loadDetail(projectId)]);

    const saveProject = async (data: ProjectFormData) => {
        if (editingProject && selectedId) {
            await fetchAPI(`/projects/${selectedId}`, { method: 'PUT', body: JSON.stringify(data) });
            await refresh(selectedId);
        } else {
            const project = await postAPI<ProjectSummary>('/projects', data);
            await loadProjects(project.id);
            setSelectedId(project.id);
        }
    };

    const saveEntry = async (data: ProjectEntryFormData) => {
        if (!selectedId) return;
        if (editingEntry) {
            const body = {
                type: data.type, amount: data.amount, description: data.description, category: data.category,
                counterparty: data.counterparty, reference: data.reference, notes: data.notes,
                paymentStatus: data.paymentStatus, date: data.date, dueDate: data.dueDate,
            };
            await fetchAPI(`/projects/${selectedId}/entries/${editingEntry.id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
            const form = new FormData();
            Object.entries(data).forEach(([key, value]) => { if (value !== undefined) form.append(key, value instanceof File ? value : String(value)); });
            await postAPI(`/projects/${selectedId}/entries`, form);
        }
        await refresh(selectedId);
    };

    const openEntryFile = async (entryId: string) => {
        if (!selectedId) return;
        try {
            const blob = await fetchBlob(`/projects/${selectedId}/entries/${entryId}/file`);
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (fileError) { setError(fileError instanceof Error ? fileError.message : 'Document could not be opened'); }
    };

    const confirmDelete = async () => {
        if (!selectedId || !deleteTarget) return;
        setIsDeleting(true); setError('');
        try {
            if (deleteTarget.kind === 'entry') {
                await fetchAPI(`/projects/${selectedId}/entries/${deleteTarget.id}`, { method: 'DELETE' });
                await refresh(selectedId);
            } else {
                await fetchAPI(`/projects/${selectedId}`, { method: 'DELETE' });
                setSelectedId(null); setDetail(null); await loadProjects();
            }
            setDeleteTarget(null);
        } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'The delete action could not be completed'); }
        finally { setIsDeleting(false); }
    };

    const entries = useMemo(() => detail?.entries ?? [], [detail?.entries]);
    const ledger = useMemo(() => {
        const paidIncome = entries.filter((entry) => entry.type === 'INCOME' && entry.paymentStatus === 'PAID').reduce((sum, entry) => sum + entry.amount, 0);
        const paidExpense = entries.filter((entry) => entry.type === 'EXPENSE' && entry.paymentStatus === 'PAID').reduce((sum, entry) => sum + entry.amount, 0);
        const receivable = entries.filter((entry) => entry.type === 'INCOME' && entry.paymentStatus === 'PENDING').reduce((sum, entry) => sum + entry.amount, 0);
        const payable = entries.filter((entry) => entry.type === 'EXPENSE' && entry.paymentStatus === 'PENDING').reduce((sum, entry) => sum + entry.amount, 0);
        const overdue = entries.filter((entry) => entry.paymentStatus === 'PENDING' && entry.dueDate && entry.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10)).length;
        return { paidIncome, paidExpense, cashBalance: paidIncome - paidExpense, receivable, payable, overdue };
    }, [entries]);

    const monthlyData = useMemo(() => {
        const months = new Map<string, { key: string; label: string; income: number; expense: number }>();
        entries.forEach((entry) => {
            const key = entry.date.slice(0, 7);
            const row = months.get(key) ?? { key, label: monthFormatter.format(new Date(`${key}-01T00:00:00Z`)), income: 0, expense: 0 };
            if (entry.type === 'INCOME') row.income += entry.amount; else row.expense += entry.amount;
            months.set(key, row);
        });
        return [...months.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-8);
    }, [entries]);

    const categories = useMemo(() => {
        const totals = new Map<string, number>();
        entries.filter((entry) => entry.type === 'EXPENSE').forEach((entry) => totals.set(entry.category || 'Uncategorised', (totals.get(entry.category || 'Uncategorised') ?? 0) + entry.amount));
        return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    }, [entries]);

    const filteredEntries = useMemo(() => entries.filter((entry) => {
        const query = entrySearch.trim().toLowerCase();
        const matchesText = !query || [entry.description, entry.category, entry.counterparty, entry.reference].some((value) => value?.toLowerCase().includes(query));
        return matchesText && (typeFilter === 'ALL' || entry.type === typeFilter) && (paymentFilter === 'ALL' || entry.paymentStatus === paymentFilter);
    }), [entries, entrySearch, typeFilter, paymentFilter]);

    const visibleProjects = projects.filter((project) => [project.name, project.client].some((value) => value?.toLowerCase().includes(projectSearch.toLowerCase())));
    const budgetPercent = detail?.budget ? Math.min((detail.expense / detail.budget) * 100, 100) : 0;

    const openNewEntry = (type: ProjectEntryType) => { setEditingEntry(null); setNewEntryType(type); setEntryDialogOpen(true); };
    const openEditEntry = (entry: ProjectEntry) => { setEditingEntry(entry); setNewEntryType(entry.type); setEntryDialogOpen(true); };
    const exportLedger = () => {
        if (!detail) return;
        const header = ['Date', 'Due date', 'Type', 'Status', 'Description', 'Category', 'Customer/Supplier', 'Reference', 'Amount', 'Notes'];
        const rows = filteredEntries.map((entry) => [entry.date.slice(0, 10), entry.dueDate?.slice(0, 10) ?? '', entry.type, entry.paymentStatus, entry.description, entry.category ?? '', entry.counterparty ?? '', entry.reference ?? '', entry.amount, entry.notes ?? '']);
        const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `${detail.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ledger.csv`; link.click(); URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-full bg-muted/20 p-4 md:p-6">
            <div className="mx-auto max-w-[1500px] space-y-6">
                <div className="relative overflow-hidden rounded-2xl border bg-card px-5 py-6 shadow-sm md:px-8">
                    <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4"><div className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-lg shadow-primary/20"><BriefcaseBusiness className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Project accounts</h1><p className="mt-1 text-sm text-muted-foreground">A clear financial ledger for every project or company.</p></div></div>
                        <Button onClick={() => { setEditingProject(false); setProjectDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />New project</Button>
                    </div>
                </div>

                {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

                <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <Card className="overflow-hidden border-border/60 shadow-sm xl:sticky xl:top-6">
                        <CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base">Projects</CardTitle><CardDescription>{projects.length} total</CardDescription></div><FolderKanban className="h-5 w-5 text-muted-foreground" /></div><div className="relative mt-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Find a project..." /></div></CardHeader>
                        <CardContent className="max-h-[65vh] space-y-2 overflow-y-auto p-3 pt-0">
                            {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading projects...</p> : visibleProjects.length === 0 ? <div className="py-10 text-center"><FolderKanban className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-sm font-medium">{projects.length ? 'No matching projects' : 'No projects yet'}</p></div> : visibleProjects.map((project) => (
                                <button key={project.id} onClick={() => setSelectedId(project.id)} className={cn('w-full rounded-xl border border-transparent p-3 text-left transition-all hover:bg-accent/70', selectedId === project.id && 'border-primary/20 bg-primary/10 shadow-sm')}>
                                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold">{project.name}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{project.client || 'Independent project'}</div></div><span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', project.status === 'ACTIVE' ? 'bg-emerald-500' : project.status === 'COMPLETED' ? 'bg-sky-500' : 'bg-slate-400')} /></div>
                                    <div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Balance</span><span className={cn('text-sm font-bold', project.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600')}>{money.format(project.balance)}</span></div>
                                </button>
                            ))}
                        </CardContent>
                    </Card>

                    {!detail || detailLoading ? (
                        <Card className="flex min-h-[420px] items-center justify-center border-dashed"><CardContent className="pt-6 text-center text-muted-foreground"><WalletCards className="mx-auto mb-3 h-10 w-10" /><p>{detailLoading ? 'Opening account book...' : 'Select or create a project.'}</p></CardContent></Card>
                    ) : (
                        <div className="min-w-0 space-y-6">
                            <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-2xl font-bold">{detail.name}</h2><Badge variant="outline" className="rounded-full">{statusLabels[detail.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{detail.client ? `For ${detail.client}` : 'Independent project'}{detail.description ? ` · ${detail.description}` : ''}</p></div>
                                <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => { setEditingProject(true); setProjectDialogOpen(true); }}><Edit3 className="mr-2 h-4 w-4" />Edit</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-9 w-9"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ kind: 'project', name: detail.name })}><Trash2 className="mr-2 h-4 w-4" />Delete project</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                                <MetricCard label="Cash balance" value={money.format(ledger.cashBalance)} detail={`${money.format(ledger.paidIncome)} collected`} icon={WalletCards} tone="green" />
                                <MetricCard label="Accounts receivable" value={money.format(ledger.receivable)} detail="Pending customer payments" icon={ArrowDownLeft} tone="blue" />
                                <MetricCard label="Accounts payable" value={money.format(ledger.payable)} detail="Pending supplier payments" icon={ArrowUpRight} tone="red" />
                                <MetricCard label="Projected profit" value={money.format(detail.balance)} detail={`${detail.income ? ((detail.balance / detail.income) * 100).toFixed(1) : '0.0'}% margin`} icon={TrendingUp} tone="amber" />
                            </div>

                            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
                                <Card className="border-border/60 shadow-sm"><CardHeader><CardTitle className="text-base">Income vs expenses</CardTitle><CardDescription>Monthly financial activity across the whole project</CardDescription></CardHeader><CardContent>{monthlyData.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={monthlyData} margin={{ top: 5, right: 0, left: -12, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickFormatter={(value) => compactMoney.format(value)} tickLine={false} axisLine={false} fontSize={11} /><Tooltip formatter={(value) => money.format(Number(value))} cursor={{ fill: 'rgba(127,127,127,.08)' }} /><Bar dataKey="income" name="Income" fill="#10b981" radius={[5, 5, 0, 0]} /><Bar dataKey="expense" name="Expenses" fill="#f43f5e" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">Add entries to see the monthly trend.</div>}</CardContent></Card>
                                <Card className="border-border/60 shadow-sm"><CardHeader><CardTitle className="text-base">Financial health</CardTitle><CardDescription>Budget and expense concentration</CardDescription></CardHeader><CardContent className="space-y-5">{detail.budget ? <div><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Expense budget</span><span className="font-semibold">{money.format(detail.expense)} / {money.format(detail.budget)}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', detail.expense > detail.budget ? 'bg-rose-500' : 'bg-primary')} style={{ width: `${budgetPercent}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{detail.expense > detail.budget ? `${money.format(detail.expense - detail.budget)} over budget` : `${money.format(detail.budget - detail.expense)} remaining`}</p></div> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Add an expense budget in project settings to monitor spending.</div>}{categories.length > 0 && <div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top expense categories</p>{categories.map(([category, amount]) => <div key={category} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{category}</span><span className="font-medium">{money.format(amount)}</span></div>)}</div>}{ledger.overdue > 0 && <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><CalendarClock className="h-5 w-5 shrink-0 text-amber-600" /><span><strong>{ledger.overdue}</strong> overdue {ledger.overdue === 1 ? 'entry needs' : 'entries need'} attention.</span></div>}</CardContent></Card>
                            </div>

                            <Card className="overflow-hidden border-border/60 shadow-sm">
                                <CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5" />Account ledger</CardTitle><CardDescription>{filteredEntries.length} of {entries.length} entries</CardDescription></div><div className="grid grid-cols-2 gap-2 sm:flex"><Button size="sm" variant="outline" onClick={() => openNewEntry('INCOME')}><ArrowDownLeft className="mr-2 h-4 w-4 text-emerald-600" />Income</Button><Button size="sm" onClick={() => openNewEntry('EXPENSE')}><ArrowUpRight className="mr-2 h-4 w-4" />Expense</Button></div></CardHeader>
                                <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(220px,1fr)_150px_150px_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={entrySearch} onChange={(event) => setEntrySearch(event.target.value)} placeholder="Search description, invoice, supplier..." /></div><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All types</SelectItem><SelectItem value="INCOME">Income</SelectItem><SelectItem value="EXPENSE">Expense</SelectItem></SelectContent></Select><Select value={paymentFilter} onValueChange={setPaymentFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All statuses</SelectItem><SelectItem value="PAID">Paid</SelectItem><SelectItem value="PENDING">Pending</SelectItem></SelectContent></Select><Button variant="outline" onClick={exportLedger} disabled={!filteredEntries.length}><Download className="mr-2 h-4 w-4" />CSV</Button></div>
                                <CardContent className="p-0">{filteredEntries.length === 0 ? <div className="py-16 text-center"><ReceiptText className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="font-medium">{entries.length ? 'No entries match these filters' : 'Your ledger is empty'}</p><p className="mt-1 text-sm text-muted-foreground">{entries.length ? 'Try clearing a filter.' : 'Record the first income or expense to get started.'}</p></div> : <><div className="space-y-3 p-4 md:hidden">{filteredEntries.map((entry) => <div key={entry.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{entry.description}</p><p className="mt-1 text-xs text-muted-foreground">{dateFormatter.format(new Date(entry.date))}{entry.counterparty ? ` · ${entry.counterparty}` : ''}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mr-2 -mt-2"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEditEntry(entry)}><Edit3 className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>{entry.fileName && <DropdownMenuItem onClick={() => void openEntryFile(entry.id)}><FileText className="mr-2 h-4 w-4" />Open document</DropdownMenuItem>}<DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ kind: 'entry', id: entry.id, name: entry.description })}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><div className="mt-4 flex items-end justify-between"><div className="flex flex-wrap gap-1.5"><Badge variant="outline">{entry.category || 'Uncategorised'}</Badge><Badge className={cn(entry.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400')}>{entry.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}</Badge></div><span className={cn('font-bold', entry.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600')}>{entry.type === 'INCOME' ? '+' : '−'}{money.format(entry.amount)}</span></div></div>)}</div><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Customer / supplier</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{filteredEntries.map((entry) => <TableRow key={entry.id} className="group"><TableCell className="whitespace-nowrap text-muted-foreground">{dateFormatter.format(new Date(entry.date))}</TableCell><TableCell><div className="font-medium">{entry.description}</div><div className="mt-0.5 text-xs text-muted-foreground">{entry.category || 'Uncategorised'}</div></TableCell><TableCell>{entry.counterparty || '—'}</TableCell><TableCell>{entry.reference || '—'}</TableCell><TableCell><Badge className={cn('font-medium', entry.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400')}>{entry.paymentStatus === 'PAID' ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <CalendarClock className="mr-1 h-3 w-3" />}{entry.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}</Badge></TableCell><TableCell className={cn('whitespace-nowrap text-right font-bold', entry.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600')}>{entry.type === 'INCOME' ? '+' : '−'}{money.format(entry.amount)}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEditEntry(entry)}><Edit3 className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>{entry.fileName && <DropdownMenuItem onClick={() => void openEntryFile(entry.id)}><FileText className="mr-2 h-4 w-4" />Open document</DropdownMenuItem>}<DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ kind: 'entry', id: entry.id, name: entry.description })}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div></>}</CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </div>

            <ProjectDialog key={`${editingProject ? detail?.id : 'new'}-${projectDialogOpen}`} open={projectDialogOpen} project={editingProject ? detail : null} onOpenChange={setProjectDialogOpen} onSubmit={saveProject} />
            <ProjectEntryDialog key={`${editingEntry?.id ?? newEntryType}-${entryDialogOpen}`} open={entryDialogOpen} type={newEntryType} entry={editingEntry} onOpenChange={setEntryDialogOpen} onSubmit={saveEntry} />
            <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}><DialogContent className="sm:max-w-[440px]"><DialogHeader><DialogTitle>{deleteTarget?.kind === 'project' ? 'Delete project' : 'Delete entry'}</DialogTitle><DialogDescription>{deleteTarget?.kind === 'project' ? `“${deleteTarget.name}” and its complete account book will be deleted. This cannot be undone.` : `“${deleteTarget?.name}” will be deleted. This cannot be undone.`}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button><Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Delete'}</Button></DialogFooter></DialogContent></Dialog>
        </div>
    );
}
