import { daysUntil, money, monthLabel, shiftMonth } from './format';
import type { Budget, Goal, Loan, Summary } from './types';

export interface AskContext {
    summary: Summary;
    loans: Loan[];
    goals: Goal[];
    budgets: Budget[];
}

export const SUGGESTIONS = [
    'Where did we spend the most?',
    'How are we doing vs last month?',
    'Who owes us money?',
    'How are our goals going?',
];

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

// Answers from the numbers already on screen. This is plain keyword matching, not a language model,
// so it handles a handful of common questions and says so when it does not understand.
export const answer = (question: string, ctx: AskContext): string => {
    const q = question.toLowerCase();
    const { summary, loans, goals, budgets } = ctx;
    const month = monthLabel(summary.month);

    if (has(q, 'loan', 'owe', 'lent', 'borrow', 'due')) {
        const open = loans.filter((l) => l.status === 'open');
        if (!open.length) return 'No open loans. Nobody owes you and you owe nobody.';
        const lines = open
            .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
            .slice(0, 4)
            .map((l) => {
                const days = l.dueDate ? daysUntil(l.dueDate) : null;
                const when = days === null ? '' : days < 0 ? `, ${Math.abs(days)} days overdue` : days === 0 ? ', due today' : `, due in ${days} days`;
                return `${l.direction === 'lent' ? `${l.person} owes you` : `You owe ${l.person}`} ${money(l.amount - l.repaidAmount)}${when}`;
            });
        return lines.join('\n');
    }

    if (has(q, 'goal', 'saving', 'save')) {
        if (!goals.length) return 'You have no goals yet. Add one from the Home screen.';
        return goals
            .slice(0, 4)
            .map((g) => `${g.title}: ${Math.round((g.currentAmount / g.targetAmount) * 100)}% (${money(g.currentAmount)} of ${money(g.targetAmount)})`)
            .join('\n');
    }

    if (has(q, 'budget', 'limit', 'over')) {
        if (!budgets.length) return 'No budgets set. Add monthly limits from Family, then Budgets.';
        return budgets
            .map((b) => {
                const used = summary.byCategory.find((c) => c.category.toLowerCase() === b.category.toLowerCase())?.total ?? 0;
                return used > b.limit
                    ? `${b.category}: ${money(used - b.limit)} over (${money(used)} of ${money(b.limit)})`
                    : `${b.category}: ${money(b.limit - used)} left (${money(used)} of ${money(b.limit)})`;
            })
            .join('\n');
    }

    if (has(q, 'last month', 'vs', 'compare', 'less', 'more', 'doing')) {
        const prev = monthLabel(shiftMonth(summary.month, -1));
        if (summary.expenseChangePercent === null) return `You spent ${money(summary.expense)} in ${month}. There is no spending in ${prev} to compare with.`;
        const dir = summary.expenseChangePercent <= 0 ? 'less' : 'more';
        return `${month}: ${money(summary.expense)} spent, ${Math.abs(summary.expenseChangePercent)}% ${dir} than ${prev} (${money(summary.previousExpense)}). Income was ${money(summary.income)}, so you are ${summary.net >= 0 ? 'up' : 'down'} ${money(Math.abs(summary.net))}.`;
    }

    if (has(q, 'most', 'top', 'biggest', 'where', 'category', 'spend', 'spent')) {
        if (!summary.byCategory.length) return `Nothing spent in ${month} yet.`;
        const [first, second, third] = summary.byCategory;
        const rest = [second, third].filter(Boolean).map((c) => `${c.category} ${money(c.total)}`);
        return `${first.category} leads at ${money(first.total)} (${first.percent}% of ${money(summary.expense)}).${rest.length ? ` Then ${rest.join(' and ')}.` : ''}`;
    }

    if (has(q, 'income', 'earn', 'salary', 'received')) {
        return `${money(summary.income)} came in during ${month}.`;
    }

    if (has(q, 'balance', 'have', 'total', 'left')) {
        return `The family balance across all months is ${money(summary.balance)}.`;
    }

    return 'I can answer about spending by category, this month versus last, loans, goals, budgets, income and balance. Try one of the suggestions.';
};
