import { useEffect, useState } from "react";
import { Eye, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { fetchAPI, fetchBlob, postAPI } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TaxReturn {
    id: string;
    taxYear: number;
    country: string;
    status: "Draft" | "Filed" | "Amended" | string;
    totalIncome: number;
    taxPaid: number;
    filingDate: string | null;
    notes: string | null;
    fileName: string | null;
    fileMimeType: string | null;
    createdAt: string;
}

interface AnnualSummary {
    taxYear: number;
    totalIncome: number;
    taxPaid: number;
    finalTaxResult: number | null;
    source: "tax_return" | "salary_records";
}

interface TaxReturnForm {
    taxYear: string;
    country: string;
    status: "Draft" | "Filed" | "Amended";
    totalIncome: string;
    taxPaid: string;
    filingDate: string;
    notes: string;
}

const initialForm: TaxReturnForm = {
    taxYear: String(new Date().getFullYear() - 1),
    country: "Spain",
    status: "Draft",
    totalIncome: "0",
    taxPaid: "0",
    filingDate: "",
    notes: "",
};

const statusStyles: Record<string, string> = {
    Draft: "bg-muted text-muted-foreground",
    Filed: "bg-emerald-500/10 text-emerald-600",
    Amended: "bg-amber-500/10 text-amber-600",
};

const formatCurrency = (value: number) => new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
}).format(value);

const formatFinalTaxResult = (value: number | null) => {
    if (value === null) return "Not filed";
    return value < 0 ? `Refund ${formatCurrency(Math.abs(value))}` : `Due ${formatCurrency(value)}`;
};

