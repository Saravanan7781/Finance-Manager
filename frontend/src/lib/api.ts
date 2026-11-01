import { API_URL, DEMO } from './config';
import { getFirebaseAuth } from './firebase';
import type {
    Budget,
    CustomCategory,
    FamilyDetails,
    Goal,
    JoinRequest,
    Loan,
    Me,
    RecurringTx,
    Summary,
    SummaryScope,
    Trend,
    TrendRange,
    Tx,
    TxInput,
    TxType,
} from './types';

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const query = (params: Record<string, string | number | undefined | null>) => {
    const parts = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return parts.length ? `?${parts.join('&')}` : '';
};

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    if (DEMO) {
        const { demoRequest } = await import('./demo');
        return (await demoRequest(method, path, body)) as T;
    }

    const user = getFirebaseAuth().currentUser;
    const token = user ? await user.getIdToken() : null;

    const controller = new AbortController();
    // 60-second timeout to allow for Render free-tier cold starts (which take 30-50s)
    const timer = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
        if (__DEV__) {
            console.log(`[API Request] ${method} ${API_URL}/api${path}`);
        }
        response = await fetch(`${API_URL}/api${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (err) {
        if (__DEV__) {
            console.warn(`[API Error] Failed to reach ${API_URL}/api${path}:`, err);
        }
        throw new ApiError("Can't reach the server. Check your connection and that the API is running.", 0);
    } finally {
        clearTimeout(timer);
    }

    const text = await response.text();
    let json: any = null;
    if (text) {
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }
    }
    if (!response.ok) {
        throw new ApiError(json?.error || `Request failed (${response.status})`, response.status);
    }
    return json as T;
}

export const api = {
    register: (email: string, password: string, displayName: string) =>
        request<{ uid: string }>('POST', '/auth/register', { email, password, displayName }),

    me: () => request<Me>('GET', '/me'),
    updateMe: (displayName: string) => request<{ displayName: string }>('PATCH', '/me', { displayName }),

    createFamily: (familyName: string) =>
        request<{ familyId: string; inviteCode: string }>('POST', '/family/create', { familyName }),
    requestJoin: (inviteCode: string) =>
        request<{ requestId: string; familyName: string }>('POST', '/family/join', { inviteCode }),
    family: (familyId: string) => request<FamilyDetails>('GET', `/family/${familyId}`),
    renameFamily: (familyId: string, familyName: string) => request<{ name: string }>('PATCH', `/family/${familyId}`, { familyName }),
    joinRequests: (familyId: string) => request<JoinRequest[]>('GET', `/family/${familyId}/requests`),
    approveRequest: (id: string) => request<{ message: string }>('POST', `/family/requests/${id}/approve`),
    rejectRequest: (id: string) => request<{ message: string }>('POST', `/family/requests/${id}/reject`),
    leaveFamily: () => request<{ message: string }>('POST', '/family/leave'),
    removeMember: (familyId: string, userId: string) =>
        request<{ message: string }>('DELETE', `/family/${familyId}/members/${userId}`),
    transferAdmin: (familyId: string, userId: string) =>
        request<{ message: string }>('PUT', `/family/${familyId}/admin`, { userId }),
    regenerateInvite: (familyId: string) =>
        request<{ inviteCode: string }>('POST', `/family/${familyId}/invite`),
    addCustomCategory: (familyId: string, input: { name: string; type: TxType; tint?: string; icon?: string }) =>
        request<CustomCategory>('POST', `/family/${familyId}/categories`, input),
    deleteCustomCategory: (familyId: string, categoryId: string) =>
        request<{ message: string }>('DELETE', `/family/${familyId}/categories/${categoryId}`),

    transactions: (
        familyId: string,
        opts: { type?: TxType; category?: string; from?: string; to?: string; limit?: number; startAfter?: string; scope?: SummaryScope; search?: string } = {}
    ) => request<Tx[]>('GET', `/transactions/${familyId}${query(opts)}`),
    trend: (familyId: string, range: TrendRange, tzOffset: number, scope: SummaryScope = 'family') =>
        request<Trend>('GET', `/transactions/${familyId}/trend${query({ range, tzOffset, scope })}`),
    summary: (familyId: string, month: string, tzOffset: number, scope: SummaryScope = 'family') =>
        request<Summary>('GET', `/transactions/${familyId}/summary${query({ month, tzOffset, scope })}`),
    addTransaction: (input: TxInput) => request<{ id: string }>('POST', '/transactions', input),
    addTransactionsBatch: (familyId: string, items: Omit<TxInput, 'familyId'>[]) =>
        request<{ added: number; skipped: number; ids: string[] }>('POST', '/transactions/batch', { familyId, items }),
    updateTransaction: (id: string, input: Partial<Omit<TxInput, 'familyId'>>) =>
        request<{ message: string }>('PUT', `/transactions/${id}`, input),
    deleteTransaction: (id: string) => request<{ message: string }>('DELETE', `/transactions/${id}`),

    goals: (familyId: string) => request<Goal[]>('GET', `/goals/${familyId}`),
    addGoal: (input: { familyId: string; title: string; targetAmount: number; deadline?: string }) =>
        request<{ id: string }>('POST', '/goals', input),
    contributeToGoal: (goalId: string, amount: number, recordTransaction = false, paymentMethod?: string | null) =>
        request<{ currentAmount: number; completed: boolean }>('PUT', '/goals/update', { goalId, amount, recordTransaction, paymentMethod }),
    updateGoal: (id: string, input: { title?: string; targetAmount?: number; deadline?: string | null }) =>
        request<{ message: string }>('PUT', `/goals/${id}`, input),
    deleteGoal: (id: string) => request<{ message: string }>('DELETE', `/goals/${id}`),

    loans: (familyId: string, status?: 'open' | 'settled') =>
        request<Loan[]>('GET', `/loans/${familyId}${query({ status })}`),
    addLoan: (input: {
        familyId: string;
        direction: 'lent' | 'borrowed';
        person: string;
        amount: number;
        dueDate?: string;
        note?: string;
        recordTransaction?: boolean;
        paymentMethod?: string | null;
    }) => request<{ id: string }>('POST', '/loans', input),
    repayLoan: (id: string, amount?: number, recordTransaction = false, paymentMethod?: string | null) =>
        request<{ repaidAmount: number; outstanding: number; status: 'open' | 'settled' }>(
            'PUT',
            `/loans/${id}/repay`,
            { ...(amount === undefined ? {} : { amount }), recordTransaction, paymentMethod }
        ),
    updateLoan: (id: string, input: { person?: string; amount?: number; dueDate?: string | null; note?: string }) =>
        request<{ message: string }>('PUT', `/loans/${id}`, input),
    deleteLoan: (id: string) => request<{ message: string }>('DELETE', `/loans/${id}`),

    recurring: (familyId: string) => request<RecurringTx[]>('GET', `/recurring/${familyId}`),
    addRecurring: (input: {
        familyId: string;
        amount: number;
        type: TxType;
        category: string;
        description?: string;
        frequency: string;
        startDate?: string;
        paymentMethod?: string | null;
        autoRecord?: boolean;
    }) => request<{ id: string }>('POST', '/recurring', input),
    updateRecurring: (id: string, input: Partial<RecurringTx>) =>
        request<{ message: string }>('PUT', `/recurring/${id}`, input),
    deleteRecurring: (id: string) => request<{ message: string }>('DELETE', `/recurring/${id}`),
    recordRecurring: (id: string, paymentMethod?: string | null) =>
        request<{ message: string; transactionId: string; nextRunDate: string }>('POST', `/recurring/${id}/record`, { paymentMethod }),

    budgets: (familyId: string) => request<Budget[]>('GET', `/budgets/${familyId}`),
    setBudget: (familyId: string, category: string, limit: number) =>
        request<{ id: string }>('PUT', '/budgets', { familyId, category, limit }),
    deleteBudget: (id: string) => request<{ message: string }>('DELETE', `/budgets/${id}`),
};
