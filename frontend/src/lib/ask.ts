import { daysUntil, money, monthLabel, shiftMonth } from './format';
import type { Budget, Goal, Loan, Summary } from './types';
import { getAiConfig, isAiApiConfigured } from './aiSmsParser';

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

export const SUGGESTIONS_TA = [
    'எதில் அதிக செலவு செய்தோம்?',
    'கடந்த மாதத்தை விட எப்படி உள்ளது?',
    'யார் பணம் தர வேண்டும்?',
    'சேமிப்பு இலக்குகள் எப்படி உள்ளது?',
];

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

// Rule-based fallback answers
export const answer = (question: string, ctx: AskContext): string => {
    const q = question.toLowerCase();
    const { summary, loans, goals, budgets } = ctx;
    const month = monthLabel(summary.month);

    if (has(q, 'loan', 'owe', 'lent', 'borrow', 'due', 'கடன்', 'கொடுத்த')) {
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

    if (has(q, 'goal', 'saving', 'save', 'இலக்கு', 'சேமிப்பு')) {
        if (!goals.length) return 'You have no goals yet. Add one from the Home screen.';
        return goals
            .slice(0, 4)
            .map((g) => `${g.title}: ${Math.round((g.currentAmount / g.targetAmount) * 100)}% (${money(g.currentAmount)} of ${money(g.targetAmount)})`)
            .join('\n');
    }

    if (has(q, 'budget', 'limit', 'over', 'வரம்பு', 'பட்ஜெட்')) {
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

    if (has(q, 'last month', 'vs', 'compare', 'less', 'more', 'doing', 'கடந்த மாதம்')) {
        const prev = monthLabel(shiftMonth(summary.month, -1));
        if (summary.expenseChangePercent === null) return `You spent ${money(summary.expense)} in ${month}. There is no spending in ${prev} to compare with.`;
        const dir = summary.expenseChangePercent <= 0 ? 'less' : 'more';
        return `${month}: ${money(summary.expense)} spent, ${Math.abs(summary.expenseChangePercent)}% ${dir} than ${prev} (${money(summary.previousExpense)}). Income was ${money(summary.income)}, so you are ${summary.net >= 0 ? 'up' : 'down'} ${money(Math.abs(summary.net))}.`;
    }

    if (has(q, 'most', 'top', 'biggest', 'where', 'category', 'spend', 'spent', 'அதிக', 'செலவு')) {
        if (!summary.byCategory.length) return `Nothing spent in ${month} yet.`;
        const [first, second, third] = summary.byCategory;
        const rest = [second, third].filter(Boolean).map((c) => `${c.category} ${money(c.total)}`);
        return `${first.category} leads at ${money(first.total)} (${first.percent}% of ${money(summary.expense)}).${rest.length ? ` Then ${rest.join(' and ')}.` : ''}`;
    }

    if (has(q, 'income', 'earn', 'salary', 'received', 'வருமானம்', 'வரவு')) {
        return `${money(summary.income)} came in during ${month}.`;
    }

    if (has(q, 'balance', 'have', 'total', 'left', 'இருப்பு')) {
        return `The family balance across all months is ${money(summary.balance)}.`;
    }

    return 'I can answer about spending by category, this month versus last, loans, goals, budgets, income and balance. Try one of the suggestions or ask anything!';
};

// AI-powered assistant that uses the configured AI API key (Gemini / OpenAI / Groq)
export async function askFinancialAi(
    question: string,
    ctx: AskContext,
    history: { from: 'me' | 'bot'; text: string }[] = []
): Promise<string> {
    if (!isAiApiConfigured()) {
        return answer(question, ctx);
    }

    const config = getAiConfig();
    const { summary, loans, goals, budgets } = ctx;
    const month = monthLabel(summary.month);

    const contextPayload = {
        month,
        balance: money(summary.balance),
        income: money(summary.income),
        expense: money(summary.expense),
        net: money(summary.net),
        spendingByCategory: summary.byCategory.map((c) => ({
            category: c.category,
            amount: money(c.total),
            percent: `${c.percent}%`,
        })),
        openLoans: loans.filter((l) => l.status === 'open').map((l) => ({
            person: l.person,
            direction: l.direction === 'lent' ? 'owes you' : 'you owe them',
            amountRemaining: money(l.amount - l.repaidAmount),
            dueDate: l.dueDate || 'none',
        })),
        goals: goals.map((g) => ({
            title: g.title,
            progress: `${money(g.currentAmount)} / ${money(g.targetAmount)} (${Math.round((g.currentAmount / g.targetAmount) * 100)}%)`,
        })),
        budgets: budgets.map((b) => ({
            category: b.category,
            limit: money(b.limit),
        })),
    };

    const systemPrompt = `You are Family Finance AI, an intelligent, helpful, and concise personal financial advisor.
Answer the user's questions directly and accurately based on their financial data.
If asked in Tamil (தமிழ்), reply fluently and naturally in Tamil. If asked in English, reply in English.
Keep answers concise, direct, and friendly (1-3 paragraphs or bullet points). Format numbers with ₹ or currency symbols nicely.
Current financial figures for ${month}:
${JSON.stringify(contextPayload, null, 2)}`;

    try {
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6).map((m) => ({
                role: m.from === 'me' ? 'user' : 'assistant',
                content: m.text,
            })),
            { role: 'user', content: question },
        ];

        let botReply: string | null = null;

        // 1. Try standard OpenAI-compatible completions
        try {
            const resp = await fetch(config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify({
                    model: config.model,
                    temperature: 0.3,
                    messages,
                }),
            });
            if (resp.ok) {
                const data = await resp.json();
                botReply = data.choices?.[0]?.message?.content || null;
            }
        } catch {}

        // 2. If Gemini and OpenAI format failed, try Gemini native generateContent
        if (!botReply && config.provider === 'gemini') {
            const configured = config.model || 'gemini-1.5-flash';
            const candidateModels = [
                configured,
                configured.toLowerCase().replace(/\s+/g, '-'),
                'gemini-1.5-flash',
                'gemini-2.0-flash',
            ];
            const uniqueModels = Array.from(new Set(candidateModels));

            for (const m of uniqueModels) {
                try {
                    const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${config.apiKey}`;
                    const nativeResp = await fetch(nativeUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [
                                {
                                    role: 'user',
                                    parts: [{ text: `${systemPrompt}\n\nUser Question:\n${question}` }],
                                },
                            ],
                            generationConfig: {
                                temperature: 0.3,
                            },
                        }),
                    });
                    if (nativeResp.ok) {
                        const nativeData = await nativeResp.json();
                        botReply = nativeData.candidates?.[0]?.content?.parts?.[0]?.text || null;
                        if (botReply) break;
                    }
                } catch {}
            }
        }

        if (botReply && botReply.trim()) {
            return botReply.trim();
        }
    } catch (e) {
        console.warn('AI chatbot call error:', e);
    }

    return answer(question, ctx);
}
