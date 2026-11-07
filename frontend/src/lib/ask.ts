import { daysUntil, money, monthLabel, shiftMonth, toDateInput } from './format';
import type { Budget, Goal, Loan, Summary } from './types';
import { getAiConfig, isAiApiConfigured } from './aiSmsParser';
import { api } from './api';
import { normalizeCategory } from './categories';

export interface AskContext {
    summary: Summary;
    loans: Loan[];
    goals: Goal[];
    budgets: Budget[];
}

export interface AiActionParams {
    amount?: number;
    type?: 'expense' | 'income';
    category?: string;
    description?: string | null;
    paymentMethod?: 'UPI' | 'Card' | 'Bank' | null;
    date?: string | null;
    time?: string | null;
    person?: string;
    direction?: 'lent' | 'borrowed';
    dueDate?: string | null;
    note?: string | null;
    title?: string;
    targetAmount?: number;
    limit?: number;
}

export interface AiAction {
    type: 'record_transaction' | 'create_loan' | 'repay_loan' | 'set_budget' | 'create_goal';
    params: AiActionParams;
}

export interface AskAiResult {
    reply: string;
    action?: AiAction | null;
}

export interface ExecutedActionInfo {
    actionType: AiAction['type'];
    label: string;
    details?: string;
    undoTarget?: {
        entityId: string;
        type: 'transaction' | 'loan' | 'goal' | 'budget';
    };
}

export const SUGGESTIONS = [
    'Spent ₹250 on lunch at Swiggy',
    'Where did we spend the most?',
    'Lent ₹1000 to Suresh',
    'How are our goals going?',
];

export const SUGGESTIONS_TA = [
    'மதிய உணவிற்கு ₹250 செலவு',
    'எதில் அதிக செலவு செய்தோம்?',
    'சுரேஷிற்கு ₹1000 கடன் கொடுத்தேன்',
    'சேமிப்பு இலக்குகள் எப்படி உள்ளது?',
];

// Neatly format titles & descriptions into Title Case (e.g. "idly" -> "Idly", "coffee at starbucks" -> "Coffee at Starbucks")
export function formatDescription(desc?: string | null): string | undefined {
    if (!desc) return undefined;
    const trimmed = desc.trim();
    if (!trimmed) return undefined;

    const lowerExceptions = new Set(['at', 'for', 'in', 'on', 'to', 'via', 'and', 'with', 'of', 'the', 'a', 'an']);
    return trimmed
        .split(/\s+/)
        .map((word, index) => {
            // Preserve acronyms like UPI, ATM, KFC, BBQ, GST
            if (/^[A-Z0-9]{2,5}$/.test(word)) return word;
            const lower = word.toLowerCase();
            if (index > 0 && lowerExceptions.has(lower)) return lower;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ')
        .replace(/^([a-z])/, (m) => m.toUpperCase());
}

// Builds an accurate local ISO string for a given date and time so timezones don't shift to 5:30 AM
export function buildTransactionDate(dateStr?: string | null, timeStr?: string | null): string {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let day = now.getDate();

    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
        const parts = dateStr.trim().split('-').map(Number);
        year = parts[0];
        month = parts[1] - 1;
        day = parts[2];
    }

    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = 0;

    if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr.trim())) {
        const tParts = timeStr.trim().split(':').map(Number);
        hours = tParts[0];
        minutes = tParts[1];
    } else if (dateStr && dateStr !== toDateInput(now)) {
        // When user explicitly inputs a past day without a time, keep current time of day
        // rather than falling back to 00:00:00 UTC (which renders as 5:30 AM in India!)
        hours = now.getHours();
        minutes = now.getMinutes();
    }

    const localDate = new Date(year, month, day, hours, minutes, seconds);
    return localDate.toISOString();
}

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

    return 'I can answer questions about your finances and record transactions, loans, budgets, or goals. Try one of the suggestions or say something like "Spent ₹250 on lunch"';
};

// Parse JSON or clean string from AI output
function parseAiResponse(raw: string): AskAiResult {
    if (!raw) return { reply: '', action: null };

    // 1. Try direct parse
    try {
        const parsed = JSON.parse(raw.trim());
        if (parsed && typeof parsed.reply === 'string') {
            return {
                reply: parsed.reply,
                action: parsed.action && parsed.action.type ? parsed.action : null,
            };
        }
    } catch {}

    // 2. Try markdown json fence
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(raw);
    if (fenceMatch) {
        try {
            const parsed = JSON.parse(fenceMatch[1].trim());
            if (parsed && typeof parsed.reply === 'string') {
                return {
                    reply: parsed.reply,
                    action: parsed.action && parsed.action.type ? parsed.action : null,
                };
            }
        } catch {}
    }

    // 3. Try finding outermost { ... }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
        try {
            const parsed = JSON.parse(raw.slice(start, end + 1));
            if (parsed && typeof parsed.reply === 'string') {
                return {
                    reply: parsed.reply,
                    action: parsed.action && parsed.action.type ? parsed.action : null,
                };
            }
        } catch {}
    }

    // 4. Fallback to raw text
    return {
        reply: raw.trim(),
        action: null,
    };
}

