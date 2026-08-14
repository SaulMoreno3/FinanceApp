export type DebtStatus = 'ACTIVE' | 'PAID_OFF' | 'ARCHIVED';

export type Debt = {
    id: string;
    name: string;
    lender: string | null;
    assetName: string | null;
    originalPrincipal: number;
    totalRepayable: number | null;
    currentBalance: number;
    interestRate: number | null;
    apr: number | null;
    monthlyPayment: number | null;
    totalPayments: number | null;
    paidPayments: number;
    remainingPayments: number | null;
    paidAmount: number;
    progressPercent: number;
    startDate: string | null;
    maturityDate: string | null;
    nextPaymentDate: string | null;
    currency: 'EUR' | 'USD';
    status: DebtStatus;
    notes: string | null;
};

export type DebtFormData = Omit<Debt, 'id' | 'remainingPayments' | 'paidAmount' | 'progressPercent'>;

export type DebtScheduleRow = {
    id: string;
    installment: number;
    dueDate: string;
    paymentAmount: number;
    principalAmount: number;
    interestAmount: number;
    balanceAfter: number;
};
