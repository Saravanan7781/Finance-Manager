// In-memory stand-in for the API, used when EXPO_PUBLIC_DEMO=1. It mirrors the real endpoints closely
// enough to preview every screen with believable data and no Firebase or server.

import { ApiError } from './api';
import type { Budget, FamilyDetails, Goal, JoinRequest, Loan, Me, Summary, SummaryScope, Trend, TrendRange, Tx } from './types';

const DAY = 86400000;
const iso = (daysAgo: number, hour = 12) => {
    const d = new Date(Date.now() - daysAgo * DAY);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

const ME = 'u1';
const FAMILY = 'fam1';
const members = [
    { uid: 'u1', displayName: 'Prasath', email: 'prasath@demo.dev' },
    { uid: 'u2', displayName: 'Asha', email: 'asha@demo.dev' },
    { uid: 'u3', displayName: 'Ravi', email: 'ravi@demo.dev' },
];
const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? 'Member';

let counter = 100;
const id = (prefix: string) => `${prefix}${++counter}`;

const seed: [number, 'income' | 'expense', string, number, string, string, string][] = [
    [0, 'expense', 'Groceries', 604.36, 'BigBasket order', 'u2', 'UPI'],
    [0, 'expense', 'Cafes and Restaurants', 428, 'Filter Coffee House', 'u1', 'Card'],
    [1, 'income', 'Salary', 85000, 'October salary', 'u1', 'Bank'],
    [1, 'expense', 'Travel', 212.5, 'Metro recharge', 'u3', 'UPI'],
    [2, 'expense', 'Clothes and Shoes', 1296.65, 'Nike', 'u2', 'Card'],
    [3, 'expense', 'Health', 890, 'Apollo Pharmacy', 'u1', 'UPI'],
    [4, 'expense', 'Groceries', 1240, 'Fresh Mart', 'u2', 'Cash'],
    [5, 'expense', 'Sport', 1799, 'Cult.fit pass', 'u3', 'Card'],
    [6, 'expense', 'Bills', 2450, 'Electricity', 'u1', 'UPI'],
    [8, 'expense', 'Cafes and Restaurants', 1560, 'Dinner at Murugan Idli', 'u1', 'UPI'],
    [9, 'expense', 'Groceries', 980.4, 'Nilgiris', 'u2', 'UPI'],
    [11, 'expense', 'Travel', 3200, 'Cab to airport', 'u3', 'Card'],
    [12, 'income', 'Business', 12000, 'Freelance payout', 'u3', 'Bank'],
    [14, 'expense', 'Rent', 22000, 'October rent', 'u1', 'Bank'],
    [17, 'expense', 'Entertainment', 650, 'Movie night', 'u2', 'Card'],
    [20, 'expense', 'Groceries', 1100, 'Weekly veggies', 'u2', 'Cash'],
    [24, 'expense', 'Health', 1500, 'Dental check-up', 'u1', 'Card'],
    [29, 'expense', 'Fuel', 2000, 'Petrol', 'u1', 'UPI'],
    [33, 'income', 'Salary', 85000, 'September salary', 'u1', 'Bank'],
    [36, 'expense', 'Groceries', 1800, 'Monthly stock-up', 'u2', 'UPI'],
    [40, 'expense', 'Rent', 22000, 'September rent', 'u1', 'Bank'],
    [44, 'expense', 'Cafes and Restaurants', 2100, 'Family lunch', 'u3', 'Card'],
    [47, 'expense', 'Travel', 4100, 'Train tickets', 'u1', 'UPI'],
    [52, 'expense', 'Clothes and Shoes', 3200, 'Festival shopping', 'u2', 'Card'],
];

let txs: Tx[] = seed.map(([daysAgo, type, category, amount, description, who, paymentMethod]) => ({
    id: id('t'),
    familyId: FAMILY,
    createdBy: who,
    createdByName: nameOf(who),
    amount,
    type,
    category,
    description,
    paymentMethod,
    source: 'manual',
    date: iso(daysAgo, 9 + (counter % 10)),
    createdAt: iso(daysAgo),
}));

let goals: Goal[] = [
    { id: 'g1', familyId: FAMILY, title: 'Goa trip', targetAmount: 60000, currentAmount: 38500, deadline: iso(-70), createdAt: iso(30) },
    { id: 'g2', familyId: FAMILY, title: 'Emergency fund', targetAmount: 300000, currentAmount: 112000, deadline: null, createdAt: iso(90) },
    { id: 'g3', familyId: FAMILY, title: 'New laptop', targetAmount: 90000, currentAmount: 90000, deadline: iso(-5), createdAt: iso(60) },
];

let loans: Loan[] = [
    { id: 'l1', familyId: FAMILY, direction: 'lent', person: 'Karthik', amount: 5000, repaidAmount: 2000, dueDate: iso(-3), note: 'Bike repair', status: 'open', createdAt: iso(12), settledAt: null },
    { id: 'l2', familyId: FAMILY, direction: 'lent', person: 'Meena Aunty', amount: 1500, repaidAmount: 0, dueDate: iso(2), note: '', status: 'open', createdAt: iso(9), settledAt: null },
    { id: 'l3', familyId: FAMILY, direction: 'borrowed', person: 'Suresh', amount: 8000, repaidAmount: 0, dueDate: iso(-12), note: 'Advance for deposit', status: 'open', createdAt: iso(5), settledAt: null },
];

let budgets: Budget[] = [
    { id: 'b1', familyId: FAMILY, category: 'Groceries', limit: 6000 },
    { id: 'b2', familyId: FAMILY, category: 'Cafes and Restaurants', limit: 3000 },
    { id: 'b3', familyId: FAMILY, category: 'Travel', limit: 5000 },
];

let requests: JoinRequest[] = [
    { id: 'r1', familyId: FAMILY, userId: 'u9', displayName: 'Meera', email: 'meera@demo.dev', status: 'pending', createdAt: iso(0, 8) },
];

let admin = ME;
let inviteCode = 'A1B2C3D4';
let familyName = 'Home Crew';
let displayName = 'Prasath';
let inFamily = true;

const me = (): Me => ({
    uid: ME,
    email: 'prasath@demo.dev',
    displayName,
    role: admin === ME ? 'admin' : 'member',
    familyId: inFamily ? FAMILY : null,
    family: inFamily ? { id: FAMILY, name: familyName, inviteCode, admin, memberCount: members.length } : null,
    pendingRequest: null,
});

const round2 = (n: number) => Math.round(n * 100) / 100;

const summary = (month: string, tz: number, scope: 'family' | 'me' = 'family'): Summary => {
    const range = (key: string) => {
        const [y, m] = key.split('-').map(Number);
        return { start: Date.UTC(y, m - 1, 1) - tz * 60000, end: Date.UTC(y, m, 1) - tz * 60000 };
    };
    const [y, m] = month.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 2, 1));
    const prev = range(`${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`);
    const cur = range(month);

    let allIncome = 0, allExpense = 0, income = 0, expense = 0, previousExpense = 0, count = 0;
    const byCategory: Record<string, { category: string; total: number; count: number }> = {};
    const byDay: Record<string, { date: string; income: number; expense: number }> = {};
    const byMember: Record<string, { userId: string; name: string; expense: number }> = {};

    txs.forEach((t) => {
        if (scope === 'me' && t.createdBy !== ME) return;
        const at = new Date(t.date).getTime();
        const isExpense = t.type === 'expense';
        if (isExpense) allExpense += t.amount; else allIncome += t.amount;
        if (isExpense && at >= prev.start && at < prev.end) previousExpense += t.amount;
        if (at < cur.start || at >= cur.end) return;

        count += 1;
        const day = new Date(at + tz * 60000).toISOString().slice(0, 10);
        byDay[day] = byDay[day] || { date: day, income: 0, expense: 0 };
        if (isExpense) {
            expense += t.amount;
            byDay[day].expense += t.amount;
            byCategory[t.category] = byCategory[t.category] || { category: t.category, total: 0, count: 0 };
            byCategory[t.category].total += t.amount;
            byCategory[t.category].count += 1;
            byMember[t.createdBy] = byMember[t.createdBy] || { userId: t.createdBy, name: t.createdByName || 'Member', expense: 0 };
            byMember[t.createdBy].expense += t.amount;
        } else {
            income += t.amount;
            byDay[day].income += t.amount;
        }
    });

    return {
        month,
        scope,
        tzOffset: tz,
        balance: round2(allIncome - allExpense),
        income: round2(income),
        expense: round2(expense),
        net: round2(income - expense),
        previousExpense: round2(previousExpense),
        expenseChangePercent: previousExpense > 0 ? Math.round(((expense - previousExpense) / previousExpense) * 1000) / 10 : null,
        transactionCount: count,
        byCategory: Object.values(byCategory)
            .map((c) => ({ ...c, total: round2(c.total), percent: expense > 0 ? Math.round((c.total / expense) * 1000) / 10 : 0 }))
            .sort((a, b) => b.total - a.total),
        byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
        byMember: Object.values(byMember).sort((a, b) => b.expense - a.expense),
    };
};