// Rule-based fallback with basic action detection when offline or without AI key
export const ruleBasedAnswerWithAction = (question: string, ctx: AskContext): AskAiResult => {
    const q = question.trim();
    const amountMatch = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i.exec(q);
    if (amountMatch && /(spent|paid|bought|expense|cost|salary|received|income|credited|செலவு|வரவு)/i.test(q)) {
        const amount = parseFloat(amountMatch[1]);
        const isIncome = /(salary|received|income|credited|earned|வருமானம்|வரவு)/i.test(q);
        const type: 'income' | 'expense' = isIncome ? 'income' : 'expense';

        // Detect category
        let category = isIncome ? 'Salary' : 'Other';
        if (/food|lunch|dinner|breakfast|snack|tea|coffee|swiggy|zomato|idly|dosa|உணவு/i.test(q)) category = 'Food';
        else if (/grocer|vegetable|milk|supermarket|மளிகை/i.test(q)) category = 'Groceries';
        else if (/fuel|petrol|diesel|gas/i.test(q)) category = 'Fuel';
        else if (/travel|auto|uber|ola|bus|train|flight/i.test(q)) category = 'Travel';
        else if (/bill|electricity|recharge|wifi|current/i.test(q)) category = 'Bills';

        // Detect date
        let dateStr: string = toDateInput(new Date());
        if (/\b(yesterday|நேற்று)\b/i.test(q)) {
            const y = new Date(Date.now() - 86400000);
            dateStr = toDateInput(y);
        }

        // Detect time (e.g. "12 30", "12:30", "4 pm", "9:30 am")
        let timeStr: string | null = null;
        const timeMatch1 = /(?:at\s+)?\b(\d{1,2})[:\s](\d{2})\s*(am|pm)?\b/i.exec(q);
        if (timeMatch1) {
            let h = parseInt(timeMatch1[1], 10);
            const min = timeMatch1[2];
            const ampm = timeMatch1[3]?.toLowerCase();
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            timeStr = `${String(h).padStart(2, '0')}:${min}`;
        } else {
            const timeMatch2 = /\b(\d{1,2})\s*(am|pm)\b/i.exec(q);
            if (timeMatch2) {
                let h = parseInt(timeMatch2[1], 10);
                const ampm = timeMatch2[2].toLowerCase();
                if (ampm === 'pm' && h < 12) h += 12;
                if (ampm === 'am' && h === 12) h = 0;
                timeStr = `${String(h).padStart(2, '0')}:00`;
            }
        }

        // Detect description / merchant
        const cleanedDesc = q
            .replace(/(?:i\s+)?(?:spent|paid|bought|expense|cost)\s+(?:on|for)?/i, '')
            .replace(/(?:for|of)\s+(?:₹|rs\.?|inr)?\s*\d+(?:\.\d+)?(?:\s*(?:rs|rupees))?/i, '')
            .replace(/(?:₹|rs\.?|inr)\s*\d+(?:\.\d+)?/i, '')
            .replace(/\b\d+(?:\.\d+)?\s*(?:rs|rupees)\b/i, '')
            .replace(/\b(yesterday|today|tomorrow|morning|evening|night|afternoon)\b/gi, '')
            .replace(/(?:at\s+)?\b\d{1,2}[:\s]\d{2}(?:\s*(?:am|pm))?\b/gi, '')
            .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, '')
            .replace(/\b(on|for|at|via|in)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        const formattedDesc = formatDescription(cleanedDesc);

        return {
            reply: `I have prepared to record this ${type}: ${money(amount)} under ${category}${formattedDesc ? ` for ${formattedDesc}` : ''}.`,
            action: {
                type: 'record_transaction',
                params: {
                    type,
                    amount,
                    category,
                    description: formattedDesc,
                    date: dateStr,
                    time: timeStr,
                },
            },
        };
    }

    return {
        reply: answer(question, ctx),
        action: null,
    };
};

