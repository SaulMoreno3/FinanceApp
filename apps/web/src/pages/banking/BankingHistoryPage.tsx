import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { transactionCategory, transactionLabel } from './banking.format';

type Transaction = { id: string; date: string; amount: number; currency: string; description: string | null; merchantName: string | null; category: string | null; direction: string; account: { name: string | null; currency: string } };
type Response = { data: Transaction[]; meta: { total: number; page: number; limit: number; totalPages: number } };
const money = (amount: number, currency: string) => amount.toLocaleString('es-ES', { style: 'currency', currency, maximumFractionDigits: 2 });

export default function BankingHistoryPage() {
    const [params, setParams] = useSearchParams();
    const page = Number(params.get('page') || 1);
    const [response, setResponse] = useState<Response | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => { const run = async () => { setLoading(true); try { setResponse(await fetchAPI<Response>(`/bank-sync/transactions?page=${page}&limit=50`)); } finally { setLoading(false); } }; void run(); }, [page]);
    const changePage = (next: number) => setParams({ page: String(next) });
    return <div className="space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-between gap-4"><div><Button asChild variant="ghost" className="mb-2 -ml-3"><Link to="/banking"><ArrowLeft /> Volver a Banking</Link></Button><h1 className="text-3xl font-bold tracking-tight">Historial bancario</h1><p className="text-muted-foreground">Todos los movimientos recibidos desde TrueLayer.</p></div></div>
        <Card><CardHeader><CardTitle>Movimientos</CardTitle></CardHeader><CardContent>{loading ? <div className="py-8 text-center text-muted-foreground">Cargando historial...</div> : !response?.data.length ? <div className="py-8 text-center text-muted-foreground">No hay movimientos.</div> : <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Comercio / descripción</TableHead><TableHead>Categoría</TableHead><TableHead>Cuenta</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>{response.data.map(transaction => <TableRow key={transaction.id}><TableCell>{new Date(transaction.date).toLocaleDateString('es-ES')}</TableCell><TableCell><div className="font-medium">{transactionLabel(transaction.merchantName, transaction.description)}</div>{transaction.merchantName && transaction.description && <div className="text-xs text-muted-foreground">{transaction.description}</div>}</TableCell><TableCell>{transactionCategory(transaction.category, transaction.merchantName, transaction.description)}</TableCell><TableCell>{transaction.account.name || 'Cuenta'}</TableCell><TableCell className={`text-right font-medium ${transaction.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{transaction.amount >= 0 ? '+' : ''}{money(transaction.amount, transaction.currency)}</TableCell></TableRow>)}</TableBody></Table></div>} </CardContent></Card>
        {response?.meta && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Página {response.meta.page} de {Math.max(1, response.meta.totalPages)} · {response.meta.total} movimientos</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => changePage(page - 1)} disabled={page <= 1}><ChevronLeft /> Anterior</Button><Button variant="outline" size="sm" onClick={() => changePage(page + 1)} disabled={page >= response.meta.totalPages}><ChevronRight /> Siguiente</Button></div></div>}
    </div>;
}
