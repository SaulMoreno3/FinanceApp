import { FLEXIBLE_FUNDS_OPENING_BALANCE, isNonSpendingTransfer } from './bank-transfer';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../common/db/prisma';
import { decrypt, encrypt } from '../../common/utils/encryption';
import { debtsService } from '../debts/debts.service';
import { expensesService } from '../expenses/expenses.service';

const PROVIDER = 'truelayer';
const AUTH_URL = process.env.TRUELAYER_AUTH_URL ?? 'https://auth.truelayer.com';
const API_URL = process.env.TRUELAYER_API_URL ?? 'https://api.truelayer.com';
const FRONTEND_URL = process.env.WEB_APP_URL ?? 'https://finance.saulmoreno.es';
const SCOPES = 'info accounts balance transactions offline_access';
const INITIAL_HISTORY_YEARS = 6;

type TokenResponse = {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
};

type TrueLayerAccount = {
    account_id: string;
    display_name?: string;
    currency?: string;
    account_type?: string;
    account_number?: { iban?: string };
};

type TrueLayerTransaction = {
    transaction_id?: string;
    provider_transaction_id?: string;
    normalised_provider_transaction_id?: string;
    timestamp?: string;
    description?: string;
    merchant_name?: string;
    amount: number;
    currency?: string;
    transaction_category?: string;
    transaction_classification?: string[];
    meta?: Record<string, unknown>;
};

const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw Object.assign(new Error(`${name} is not configured`), { statusCode: 503 });
    return value;
};

const hashState = (state: string) => crypto.createHash('sha256').update(state).digest('hex');

const expenseCategory = (category: string | null | undefined, merchantName: string | null | undefined, description: string | null | undefined) => {
    const haystack = `${merchantName ?? ''} ${description ?? ''}`.toLocaleLowerCase('es-ES');
    if (/mcdonald|burger|restaurant|restaurante|bar |cafe |cafeter|deliveroo|just eat|ubereats|glovo|carrefour express/.test(haystack)) return 'Restaurantes';
    if (/albert heijn|jumbo|tesco|lidl|aldi|mercadona|carrefour|supermarket|supermercado/.test(haystack)) return 'Supermercado';
    if (/flixbus|uber|bolt|renfe|metro|bus |train|tren|taxi|aeropuerto|airport/.test(haystack)) return 'Transporte';
    if (/amazon|paypal|ebay|aliexpress|etsy|zalando/.test(haystack)) return 'Compras online';
    if (/netflix|spotify|disney|prime video|apple\.com|google\*/.test(haystack)) return 'Suscripciones';
    return category || 'Sin categoría';
};

const FLEXIBLE_FUNDS_NAME = 'Flexible Monetary Funds';
// TrueLayer does not expose this Revolut product as an account. This is the
// opening balance before the first imported movement, calibrated to the
// current balance supplied by the user; subsequent balance changes come only
// from the matched transfers.
const flexibleFundsWhere = {
    OR: [
        { description: { contains: 'Fondos Monetarios Flexibles', mode: 'insensitive' as const } },
        { description: { contains: 'Savings Vault topup', mode: 'insensitive' as const } },
        { description: { contains: 'Cuenta flexible', mode: 'insensitive' as const } },
    ],
};

const parseError = async (response: Response) => {
    const body = await response.text();
    return body.slice(0, 500) || `${response.status} ${response.statusText}`;
};

export class TrueLayerService {
    get isConfigured() {
        return Boolean(process.env.TRUELAYER_CLIENT_ID && process.env.TRUELAYER_CLIENT_SECRET);
    }