// AI-powered assistant that uses the configured AI API key (Gemini / OpenAI / Groq)
export async function askFinancialAi(
    question: string,
    ctx: AskContext,
    history: { from: 'me' | 'bot'; text: string }[] = []
): Promise<AskAiResult> {
    if (!isAiApiConfigured()) {
        return ruleBasedAnswerWithAction(question, ctx);
    }

    const config = getAiConfig();
    const { summary, loans, goals, budgets } = ctx;
    const month = monthLabel(summary.month);
    const todayIso = toDateInput(new Date());

    const contextPayload = {
        month,
        today: todayIso,
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
            id: l.id,
            person: l.person,
            direction: l.direction === 'lent' ? 'owes you' : 'you owe them',
            amountRemaining: money(l.amount - l.repaidAmount),
            dueDate: l.dueDate || 'none',
        })),
        goals: goals.map((g) => ({
            id: g.id,
            title: g.title,
            progress: `${money(g.currentAmount)} / ${money(g.targetAmount)} (${Math.round((g.currentAmount / g.targetAmount) * 100)}%)`,
        })),
        budgets: budgets.map((b) => ({
            category: b.category,
            limit: money(b.limit),
        })),
    };

    const systemPrompt = `You are Family Finance AI, an intelligent personal financial advisor and autonomous assistant.
You have two core capabilities:
1. Answer the user's questions directly and accurately based on their financial data.
2. Execute financial actions when the user asks to record an expense/income, add/repay a loan, set a budget, or create a goal.

Today's date is: ${todayIso}.
Current financial figures for ${month}:
${JSON.stringify(contextPayload, null, 2)}

Supported Actions:
- "record_transaction": When the user spent or earned money (e.g., "spent 250 on lunch at Swiggy", "i spent on idly for 50rs yesterday 12 30", "₹500 petrol via card", "received 50000 salary", "மதிய உணவிற்கு ₹150 செலவழித்தேன்").
  params: {
    "type": "expense" | "income",
    "amount": number (positive),
    "category": standard category (one of: "Food", "Groceries", "Travel", "Fuel", "Bills", "Entertainment", "Health", "Clothes and Shoes", "Rent", "Education", "Sport", "Salary", "Interest", "Business", "Other"),
    "description": string (clean merchant/item name neatly formatted in Title Case / capitalized, e.g. "Idly", "Swiggy Lunch", "Coffee at Starbucks", "Petrol", "Electricity Bill"),
    "paymentMethod": "UPI" | "Card" | "Bank" | null,
    "date": "YYYY-MM-DD" (e.g., if user says "yesterday", calculate yesterday's date relative to ${todayIso}. If today or unspecified, use "${todayIso}"),
    "time": "HH:mm" in 24-hour format if a time is specified (e.g., "12 30" or "12:30" -> "12:30", "1:30 pm" -> "13:30", "8:15 pm" -> "20:15", "9:30 am" -> "09:30"). If no time is mentioned, return null.
  }

- "create_loan": When the user lent money or borrowed money (e.g., "Lent 1000 to Suresh", "Borrowed 500 from Ramesh").
  params: {
    "person": string (capitalized name, e.g. "Suresh"),
    "direction": "lent" | "borrowed",
    "amount": number,
    "note": string | null (cleanly capitalized note),
    "dueDate": "YYYY-MM-DD" | null
  }

- "repay_loan": When an existing loan is repaid (e.g., "Suresh returned 500", "Repaid Ramesh 500").
  params: {
    "person": string,
    "amount": number
  }

- "set_budget": When user sets or changes a budget limit (e.g., "Set food budget to 6000").
  params: {
    "category": string,
    "limit": number
  }

- "create_goal": When user wants to create a savings goal (e.g., "New savings goal: Laptop 60000").
  params: {
    "title": string (capitalized goal title, e.g. "Laptop"),
    "targetAmount": number
  }

RESPONSE FORMAT:
You MUST ALWAYS respond with a valid JSON object matching this schema:
{
  "reply": "Friendly response to the user confirming the action or answering their question. If asked in Tamil (தமிழ்), reply fluently in Tamil. If asked in English, reply in English. Keep it concise (1-2 sentences). Format numbers with ₹ nicely.",
  "action": null OR { "type": "<action_name>", "params": { ... } }
}
- If the user is only asking a question or seeking advice, set "action": null.
- If the user is asking to record/add/track an expense, income, loan, budget, or goal, populate "action" and confirm it politely in "reply".
- Return ONLY the JSON object. Do not include markdown code fences or commentary outside the JSON.`;

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
                    temperature: 0.2,
                    messages,
                }),
            });
            if (resp.ok) {
                const data = await resp.json();
                botReply = data.choices?.[0]?.message?.content || null;
            }
        } catch {}

        // 2. If Gemini or OpenAI format failed, try Gemini native generateContent
        if (!botReply && (config.provider === 'gemini' || config.apiKey)) {
            const key = (process.env.EXPO_PUBLIC_AI_API_KEY || config.apiKey || '').trim();
            const rawModel = (process.env.EXPO_PUBLIC_AI_MODEL || config.model || 'gemini-3.5-flash-lite').trim();
            const candidateModels = [
                'gemini-3.5-flash-lite',
                'gemini-3-flash-preview',
                'gemini-3.1-flash-lite',
                rawModel.toLowerCase().replace(/\s+/g, '-'),
                'gemini-3.5-flash',
                'gemini-flash-lite-latest',
                'gemini-flash-latest',
            ];
            const uniqueModels = Array.from(new Set(candidateModels));

            for (const m of uniqueModels) {
                try {
                    const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
                    const nativeResp = await fetch(nativeUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [
                                {
                                    role: 'user',
                                    parts: [{ text: `${systemPrompt}\n\nUser Message:\n${question}` }],
                                },
                            ],
                            generationConfig: {
                                temperature: 0.2,
                            },
                        }),
                        signal: AbortSignal.timeout(15000),
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
            return parseAiResponse(botReply);
        }
    } catch (e) {
        console.warn('AI assistant call error:', e);
    }

    return ruleBasedAnswerWithAction(question, ctx);
}

