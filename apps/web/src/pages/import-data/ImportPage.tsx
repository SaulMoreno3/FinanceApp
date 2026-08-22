import { useState, useEffect } from 'react';
import { FilePond } from 'react-filepond';
import 'filepond/dist/filepond.min.css';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';

// Import FilePond styles
import { fetchAPI, postAPI } from '@/lib/api';
import 'filepond/dist/filepond.min.css';
import { Link } from 'react-router-dom';

export default function ImportPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [myInvestorMovements, setMyInvestorMovements] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [myInvestorOrders, setMyInvestorOrders] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [revolutFiles, setRevolutFiles] = useState<any[]>([]);

    const [lastUpdatedMyInvestor, setLastUpdatedMyInvestor] = useState<string>("Loading...");
    const [lastUpdatedRevolut, setLastUpdatedRevolut] = useState<string>("Loading...");
    const [bankStatus, setBankStatus] = useState<{
        configured: boolean;
        connected: boolean;
        status: string;
        lastSyncAt?: string | null;
        lastError?: string | null;
        accounts: Array<{ id: string; name: string | null; currency: string; balance: number | null }>;
    }>({ configured: false, connected: false, status: 'DISCONNECTED', accounts: [] });
    const [bankBusy, setBankBusy] = useState(false);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                // Assuming endpoint exists as per user request
                const [data, connection] = await Promise.all([
                    fetchAPI<{ myinvestor: string, revolut: string }>('/import/status'),
                    fetchAPI<typeof bankStatus>('/bank-sync/status'),
                ]);
                // Assuming data format: { myinvestor: string, revolut: string }
                // We can format the date here if needed, e.g., using date-fns or Intl.DateTimeFormat
                // For now, assuming the backend sends a readable string or ISO date
                setLastUpdatedMyInvestor(data.myinvestor ? new Date(data.myinvestor).toLocaleDateString() : "Never");
                setLastUpdatedRevolut(data.revolut ? new Date(data.revolut).toLocaleDateString() : "Never");
                setBankStatus(connection);
            } catch (error: unknown) {
                console.error("Failed to fetch import status:", error);
                setLastUpdatedMyInvestor("Error");
                setLastUpdatedRevolut("Error");
            }
        };

        fetchStatus();
        const params = new URLSearchParams(window.location.search);
        if (params.get('truelayer') === 'connected') {
            window.history.replaceState({}, '', '/import');
        }
        if (params.get('truelayer') === 'error') {
            alert(`No se pudo conectar Revolut: ${params.get('message') ?? 'error desconocido'}`);
            window.history.replaceState({}, '', '/import');
        }
    }, []);

    const connectBank = async () => {
        setBankBusy(true);
        try {
            const { url } = await fetchAPI<{ url: string }>('/bank-sync/truelayer/connect');
            window.location.assign(url);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No se pudo iniciar la conexión');
            setBankBusy(false);
        }
    };

    const syncBank = async () => {
        setBankBusy(true);
        try {
            await postAPI('/bank-sync/sync', {});
            const status = await fetchAPI<typeof bankStatus>('/bank-sync/status');
            setBankStatus(status);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No se pudo sincronizar Revolut');
        } finally {
            setBankBusy(false);
        }
    };

    const disconnectBank = async () => {
        if (!window.confirm('¿Desconectar Revolut? Se borrarán los tokens de acceso, pero se conservarán los movimientos ya importados.')) return;
        setBankBusy(true);
        try {
            await fetchAPI('/bank-sync/connection', { method: 'DELETE' });
            setBankStatus({ configured: bankStatus.configured, connected: false, status: 'DISCONNECTED', accounts: [] });
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No se pudo desconectar Revolut');
        } finally {
            setBankBusy(false);
        }
    };

    const handleUploadMyInvestor = async () => {
        if (myInvestorMovements.length === 0) {
            alert('Please select a Movements file');
            return;
        }

        const formData = new FormData();
        formData.append('movements', myInvestorMovements[0].file);

        if (myInvestorOrders.length > 0) {
            formData.append('orders', myInvestorOrders[0].file);
        }

        try {
            const result = await postAPI<{ data: { tradesCount: number; transfersCount: number } }>('/import/myinvestor', formData);
            alert(`Success! Imported ${result.data.tradesCount} trades and ${result.data.transfersCount} transfers.`);
            setMyInvestorMovements([]);
            setMyInvestorOrders([]);
        } catch (error: unknown) {
            console.error(error);
            const msg = error instanceof Error ? error.message : "Unknown error";
            alert(`Error uploading MyInvestor files: ${msg}`);
        }
    };

    const handleUploadRevolut = async () => {
        if (revolutFiles.length === 0) {
            alert('Please select a file');
            return;
        }

        const formData = new FormData();
        formData.append('file', revolutFiles[0].file);

        try {
            await postAPI<void>('/import/revolut', formData);

            alert('Success! Revolut data imported.');
            setRevolutFiles([]);
        } catch (error: unknown) {
            console.error(error);
            const msg = error instanceof Error ? error.message : "Unknown error";
            alert(`Error uploading Revolut file: ${msg}`);
        }
    };

    return (
        <div className="space-y-8 p-4 md:p-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Import Data</h1>
                <p className="text-muted-foreground">
                    Upload your bank statements to update your portfolio.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Conexión automática de Revolut</CardTitle>
                        <CardDescription>Sincroniza cuentas, saldos y gastos una vez al día. La autorización se realiza en Revolut y no guardamos tus credenciales.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!bankStatus.configured ? (
                            <p className="text-sm text-muted-foreground">La conexión aún no está configurada en el servidor.</p>
                        ) : bankStatus.connected ? (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-3 text-sm">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-500"><CheckCircle2 className="h-4 w-4" /> Conectada</span>
                                    <span className="text-muted-foreground">Última sincronización: {bankStatus.lastSyncAt ? new Date(bankStatus.lastSyncAt).toLocaleString() : 'pendiente'}</span>
                                </div>
                                {bankStatus.accounts.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {bankStatus.accounts.map(account => <div key={account.id} className="rounded-lg border p-3">
                                        <div className="text-sm font-medium">{account.name || 'Cuenta Revolut'}</div>
                                        <div className="text-lg font-semibold">{account.balance === null ? '—' : `${account.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${account.currency}`}</div>
                                    </div>)}
                                </div>}
                                {bankStatus.lastError && <p className="text-sm text-destructive">{bankStatus.lastError}</p>}
                                <div className="flex flex-wrap gap-2">
                                    <Link to="/banking" className="inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium">Ver cuentas e historial</Link>
                                    <button onClick={syncBank} disabled={bankBusy} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Sincronizar ahora</button>
                                    <button onClick={disconnectBank} disabled={bankBusy} className="inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50"><Unlink className="h-4 w-4" /> Desconectar</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <p className="text-sm text-muted-foreground">Conecta Revolut para importar automáticamente tus gastos y saldos.</p>
                                <button onClick={connectBank} disabled={bankBusy} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{bankBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Conectar Revolut</button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* MyInvestor Section */}
                <Card className="flex flex-col h-full">
                    <CardHeader>
                        <CardTitle>MyInvestor</CardTitle>
                        <CardDescription>Upload CSV files</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col space-y-6">
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium">Movimientos (Required)</h4>
                            <div className="filepond-wrapper dark-mode">
                                <FilePond
                                    files={myInvestorMovements}
                                    onupdatefiles={setMyInvestorMovements}
                                    allowMultiple={false}
                                    maxFiles={1}
                                    name="movements"
                                    labelIdle='Drag & Drop "Movimientos" CSV'
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-sm font-medium">Orders (Optional)</h4>
                            <div className="filepond-wrapper dark-mode">
                                <FilePond
                                    files={myInvestorOrders}
                                    onupdatefiles={setMyInvestorOrders}
                                    allowMultiple={false}
                                    maxFiles={1}
                                    name="orders"
                                    labelIdle='Drag & Drop "Orders" CSV'
                                />
                            </div>
                        </div>

                        <div className="mt-auto pt-4 border-t flex items-center justify-between">
                            <div className="flex items-center text-sm text-muted-foreground">
                                <Clock className="mr-2 h-4 w-4" />
                                <span>Last updated: {lastUpdatedMyInvestor}</span>
                            </div>
                            <button
                                onClick={handleUploadMyInvestor}
                                disabled={myInvestorMovements.length === 0}
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                            >
                                Upload MyInvestor
                            </button>
                        </div>
                    </CardContent>
                </Card>

                {/* Revolut Section */}
                <Card className="flex flex-col h-full">
                    <CardHeader>
                        <CardTitle>Revolut</CardTitle>
                        <CardDescription>Upload PDF Statement</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col space-y-6">
                        <div className="filepond-wrapper dark-mode">
                            <FilePond
                                files={revolutFiles}
                                onupdatefiles={setRevolutFiles}
                                allowMultiple={false}
                                maxFiles={1}
                                name="file"
                                labelIdle='Drag & Drop PDF Statement'
                            />
                        </div>
                        <div className="mt-auto pt-4 border-t flex items-center justify-between">
                            <div className="flex items-center text-sm text-muted-foreground">
                                <Clock className="mr-2 h-4 w-4" />
                                <span>Last updated: {lastUpdatedRevolut}</span>
                            </div>
                            <button
                                onClick={handleUploadRevolut}
                                disabled={revolutFiles.length === 0}
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                            >
                                Upload Revolut
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Custom Styles for FilePond to match Dark Mode */}
            <style>{`
        .filepond--panel-root {
            background-color: hsl(var(--secondary));
            border: 1px solid hsl(var(--border));
        }
        .filepond--drop-label {
            color: hsl(var(--muted-foreground));
        }
        .filepond--label-action {
            text-decoration-color: hsl(var(--primary));
        }
        .filepond--item-panel {
            background-color: hsl(var(--primary));
        }
        .filepond--credits {
            display: none;
        }
      `}</style>
        </div>
    );
}
