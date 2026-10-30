import { API_URL, DEMO } from './config';
import { getFirebaseAuth } from './firebase';
import type {
    Budget,
    FamilyDetails,
    Goal,
    JoinRequest,
    Loan,
    Me,
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
    const timer = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
        response = await fetch(`${API_URL}/api${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
        });
    } catch {
        throw new ApiError("Can't reach the server. Check your connection and that the API is running.", 0);
    } finally {
        clearTimeout(timer);
    }

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
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

    transactions: (
        familyId: string,
        opts: { type?: TxType; category?: string; from?: string; to?: string; limit?: number; startAfter?: string; scope?: SummaryScope } = {}
    ) => request<Tx[]>('GET', `/transactions/${familyId}${query(opts)}`),
    trend: (familyId: string, range: TrendRange, tzOffset: number, scope: SummaryScope = 'family') =>
        request<Trend>('GET', `/transactions/${familyId}/trend${query({ range, tzOffset, scope })}`),
    summary: (familyId: string, month: string, tzOffset: number, scope: SummaryScope = 'family') =>
        request<Summary>('GET', `/transactions/${familyId}/summary${query({ month, tzOffset, scope })}`),
    addTransaction: (input: TxInput) => request<{ id: string }>('POST', '/transactions', input),
    updateTransaction: (id: string, input: Partial<Omit<TxInput, 'familyId'>>) =>
        request<{ message: string }>('PUT', `/transactions/${id}`, input),
    deleteTransaction: (id: string) => request<{ message: string }>('DELETE', `/transactions/${id}`),

    goals: (familyId: string) => request<Goal[]>('GET', `/goals/${familyId}`),
    addGoal: (input: { familyId: string; title: string; targetAmount: number; deadline?: string }) =>
        request<{ id: string }>('POST', '/goals', input),
    contributeToGoal: (goalId: string, amount: number) =>
        request<{ currentAmount: number; completed: boolean }>('PUT', '/goals/update', { goalId, amount }),
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
    }) => request<{ id: string }>('POST', '/loans', input),
    repayLoan: (id: string, amount?: number) =>
        request<{ repaidAmount: number; outstanding: number; status: 'open' | 'settled' }>(
            'PUT',
            `/loans/${id}/repay`,
            amount === undefined ? {} : { amount }
        ),
    deleteLoan: (id: string) => request<{ message: string }>('DELETE', `/loans/${id}`),

    budgets: (familyId: string) => request<Budget[]>('GET', `/budgets/${familyId}`),
    setBudget: (familyId: string, category: string, limit: number) =>
        request<{ id: string }>('PUT', '/budgets', { familyId, category, limit }),
    deleteBudget: (id: string) => request<{ message: string }>('DELETE', `/budgets/${id}`),
};