// Executes an action returned by the AI against the live API
export async function executeAiAction(
    action: AiAction,
    familyId: string,
    ctx: AskContext
): Promise<ExecutedActionInfo> {
    const params = action.params || {};

    if (action.type === 'record_transaction') {
        const amount = Number(params.amount) || 0;
        const type = params.type === 'income' ? 'income' : 'expense';
        const rawCategory = params.category || (type === 'income' ? 'Salary' : 'Other');
        const category = normalizeCategory(rawCategory);
        const description = formatDescription(params.description);
        const dateIso = buildTransactionDate(params.date, params.time);
        const paymentMethod = params.paymentMethod || null;

        const res = await api.addTransaction({
            familyId,
            amount,
            type,
            category,
            description,
            paymentMethod,
            date: dateIso,
            source: 'manual',
        });

        return {
            actionType: 'record_transaction',
            label: `${type === 'income' ? 'Income' : 'Expense'} recorded: ${money(amount)}`,
            details: [category, description].filter(Boolean).join(' · '),
            undoTarget: {
                entityId: res.id,
                type: 'transaction',
            },
        };
    }

    if (action.type === 'create_loan') {
        const amount = Number(params.amount) || 0;
        const person = formatDescription(params.person) || 'Friend';
        const direction = params.direction === 'borrowed' ? 'borrowed' : 'lent';
        const note = formatDescription(params.note);

        const res = await api.addLoan({
            familyId,
            person,
            direction,
            amount,
            dueDate: params.dueDate || undefined,
            note,
        });

        return {
            actionType: 'create_loan',
            label: `Loan recorded: ${direction === 'lent' ? `Lent ${money(amount)} to ${person}` : `Borrowed ${money(amount)} from ${person}`}`,
            details: note,
            undoTarget: {
                entityId: res.id,
                type: 'loan',
            },
        };
    }

    if (action.type === 'repay_loan') {
        const amount = Number(params.amount) || 0;
        const personName = (params.person || '').toLowerCase().trim();
        const targetLoan = ctx.loans.find(
            (l) => l.status === 'open' && (personName ? l.person.toLowerCase().includes(personName) : true)
        );

        if (targetLoan) {
            await api.repayLoan(targetLoan.id, amount > 0 ? amount : undefined, false);
            return {
                actionType: 'repay_loan',
                label: `Loan repaid: ${money(amount || (targetLoan.amount - targetLoan.repaidAmount))} for ${targetLoan.person}`,
                details: 'Outstanding balance updated',
            };
        } else {
            throw new Error(`Could not find an open loan for "${params.person || 'this person'}".`);
        }
    }

    if (action.type === 'set_budget') {
        const category = params.category?.trim() || 'Other';
        const limit = Number(params.limit) || 0;

        await api.setBudget(familyId, category, limit);

        return {
            actionType: 'set_budget',
            label: `Budget set: ${category} at ${money(limit)}/month`,
        };
    }

    if (action.type === 'create_goal') {
        const title = formatDescription(params.title) || 'Savings Goal';
        const targetAmount = Number(params.targetAmount) || 0;

        const res = await api.addGoal({
            familyId,
            title,
            targetAmount,
        });

        return {
            actionType: 'create_goal',
            label: `Goal created: "${title}" for ${money(targetAmount)}`,
            undoTarget: {
                entityId: res.id,
                type: 'goal',
            },
        };
    }

    throw new Error(`Unsupported action: ${action.type}`);
}

// Undoes an action created by the AI assistant
export async function undoAiAction(undoTarget: { entityId: string; type: string }): Promise<void> {
    if (undoTarget.type === 'transaction') {
        await api.deleteTransaction(undoTarget.entityId);
    } else if (undoTarget.type === 'loan') {
        await api.deleteLoan(undoTarget.entityId);
    } else if (undoTarget.type === 'goal') {
        await api.deleteGoal(undoTarget.entityId);
    }
}