export default function TaxesPage() {
    const [taxReturns, setTaxReturns] = useState<TaxReturn[]>([]);
    const [annualSummaries, setAnnualSummaries] = useState<AnnualSummary[]>([]);
    const [form, setForm] = useState<TaxReturnForm>(initialForm);
    const [file, setFile] = useState<File | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [viewer, setViewer] = useState<{ taxReturn: TaxReturn; url: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadTaxReturns = async () => {
        setLoading(true);
        try {
            const [returnsResponse, summaryResponse] = await Promise.all([
                fetchAPI<{ data: TaxReturn[] }>("/taxes"),
                fetchAPI<{ data: AnnualSummary[] }>("/taxes/summary"),
            ]);
            setTaxReturns(returnsResponse.data);
            setAnnualSummaries(summaryResponse.data);
            setError(null);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load tax returns.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadTaxReturns();
    }, []);

    useEffect(() => () => {
        if (viewer?.url) URL.revokeObjectURL(viewer.url);
    }, [viewer]);

    const totalIncome = annualSummaries.reduce((sum, year) => sum + year.totalIncome, 0);
    const totalTaxPaid = annualSummaries.reduce((sum, year) => sum + year.taxPaid, 0);
    const totalNetIncome = annualSummaries.reduce(
        (sum, year) => sum + year.totalIncome - (year.finalTaxResult ?? year.taxPaid),
        0,
    );

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError(null);

        const body = new FormData();
        body.append("taxYear", form.taxYear);
        body.append("country", form.country);
        body.append("status", form.status);
        body.append("totalIncome", form.totalIncome || "0");
        body.append("taxPaid", form.taxPaid || "0");
        if (form.filingDate) body.append("filingDate", form.filingDate);
        if (form.notes) body.append("notes", form.notes);
        if (file) body.append("file", file);

        try {
            await postAPI<TaxReturn>("/taxes", body);
            setIsFormOpen(false);
            setForm(initialForm);
            setFile(null);
            await loadTaxReturns();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Unable to save the tax return.");
        } finally {
            setSaving(false);
        }
    };

    const handleView = async (taxReturn: TaxReturn) => {
        if (!taxReturn.fileName) return;
        try {
            const blob = await fetchBlob(`/taxes/${taxReturn.id}/file`);
            setViewer({ taxReturn, url: URL.createObjectURL(blob) });
        } catch (viewError) {
            setError(viewError instanceof Error ? viewError.message : "Unable to open the tax document.");
        }
    };

    const handleDelete = async (taxReturn: TaxReturn) => {
        if (!window.confirm(`Delete the ${taxReturn.taxYear} tax return?`)) return;
        try {
            await fetchAPI<void>(`/taxes/${taxReturn.id}`, { method: "DELETE" });
            if (viewer?.taxReturn.id === taxReturn.id) setViewer(null);
            await loadTaxReturns();
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the tax return.");
        }
    };

    return (
        <div className="space-y-6 p-6 md:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <p className="text-sm font-medium text-muted-foreground">Tax documents</p>
                    <h2 className="text-3xl font-bold tracking-tight">Tax returns</h2>
                    <p className="mt-1 text-muted-foreground">Keep your income tax filings and supporting documents in one place.</p>
                </div>
                <Button onClick={() => { setForm(initialForm); setFile(null); setIsFormOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Add tax return
                </Button>
            </div>

            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total income</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(totalIncome)}</p><p className="text-xs text-muted-foreground">Across all tax years</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total income tax withheld</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold text-rose-500">{formatCurrency(totalTaxPaid)}</p><p className="text-xs text-muted-foreground">Across all tax years</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total net income</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{formatCurrency(totalNetIncome)}</p><p className="text-xs text-muted-foreground">After income tax withheld</p></CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Annual tax overview</CardTitle></CardHeader>
                <CardContent>
                    {annualSummaries.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Add a tax return to see annual income and income tax withheld.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="hidden grid-cols-4 gap-4 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid"><span>Tax year</span><span>Income</span><span>Income tax withheld</span><span>Final tax result</span></div>
                            {annualSummaries.map((year) => (
                                <div key={year.taxYear} className="grid gap-2 rounded-lg border p-3 md:grid-cols-4 md:items-center md:border-0 md:p-0">
                                    <span className="font-semibold">{year.taxYear}</span>
                                    <span><span className="mr-2 text-xs text-muted-foreground md:hidden">Income</span>{formatCurrency(year.totalIncome)}</span>
                                    <span className="text-rose-500"><span className="mr-2 text-xs text-muted-foreground md:hidden">Income tax withheld</span>{formatCurrency(year.taxPaid)}</span>
                                    <span className={`text-sm ${year.finalTaxResult === null ? "text-muted-foreground" : year.finalTaxResult < 0 ? "text-emerald-500" : "text-rose-500"}`}><span className="mr-2 text-xs text-muted-foreground md:hidden">Final tax result</span>{formatFinalTaxResult(year.finalTaxResult)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Income tax history</CardTitle></CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading tax returns…</div>
                    ) : taxReturns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <FileText className="h-10 w-10 text-muted-foreground/50" />
                            <div><p className="font-medium">No tax returns yet</p><p className="text-sm text-muted-foreground">Upload your first filing to start building your tax history.</p></div>
                            <Button variant="outline" onClick={() => setIsFormOpen(true)}><Upload className="mr-2 h-4 w-4" /> Upload document</Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {taxReturns.map((taxReturn) => (
                                <div key={taxReturn.id} className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-5 w-5" /></div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Tax year {taxReturn.taxYear}</h3><Badge className={statusStyles[taxReturn.status] ?? "bg-muted"}>{taxReturn.status}</Badge></div>
                                            <p className="mt-1 text-sm text-muted-foreground">{taxReturn.country}{taxReturn.filingDate ? ` · Filed ${new Date(taxReturn.filingDate).toLocaleDateString("en-GB")}` : ""}</p>
                                            {taxReturn.notes && <p className="mt-2 truncate text-sm">{taxReturn.notes}</p>}
                                            <p className="mt-2 text-sm"><span className="text-muted-foreground">Income:</span> {formatCurrency(Number(taxReturn.totalIncome ?? 0))} <span className="ml-3 text-muted-foreground">Income tax withheld:</span> <span className="text-rose-500">{formatCurrency(Number(taxReturn.taxPaid ?? 0))}</span></p>
                                            {taxReturn.fileName && <p className="mt-2 truncate text-xs text-muted-foreground">{taxReturn.fileName}</p>}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        {taxReturn.fileName && <Button variant="outline" size="sm" onClick={() => void handleView(taxReturn)}><Eye className="mr-2 h-4 w-4" /> View</Button>}
                                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void handleDelete(taxReturn)} aria-label={`Delete tax year ${taxReturn.taxYear}`}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader><DialogTitle>Add tax return</DialogTitle></DialogHeader>
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2"><Label htmlFor="tax-year">Tax year</Label><Input id="tax-year" type="number" min="2000" max="2100" value={form.taxYear} onChange={(event) => setForm({ ...form, taxYear: event.target.value })} required /></div>
                            <div className="space-y-2"><Label htmlFor="tax-country">Country</Label><Input id="tax-country" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} required /></div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2"><Label htmlFor="total-income">Total income</Label><Input id="total-income" type="number" min="0" step="0.01" value={form.totalIncome} onChange={(event) => setForm({ ...form, totalIncome: event.target.value })} required /></div>
                            <div className="space-y-2"><Label htmlFor="tax-paid">Income tax withheld</Label><Input id="tax-paid" type="number" min="0" step="0.01" value={form.taxPaid} onChange={(event) => setForm({ ...form, taxPaid: event.target.value })} required /></div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2"><Label htmlFor="tax-status">Status</Label><select id="tax-status" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaxReturnForm["status"] })}><option value="Draft">Draft</option><option value="Filed">Filed</option><option value="Amended">Amended</option></select></div>
                            <div className="space-y-2"><Label htmlFor="filing-date">Filing date</Label><Input id="filing-date" type="date" value={form.filingDate} onChange={(event) => setForm({ ...form, filingDate: event.target.value })} /></div>
                        </div>
                        <div className="space-y-2"><Label htmlFor="tax-notes">Notes</Label><textarea id="tax-notes" className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional notes about this filing" /></div>
                        <div className="space-y-2"><Label htmlFor="tax-file">Supporting document</Label><Input id="tax-file" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">PDF, PNG or JPEG up to 10 MB.</p></div>
                        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save tax return</Button></div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewer} onOpenChange={(open) => { if (!open) setViewer(null); }}>
                <DialogContent className="h-[90vh] max-w-5xl p-0">
                    <DialogHeader className="border-b px-5 py-3"><DialogTitle>{viewer ? `Tax year ${viewer.taxReturn.taxYear} · ${viewer.taxReturn.fileName}` : "Tax document"}</DialogTitle></DialogHeader>
                    {viewer && viewer.taxReturn.fileMimeType?.startsWith("image/") ? <img src={viewer.url} alt={viewer.taxReturn.fileName ?? "Tax document"} className="min-h-0 flex-1 object-contain p-4" /> : viewer && <iframe title={viewer.taxReturn.fileName ?? "Tax document"} src={viewer.url} className="min-h-0 flex-1 rounded-b-md" />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