// Same bucketing as the real API: last 7 days, last 8 Monday-to-Sunday weeks, last 6 calendar months.
const trend = (range: TrendRange, tz: number, scope: SummaryScope): Trend => {
    const shift = tz * 60000;
    const localNow = new Date(Date.now() + shift);
    const todayLocal = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
    const count = { day: 7, week: 8, month: 6 }[range];

    const starts: number[] = [];
    for (let i = count - 1; i >= 0; i--) {
        if (range === 'day') starts.push(todayLocal - i * DAY);
        else if (range === 'week') starts.push(todayLocal - ((localNow.getUTCDay() + 6) % 7) * DAY - i * 7 * DAY);
        else starts.push(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - i, 1));
    }
    const endOf = (start: number) => {
        if (range === 'day') return start + DAY;
        if (range === 'week') return start + 7 * DAY;
        const d = new Date(start);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    };

    const buckets = starts.map((start) => ({
        localStart: new Date(start).toISOString().slice(0, 10),
        start: new Date(start - shift).toISOString(),
        end: new Date(endOf(start) - shift).toISOString(),
        expense: 0,
        income: 0,
    }));

    const cats: Record<string, number> = {};
    txs.forEach((t) => {
        if (scope === 'me' && t.createdBy !== ME) return;
        const at = new Date(t.date).getTime();
        const bucket = buckets.find((b) => at >= Date.parse(b.start) && at < Date.parse(b.end));
        if (!bucket) return;
        if (t.type === 'expense') {
            bucket.expense = round2(bucket.expense + t.amount);
            cats[t.category] = (cats[t.category] || 0) + t.amount;
        } else {
            bucket.income = round2(bucket.income + t.amount);
        }
    });

    const windowExpense = Object.values(cats).reduce((sum, v) => sum + v, 0);
    const byCategory = Object.entries(cats)
        .map(([category, total]) => ({ category, total: round2(total), percent: windowExpense > 0 ? Math.round((total / windowExpense) * 1000) / 10 : 0 }))
        .sort((a, b) => b.total - a.total);

    return { range, scope, buckets, byCategory };
};

