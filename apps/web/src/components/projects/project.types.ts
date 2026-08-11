export type ProjectEntryType = 'INCOME' | 'EXPENSE';
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type ProjectPaymentStatus = 'PENDING' | 'PAID';

export interface ProjectSummary {
    id: string;
    name: string;
    description: string | null;
    client: string | null;
    budget: number | null;
    status: ProjectStatus;
    income: number;
    expense: number;
    balance: number;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectEntry {
    id: string;
    type: ProjectEntryType;
    amount: number;
    description: string;
    category: string | null;
    counterparty: string | null;
    reference: string | null;
    notes: string | null;
    paymentStatus: ProjectPaymentStatus;
    date: string;
    dueDate: string | null;
    fileName: string | null;
    fileMimeType: string | null;
    createdAt: string;
}

export interface ProjectDetail extends ProjectSummary {
    entries: ProjectEntry[];
}