    async createConnectionUrl(userId: string, includeCards = false) {
        const clientId = required('TRUELAYER_CLIENT_ID');
        const redirectUri = process.env.TRUELAYER_REDIRECT_URI
            ?? `${FRONTEND_URL.replace(/\/$/, '')}/api/bank-sync/truelayer/callback`;
        const nonce = crypto.randomBytes(24).toString('base64url');
        const state = jwt.sign({ userId, nonce }, required('JWT_SECRET'), { expiresIn: '15m' });

        await prisma.bankConnection.upsert({
            where: { userId_provider: { userId, provider: PROVIDER } },
            create: { userId, provider: PROVIDER, status: 'PENDING', oauthStateHash: hashState(state), lastError: null },
            update: { oauthStateHash: hashState(state), lastError: null },
        });

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            scope: includeCards ? `${SCOPES} cards` : SCOPES,
            redirect_uri: redirectUri,
            state,
        });
        const providerId = process.env.TRUELAYER_PROVIDER_ID;
        if (providerId) {
            params.set('providers', providerId);
            params.set('provider_id', providerId);
        }
        return `${AUTH_URL}/?${params.toString()}`;
    }

    async completeConnection(code: string, state: string) {
        let claims: { userId?: string };
        try {
            claims = jwt.verify(state, required('JWT_SECRET')) as { userId?: string };
        } catch {
            throw Object.assign(new Error('Invalid or expired TrueLayer state'), { statusCode: 400 });
        }
        if (!claims.userId) throw Object.assign(new Error('Invalid TrueLayer state'), { statusCode: 400 });

        const connection = await prisma.bankConnection.findUnique({
            where: { userId_provider: { userId: claims.userId, provider: PROVIDER } },
        });
        if (!connection || connection.oauthStateHash !== hashState(state)) {
            throw Object.assign(new Error('TrueLayer connection state was not recognised'), { statusCode: 400 });
        }

        const tokens = await this.exchangeCode(code);
        if (!tokens.refresh_token) {
            throw Object.assign(new Error('TrueLayer did not return offline access'), { statusCode: 502 });
        }
        const access = encrypt(tokens.access_token);
        const refresh = encrypt(tokens.refresh_token);
        const now = Date.now();
        await prisma.bankConnection.update({
            where: { id: connection.id },
            data: {
                status: 'CONNECTED',
                accessTokenEncrypted: access.encryptedData,
                accessTokenIv: access.iv,
                refreshTokenEncrypted: refresh.encryptedData,
                refreshTokenIv: refresh.iv,
                accessTokenExpiresAt: new Date(now + (tokens.expires_in ?? 3600) * 1000),
                refreshTokenExpiresAt: tokens.refresh_token_expires_in
                    ? new Date(now + tokens.refresh_token_expires_in * 1000)
                    : null,
                lastError: null,
                oauthStateHash: null,
            },
        });
        await this.syncConnection(connection.id, claims.userId);
        return claims.userId;
    }

    private async exchangeCode(code: string) {
        const response = await fetch(`${AUTH_URL}/connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: required('TRUELAYER_CLIENT_ID'),
                client_secret: required('TRUELAYER_CLIENT_SECRET'),
                redirect_uri: process.env.TRUELAYER_REDIRECT_URI
                    ?? `${FRONTEND_URL.replace(/\/$/, '')}/api/bank-sync/truelayer/callback`,
                code,
            }),
        });
        if (!response.ok) throw Object.assign(new Error(`TrueLayer token exchange failed: ${await parseError(response)}`), { statusCode: 502 });
        return response.json() as Promise<TokenResponse>;
    }

    private async getAccessToken(connectionId: string) {
        const connection = await prisma.bankConnection.findUnique({ where: { id: connectionId } });
        if (!connection || connection.status !== 'CONNECTED' || !connection.refreshTokenEncrypted || !connection.refreshTokenIv) {
            throw Object.assign(new Error('TrueLayer connection requires authorisation'), { statusCode: 401 });
        }
        if (connection.refreshTokenExpiresAt && connection.refreshTokenExpiresAt <= new Date()) {
            await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: 'REAUTH_REQUIRED' } });
            throw Object.assign(new Error('TrueLayer authorisation has expired'), { statusCode: 401 });
        }
        if (connection.accessTokenEncrypted && connection.accessTokenIv && connection.accessTokenExpiresAt
            && connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
            return decrypt(connection.accessTokenEncrypted, connection.accessTokenIv);
        }

        const refreshToken = decrypt(connection.refreshTokenEncrypted, connection.refreshTokenIv);
        const response = await fetch(`${AUTH_URL}/connect/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: required('TRUELAYER_CLIENT_ID'),
                client_secret: required('TRUELAYER_CLIENT_SECRET'),
                refresh_token: refreshToken,
            }),
        });
        if (!response.ok) {
            await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: 'REAUTH_REQUIRED', lastError: await parseError(response) } });
            throw Object.assign(new Error('TrueLayer authorisation must be renewed'), { statusCode: 401 });
        }
        const tokens = await response.json() as TokenResponse;
        const access = encrypt(tokens.access_token);
        const refresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
        await prisma.bankConnection.update({
            where: { id: connection.id },
            data: {
                accessTokenEncrypted: access.encryptedData,
                accessTokenIv: access.iv,
                ...(refresh ? { refreshTokenEncrypted: refresh.encryptedData, refreshTokenIv: refresh.iv } : {}),
                accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
                ...(tokens.refresh_token_expires_in ? {
                    refreshTokenExpiresAt: new Date(Date.now() + tokens.refresh_token_expires_in * 1000),
                } : {}),
            },
        });
        return tokens.access_token;
    }

    private async api<T>(accessToken: string, path: string, params?: Record<string, string>) {
        const url = new URL(`${API_URL}${path}`);
        Object.entries(params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) throw Object.assign(new Error(`TrueLayer request failed: ${await parseError(response)}`), {providerStatus:response.status});
        return response.json() as Promise<T>;
    }

    async syncForUser(userId: string) {
        const connection = await prisma.bankConnection.findUnique({
            where: { userId_provider: { userId, provider: PROVIDER } },
        });
        if (!connection) throw Object.assign(new Error('Revolut no está conectado'), { statusCode: 404 });
        return this.syncConnection(connection.id, userId);
    }

    async syncConnection(connectionId: string, userId: string) {
        try {
            const accessToken = await this.getAccessToken(connectionId);
            const connection = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connectionId } });
            const accountsResponse = await this.api<{ results: TrueLayerAccount[] }>(accessToken, '/data/v1/accounts');
            let accountsCount = 0;
            let transactionsCount = 0;

            for (const account of accountsResponse.results ?? []) {
                const saved = await prisma.bankAccount.upsert({
                    where: { connectionId_providerAccountId: { connectionId, providerAccountId: account.account_id } },
                    create: {
                        userId, connectionId, providerAccountId: account.account_id,
                        name: account.display_name ?? null, iban: account.account_number?.iban ?? null,
                        currency: account.currency ?? 'EUR', accountType: account.account_type ?? null,
                    },
                    update: {
                        name: account.display_name ?? null, iban: account.account_number?.iban ?? null,
                        currency: account.currency ?? 'EUR', accountType: account.account_type ?? null,
                    },
                });
                accountsCount++;

                const balance = await this.api<{ results: Array<{ currency?: string; current?: number; available?: number }> }>(accessToken, `/data/v1/accounts/${encodeURIComponent(account.account_id)}/balance`);
                const matching = (balance.results ?? []).find(item => item.currency === saved.currency) ?? balance.results?.[0];
                if (matching) {
                    await prisma.bankAccount.update({
                        where: { id: saved.id },
                        data: { balance: matching.current ?? null, availableBalance: matching.available ?? null, balanceUpdatedAt: new Date() },
                    });
                }

                const from = connection.lastSyncAt
                    ? new Date(connection.lastSyncAt.getTime() - 3 * 24 * 60 * 60 * 1000)
                    : this.initialHistoryStart();
                const transactions = await this.fetchTransactions(accessToken, account.account_id, from, new Date());
                for (const transaction of transactions) {
                    const providerTransactionId = transaction.transaction_id
                        ?? transaction.normalised_provider_transaction_id
                        ?? transaction.provider_transaction_id;
                    if (!providerTransactionId || !Number.isFinite(Number(transaction.amount))) continue;
                    await prisma.bankTransaction.upsert({
                        where: { accountId_providerTransactionId: { accountId: saved.id, providerTransactionId } },
                        create: {
                            userId, accountId: saved.id, providerTransactionId,
                            date: transaction.timestamp ? new Date(transaction.timestamp) : new Date(),
                            amount: transaction.amount, currency: transaction.currency ?? saved.currency,
                            description: transaction.description ?? null, merchantName: transaction.merchant_name ?? null,
                            category: transaction.transaction_category ?? transaction.transaction_classification?.[0] ?? null,
                            direction: transaction.amount >= 0 ? 'income' : 'expense', rawData: transaction as any,
                        },
                        update: {
                            date: transaction.timestamp ? new Date(transaction.timestamp) : undefined,
                            description: transaction.description ?? null, merchantName: transaction.merchant_name ?? null,
                            category: transaction.transaction_category ?? transaction.transaction_classification?.[0] ?? null,
                            direction: transaction.amount >= 0 ? 'income' : 'expense', rawData: transaction as any,
                        },
                    });
                    transactionsCount++;
                }
            }

            await prisma.bankConnection.update({ where: { id: connectionId }, data: { lastSyncAt: new Date(), lastError: null, status: 'CONNECTED' } });
            const debtReconciliation = await debtsService.reconcileUser(userId);
            const cardSync = await expensesService.syncProviderCards(userId, connectionId, path => this.api<any>(accessToken,path));
            await expensesService.reconcile(userId);
            return { accountsCount, transactionsCount, debtReconciliation, cardSync, syncedAt: new Date().toISOString() };
        } catch (error: any) {
            await prisma.bankConnection.update({ where: { id: connectionId }, data: { status: error.statusCode === 401 ? 'REAUTH_REQUIRED' : 'ERROR', lastError: error.message?.slice(0, 500) } }).catch(() => undefined);
            throw error;
        }
    }

    private async fetchTransactions(accessToken: string, accountId: string, from: Date, to: Date) {
        const all: TrueLayerTransaction[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 100; page++) {
            const response = await this.api<{ results: TrueLayerTransaction[]; meta?: { cursors?: { next?: string } } }>(
                accessToken,
                `/data/v1/accounts/${encodeURIComponent(accountId)}/transactions`,
                {
                    from: from.toISOString().slice(0, 10),
                    to: to.toISOString().slice(0, 10),
                    ...(cursor ? { cursor } : {}),
                },
            );
            all.push(...(response.results ?? []));
            cursor = response.meta?.cursors?.next;
            if (!cursor) break;
        }
        return all;
    }

    private initialHistoryStart() {
        const start = new Date();
        start.setFullYear(start.getFullYear() - INITIAL_HISTORY_YEARS);
        return start;
    }

    async getStatus(userId: string) {
        const connection = await prisma.bankConnection.findUnique({
            where: { userId_provider: { userId, provider: PROVIDER } },
            include: { accounts: { select: { id: true, name: true, currency: true, balance: true, availableBalance: true, balanceUpdatedAt: true } } },
        });
        if (!connection) return { configured: this.isConfigured, connected: false, status: 'DISCONNECTED', accounts: [] };
        const flexibleFunds = await prisma.bankTransaction.aggregate({
            // Keep the reconciled current balance based on the current
            // TrueLayer label. Legacy labels are included in the history
            // view below, but their old records are not reliable enough to
            // alter the reconciled balance automatically.
            where: { userId, description: { contains: 'Fondos Monetarios Flexibles', mode: 'insensitive' } },
            _sum: { amount: true },
        });
        // Bank movements are signed from the main account's perspective:
        // money sent to the fund is negative there and money returned is
        // positive. Reverse that sign for the fund's own balance.
        const flexibleFundsBalance = FLEXIBLE_FUNDS_OPENING_BALANCE - Number(flexibleFunds._sum.amount ?? 0);

        return {
            configured: this.isConfigured,
            connected: connection.status === 'CONNECTED', status: connection.status,
            lastSyncAt: connection.lastSyncAt, lastError: connection.lastError,
            accounts: [
                ...connection.accounts.map(account => ({ ...account, balance: account.balance ? Number(account.balance) : null, availableBalance: account.availableBalance ? Number(account.availableBalance) : null, calculated: false })),
                {
                    id: 'calculated-flexible-monetary-funds',
                    name: FLEXIBLE_FUNDS_NAME,
                    currency: 'EUR',
                    balance: flexibleFundsBalance,
                    availableBalance: null,
                    calculated: true,
                },
            ],
        };
    }

    async getOverview(userId: string, month?: string) {
        const status = await this.getStatus(userId);
        const selectedMonth = month ?? new Date().toISOString().slice(0, 7);
        const [year, monthNumber] = selectedMonth.split('-').map(Number);
        const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
        const monthEnd = new Date(Date.UTC(year, monthNumber, 1));
        const date = { gte: monthStart, lt: monthEnd };
        const [recent, monthRows, oldest] = await Promise.all([
            prisma.bankTransaction.findMany({ where: { userId, date }, orderBy: { date: 'desc' }, take: 8, include: { account: { select: { name: true, currency: true } } } }),
            prisma.bankTransaction.findMany({ where: { userId, date }, select: { amount: true, category: true, currency: true, merchantName: true, description: true } }),
            prisma.bankTransaction.findFirst({ where: { userId }, orderBy: { date: 'asc' }, select: { date: true } }),
        ]);
        const byCurrency = new Map<string, { income: number; expenses: number }>();
        const byCategory = new Map<string, number>();
        for (const row of monthRows) {
            // Transfers to/from the calculated money-market account are
            // movements between the user's own accounts, not income or
            // spending. They are represented by the virtual account above.
            if (isNonSpendingTransfer(row.description)) continue;
            const category = expenseCategory(row.category, row.merchantName, row.description);
            const currency = row.currency || 'EUR';
            const current = byCurrency.get(currency) ?? { income: 0, expenses: 0 };
            if (Number(row.amount) >= 0) current.income += Number(row.amount);
            else current.expenses += Math.abs(Number(row.amount));
            byCurrency.set(currency, current);
            // The category card is explicitly an expenses view. Credits and
            // other positive movements belong in the income totals, never in
            // the expense breakdown.
            if (Number(row.amount) < 0) {
                const categoryKey = `${category}|||${currency}`;
                byCategory.set(categoryKey, (byCategory.get(categoryKey) ?? 0) + Math.abs(Number(row.amount)));
            }
        }
        return {
            ...status,
            selectedMonth,
            firstMonth: oldest?.date.toISOString().slice(0, 7) ?? selectedMonth,
            month: {
                byCurrency: [...byCurrency.entries()].map(([currency, values]) => ({ currency, ...values, net: values.income - values.expenses })),
                byCategory: [...byCategory.entries()].map(([key, amount]) => { const [category, currency] = key.split('|||'); return { category, currency, amount }; }).sort((a, b) => b.amount - a.amount),
            },
            recent: recent.map(transaction => ({
                ...transaction,
                amount: Number(transaction.amount),
                account: transaction.account,
            })),
        };
    }

    async getBalanceHistory(userId: string) {
        const status = await this.getStatus(userId);
        const connection = await prisma.bankConnection.findUnique({
            where: { userId_provider: { userId, provider: PROVIDER } },
            include: { accounts: { select: { id: true, name: true, currency: true, balance: true } } },
        });
        if (!connection) return { accounts: [], monthly: [], yearly: [], global: 0 };

        const realAccountIds = connection.accounts.map((account) => account.id);
        const rows = await prisma.bankTransaction.findMany({
            where: { userId, accountId: { in: realAccountIds } },
            select: { accountId: true, date: true, amount: true },
            orderBy: { date: 'asc' },
        });
        const fundRows = await prisma.bankTransaction.findMany({
            where: { userId, description: { contains: 'Fondos Monetarios Flexibles', mode: 'insensitive' } },
            select: { date: true, amount: true },
            orderBy: { date: 'asc' },
        });
        const accounts = [
            ...connection.accounts.map((account) => ({ id: account.id, name: account.name || 'Cuenta bancaria', currency: account.currency, currentBalance: Number(account.balance ?? 0) })),
            { id: 'calculated-flexible-monetary-funds', name: FLEXIBLE_FUNDS_NAME, currency: 'EUR', currentBalance: Number(status.accounts.find((account: any) => account.id === 'calculated-flexible-monetary-funds')?.balance ?? 0) },
        ];
        const firstDate = rows[0]?.date ?? new Date();
        const firstMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
        const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const monthKeys: string[] = [];
        for (const cursor = new Date(firstMonth); cursor <= lastMonth; cursor.setMonth(cursor.getMonth() + 1)) monthKeys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
        const monthly = monthKeys.map((key) => {
            const end = new Date(`${key}-01T00:00:00.000Z`); end.setUTCMonth(end.getUTCMonth() + 1);
            const balances: Record<string, number | null> = {};
            for (const account of accounts) {
                if (account.id === 'calculated-flexible-monetary-funds') {
                    balances[account.id] = end <= new Date('2024-08-20T00:00:00Z') ? null : account.currentBalance - fundRows.filter((row) => row.date >= end).reduce((sum, row) => sum + Number(row.amount), 0);
                } else {
                    balances[account.id] = account.currentBalance - rows.filter((row) => row.accountId === account.id && row.date >= end).reduce((sum, row) => sum + Number(row.amount), 0);
                }
            }
            return { period: key, balances, total: Object.values(balances).reduce((sum: number, value) => sum + Number(value ?? 0), 0) };
        });
        const yearlyMap = new Map<string, typeof monthly[number]>();
        for (const point of monthly) yearlyMap.set(point.period.slice(0, 4), point);
        return { accounts, monthly, yearly: [...yearlyMap.entries()].map(([period, point]) => ({ ...point, period })), global: accounts.reduce((sum, account) => sum + account.currentBalance, 0) };
    }

    async getTransactions(userId: string, query: { page?: number; limit?: number; accountId?: string; category?: string; from?: string; to?: string }) {
        const page = Math.max(1, query.page ?? 1);
        const limit = Math.min(100, Math.max(1, query.limit ?? 50));
        const isFlexibleFunds = query.accountId === 'calculated-flexible-monetary-funds';
        const where: any = {
            userId,
            ...(isFlexibleFunds ? flexibleFundsWhere : query.accountId ? { accountId: query.accountId } : {}),
            ...(query.category ? { category: query.category } : {}),
            ...(query.from || query.to ? { date: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
        };
        const [transactions, total] = await Promise.all([
            prisma.bankTransaction.findMany({ where, orderBy: { date: 'desc' }, skip: (page - 1) * limit, take: limit, include: { account: { select: { name: true, currency: true } } } }),
            prisma.bankTransaction.count({ where }),
        ]);
        return {
            data: transactions.map(transaction => ({
                ...transaction,
                // TrueLayer stores the movement from the principal account's
                // perspective. Reverse it in the fund view.
                amount: isFlexibleFunds ? -Number(transaction.amount) : Number(transaction.amount),
                rawData: undefined,
                ...(isFlexibleFunds ? { account: { name: FLEXIBLE_FUNDS_NAME, currency: 'EUR' } } : {}),
            })),
            ...(isFlexibleFunds ? {
                // The history includes legacy labels for completeness, but
                // the displayed balance remains the reconciled current
                // balance and must not be recalculated from those legacy rows.
                balance: FLEXIBLE_FUNDS_OPENING_BALANCE - Number((await prisma.bankTransaction.aggregate({
                    where: { userId, description: { contains: 'Fondos Monetarios Flexibles', mode: 'insensitive' } },
                    _sum: { amount: true },
                }))._sum.amount ?? 0),
                accountName: FLEXIBLE_FUNDS_NAME,
                accountCurrency: 'EUR',
            } : {}),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async disconnect(userId: string) {
        await prisma.bankConnection.updateMany({ where: { userId, provider: PROVIDER }, data: { status: 'DISCONNECTED', accessTokenEncrypted: null, accessTokenIv: null, refreshTokenEncrypted: null, refreshTokenIv: null, oauthStateHash: null } });
    }

    async syncAllConnections() {
        const connections = await prisma.bankConnection.findMany({ where: { provider: PROVIDER, status: 'CONNECTED' }, select: { id: true, userId: true } });
        for (const connection of connections) {
            await this.syncConnection(connection.id, connection.userId).catch(error => console.error(`[bank-sync] ${connection.userId}:`, error.message));
        }
    }
}

export const trueLayerService = new TrueLayerService();