const parseQuery = (search: string) => Object.fromEntries(new URLSearchParams(search));

export async function demoRequest(method: string, rawPath: string, body: any): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, 140));

    const [path, search = ''] = rawPath.split('?');
    const q = parseQuery(search);
    const seg = path.split('/').filter(Boolean);
    const route = `${method} /${seg[0]}`;
    const notFound = () => new ApiError('Not found', 404);

    switch (seg[0]) {
        case 'auth':
            return { uid: ME };

        case 'me':
            if (method === 'PATCH') { displayName = body.displayName; return { displayName }; }
            return me();

        case 'family': {
            if (method === 'PATCH' && !seg[2]) { familyName = String(body.familyName).trim(); return { name: familyName }; }
            if (route === 'POST /family' && seg[1] === 'create') { inFamily = true; admin = ME; return { familyId: FAMILY, inviteCode }; }
            if (seg[1] === 'join') return { requestId: 'r-new', familyName };
            if (seg[1] === 'leave') { inFamily = false; return { message: 'You left the family' }; }
            if (seg[1] === 'requests') {
                requests = requests.filter((r) => r.id !== seg[2]);
                return { message: 'Done' };
            }
            if (seg[2] === 'requests') return requests;
            if (seg[2] === 'invite') { inviteCode = Math.random().toString(16).slice(2, 10).toUpperCase(); return { inviteCode }; }
            if (seg[2] === 'admin') { admin = body.userId; return { message: 'Admin rights transferred' }; }
            if (seg[2] === 'members') {
                const idx = members.findIndex((m) => m.uid === seg[3]);
                if (idx >= 0) members.splice(idx, 1);
                return { message: 'Member removed' };
            }
            const details: FamilyDetails = {
                id: FAMILY, name: familyName, inviteCode, admin, createdAt: iso(120),
                members: members.map((m) => ({ ...m, role: m.uid === admin ? 'admin' : 'member' })),
            };
            return details;
        }

        case 'transactions': {
            if (method === 'POST') {
                const tx: Tx = {
                    id: id('t'), familyId: FAMILY, createdBy: ME, createdByName: displayName,
                    amount: body.amount, type: body.type, category: body.category, description: body.description || '',
                    paymentMethod: body.paymentMethod || null, source: body.source || 'manual',
                    date: body.date || new Date().toISOString(), createdAt: new Date().toISOString(),
                };
                if (body.dedupeKey && txs.some((t) => (t as any).dedupeKey === body.dedupeKey)) throw new ApiError('Duplicate transaction', 409);
                (tx as any).dedupeKey = body.dedupeKey || null;
                txs.unshift(tx);
                return { id: tx.id };
            }
            if (method === 'PUT') {
                const tx = txs.find((t) => t.id === seg[1]);
                if (!tx) throw notFound();
                Object.assign(tx, body);
                return { message: 'Transaction updated' };
            }
            if (method === 'DELETE') { txs = txs.filter((t) => t.id !== seg[1]); return { message: 'Transaction deleted' }; }
            if (seg[2] === 'summary') return summary(q.month, parseInt(q.tzOffset || '0', 10), q.scope === 'me' ? 'me' : 'family');
            if (seg[2] === 'trend') {
                const range = (['day', 'week', 'month'] as const).find((r) => r === q.range) ?? 'day';
                return trend(range, parseInt(q.tzOffset || '0', 10), q.scope === 'me' ? 'me' : 'family');
            }

            let list = [...txs].sort((a, b) => b.date.localeCompare(a.date));
            if (q.scope === 'me') list = list.filter((t) => t.createdBy === ME);
            if (q.type) list = list.filter((t) => t.type === q.type);
            if (q.category) list = list.filter((t) => t.category === q.category);
            if (q.from) list = list.filter((t) => t.date >= q.from);
            if (q.to) list = list.filter((t) => t.date <= q.to);
            if (q.startAfter) {
                const idx = list.findIndex((t) => t.id === q.startAfter);
                if (idx >= 0) list = list.slice(idx + 1);
            }
            return list.slice(0, parseInt(q.limit || '50', 10));
        }

        case 'goals': {
            if (method === 'POST') {
                const goal: Goal = { id: id('g'), familyId: FAMILY, title: body.title, targetAmount: body.targetAmount, currentAmount: 0, deadline: body.deadline ?? null, createdAt: new Date().toISOString() };
                goals.unshift(goal);
                return { id: goal.id };
            }
            if (seg[1] === 'update') {
                const goal = goals.find((g) => g.id === body.goalId);
                if (!goal) throw notFound();
                goal.currentAmount = Math.max(0, round2(goal.currentAmount + body.amount));
                return { currentAmount: goal.currentAmount, completed: goal.currentAmount >= goal.targetAmount };
            }
            if (method === 'PUT') { Object.assign(goals.find((g) => g.id === seg[1]) ?? {}, body); return { message: 'Goal updated' }; }
            if (method === 'DELETE') { goals = goals.filter((g) => g.id !== seg[1]); return { message: 'Goal deleted' }; }
            return goals;
        }

        case 'loans': {
            if (method === 'POST') {
                const loan: Loan = {
                    id: id('l'), familyId: FAMILY, direction: body.direction, person: body.person, amount: body.amount, repaidAmount: 0,
                    dueDate: body.dueDate ?? new Date(Date.now() + 7 * DAY).toISOString(), note: body.note || '', status: 'open',
                    createdAt: new Date().toISOString(), settledAt: null,
                };
                loans.unshift(loan);
                return { id: loan.id };
            }
            if (seg[2] === 'repay') {
                const loan = loans.find((l) => l.id === seg[1]);
                if (!loan) throw notFound();
                const outstanding = round2(loan.amount - loan.repaidAmount);
                const payment = body.amount !== undefined ? Math.min(body.amount, outstanding) : outstanding;
                loan.repaidAmount = round2(loan.repaidAmount + payment);
                loan.status = loan.repaidAmount >= loan.amount ? 'settled' : 'open';
                loan.settledAt = loan.status === 'settled' ? new Date().toISOString() : null;
                return { repaidAmount: loan.repaidAmount, outstanding: round2(loan.amount - loan.repaidAmount), status: loan.status };
            }
            if (method === 'DELETE') { loans = loans.filter((l) => l.id !== seg[1]); return { message: 'Loan deleted' }; }
            return q.status ? loans.filter((l) => l.status === q.status) : loans;
        }

        case 'budgets': {
            if (method === 'PUT') {
                const existing = budgets.find((b) => b.category.toLowerCase() === body.category.toLowerCase());
                if (existing) existing.limit = body.limit;
                else budgets.push({ id: id('b'), familyId: FAMILY, category: body.category, limit: body.limit });
                return { id: 'b' };
            }
            if (method === 'DELETE') { budgets = budgets.filter((b) => b.id !== seg[1]); return { message: 'Budget deleted' }; }
            return budgets;
        }
    }
    throw notFound();
}
