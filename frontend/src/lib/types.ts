export type TxType = 'income' | 'expense';

export interface FamilyBrief {
    id: string;
    name: string;
    inviteCode: string;
    admin: string;
    memberCount: number;
}

export interface Me {
    uid: string;
    email: string;
    displayName: string;
    role: 'admin' | 'member';
    familyId: string | null;
    family: FamilyBrief | null;
    pendingRequest: { id: string; familyId: string; familyName: string | null; createdAt: string } | null;
}

export interface Member {
    uid: string;
    displayName: string;
    email: string | null;
    role: 'admin' | 'member';
}

export interface CustomCategory {
    id: string;
    name: string;
    type: TxType;
    tint?: string;
    icon?: string;
    createdAt?: string;
}

export interface FamilyDetails {
    id: string;
    name: string;
    inviteCode: string;
    admin: string;
    createdAt: string;
    members: Member[];
    customCategories?: CustomCategory[];
}

export interface JoinRequest {
    id: string;
    familyId: string;
    userId: string;
    displayName: string;
    email: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
}

export interface Tx {
    id: string;
    familyId: string;
    createdBy: string;
    createdByName: string | null;
    amount: number;
    type: TxType;
    category: string;
    description: string;
    paymentMethod: string | null;
    source: 'manual' | 'sms';
    date: string;
    countForNextMonth?: boolean;
    isSplit?: boolean;
    myShare?: number | null;
    lentAmount?: number | null;
    splitWith?: string | null;
    createdAt: string;
}

export interface TxInput {
    familyId: string;
    amount: number;
    type: TxType;
    category: string;
    description?: string;
    paymentMethod?: string | null;
    date?: string;
    source?: 'manual' | 'sms';
    dedupeKey?: string | null;
    countForNextMonth?: boolean;
    isSplit?: boolean;
    myShare?: number | null;
    lentAmount?: number | null;
    splitWith?: string | null;
}

export interface CategoryShare {
    category: string;
    total: number;
    count: number;
    percent: number;
}

export type SummaryScope = 'family' | 'me';

export type TrendRange = 'day' | 'week' | 'month' | 'year';

// One bar of the spending chart. `start` and `end` are real instants, so they can be passed straight
// back to the transaction list as `from` and `to` to fetch exactly what the bar adds up.
export interface TrendBucket {
    localStart: string;
    start: string;
    end: string;
    expense: number;
    income: number;
}

export interface TrendCategory {
    category: string;
    total: number;
    percent: number;
}

export interface Trend {
    range: TrendRange;
    scope: SummaryScope;
    buckets: TrendBucket[];
    // Spending per category across the whole window, biggest first (for the pie chart).
    byCategory: TrendCategory[];
}

export interface Summary {
    month: string;
    scope: SummaryScope;
    tzOffset: number;
    balance: number;
    income: number;
    expense: number;
    net: number;
    previousExpense: number;
    expenseChangePercent: number | null;
    transactionCount: number;
    byCategory: CategoryShare[];
    byDay: { date: string; income: number; expense: number }[];
    byMember: { userId: string; name: string; expense: number }[];
}

export interface Goal {
    id: string;
    familyId: string;
    title: string;
    targetAmount: number;
    currentAmount: number;
    deadline: string | null;
    createdAt: string;
}

export interface Loan {
    id: string;
    familyId: string;
    direction: 'lent' | 'borrowed';
    person: string;
    amount: number;
    repaidAmount: number;
    dueDate: string | null;
    note: string;
    status: 'open' | 'settled';
    createdAt: string;
    settledAt: string | null;
}

export interface Budget {
    id: string;
    familyId: string;
    category: string;
    limit: number;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringTx {
    id: string;
    familyId: string;
    createdBy: string;
    createdByName?: string | null;
    amount: number;
    type: TxType;
    category: string;
    description: string;
    frequency: RecurringFrequency;
    startDate: string;
    nextRunDate: string;
    lastRunDate?: string | null;
    paymentMethod?: string | null;
    autoRecord: boolean;
    status: 'active' | 'paused';
    createdAt: string;
    updatedAt?: string;
}
