// AI-powered SMS Parser and Categorization Layer
// Supports OpenAI-compatible endpoints with configurable placeholders
// Includes a resilient local heuristic fallback so it works without failing when unconfigured.

import { ParsedSms, RawSmsMessage, suggestCategory, extractMerchantFromSms, parseBankSms } from './sms';

export interface AiSmsConfig {
    apiUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
}

export const AI_SMS_CONFIG: AiSmsConfig = {
    // API endpoint placeholder - configurable via EXPO_PUBLIC_AI_* env vars or app settings
    apiUrl: process.env.EXPO_PUBLIC_AI_API_URL || 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.EXPO_PUBLIC_AI_API_KEY || 'PLACEHOLDER_API_KEY',
    model: process.env.EXPO_PUBLIC_AI_MODEL || 'gpt-4o-mini',
    temperature: 0.1,
};

// Check if a real AI API key is configured
export const isAiApiConfigured = (): boolean => {
    return Boolean(
        AI_SMS_CONFIG.apiKey &&
        AI_SMS_CONFIG.apiKey !== 'PLACEHOLDER_API_KEY' &&
        AI_SMS_CONFIG.apiKey.trim().length > 10
    );
};

export interface ExtractedAiItem {
    amount: number;
    type: 'income' | 'expense';
    category: string;
    merchant: string | null;
    paymentMethod: 'UPI' | 'Card' | 'Bank';
    countForNextMonth?: boolean;
}

/**
 * Intelligent local fallback parser that extracts structured transaction details,
 * categories, and auto-detects end-of-month salary for "Count as next month".
 */
export function localHeuristicAiParser(text: string, dateTimestamp?: number): ParsedSms | null {
    const base = parseBankSms(text, dateTimestamp);
    if (!base) return null;

    // Check if salary should be suggested for next month
    // If credited as Salary on or after the 23rd of the month, or mentions advance / next month
    let countForNextMonth = false;
    const lower = text.toLowerCase();
    const isSalary = base.category === 'Salary' || /salary|payroll|stipend/i.test(lower);

    if (isSalary) {
        base.category = 'Salary';
        const d = dateTimestamp ? new Date(dateTimestamp) : new Date();
        const dayOfMonth = d.getDate();
        if (dayOfMonth >= 23 || /next month|advance|for (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(lower)) {
            countForNextMonth = true;
        }
    }

    return {
        ...base,
        countForNextMonth,
    };
}

/**
 * Call the AI LLM API (OpenAI compatible) to categorize and extract useful info in bulk.
 */
async function callAiApi(batch: { id: string; text: string; date?: number }[]): Promise<Map<string, ExtractedAiItem>> {
    const systemPrompt = `You are an expert financial transaction extraction system for Indian bank and UPI SMS messages.
For each message, extract:
- amount (number, positive float)
- type ('income' or 'expense')
- category (one of: 'Food', 'Groceries', 'Travel', 'Fuel', 'Bills', 'Entertainment', 'Health', 'Clothes and Shoes', 'Rent', 'Education', 'Sport', 'Salary', 'Interest', 'Business', 'Other')
- merchant (clean merchant or entity name, or null)
- paymentMethod ('UPI', 'Card', or 'Bank')
- countForNextMonth (boolean: true if category is 'Salary' and paid near end of month or for next month's cycle, otherwise false)

Return ONLY valid JSON matching this structure:
{
  "results": [
    {
      "id": "item-id",
      "amount": 120.0,
      "type": "expense",
      "category": "Food",
      "merchant": "Swiggy",
      "paymentMethod": "UPI",
      "countForNextMonth": false
    }
  ]
}`;

    const userPrompt = JSON.stringify(
        batch.map((b) => ({ id: b.id, text: b.text }))
    );

    const response = await fetch(AI_SMS_CONFIG.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${AI_SMS_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
            model: AI_SMS_CONFIG.model,
            temperature: AI_SMS_CONFIG.temperature,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`AI API returned status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const parsed = JSON.parse(content);
    const resultMap = new Map<string, ExtractedAiItem>();

    if (Array.isArray(parsed.results)) {
        for (const item of parsed.results) {
            if (item && item.id && typeof item.amount === 'number') {
                resultMap.set(item.id, {
                    amount: Math.abs(item.amount),
                    type: item.type === 'income' ? 'income' : 'expense',
                    category: item.category || 'Other',
                    merchant: item.merchant || null,
                    paymentMethod: ['UPI', 'Card', 'Bank'].includes(item.paymentMethod) ? item.paymentMethod : 'Bank',
                    countForNextMonth: Boolean(item.countForNextMonth),
                });
            }
        }
    }

    return resultMap;
}

/**
 * Bulk extract transactions and categorization using AI with automatic local fallback.
 */
export async function aiExtractBulkSms(
    messages: (RawSmsMessage | { body: string; date?: number; _id?: string })[]
): Promise<ParsedSms[]> {
    if (!messages || messages.length === 0) return [];

    const prepared = messages
        .filter((m) => m && m.body && m.body.trim().length > 10)
        .map((m, index) => ({
            id: m._id || `msg-${index}`,
            text: m.body.replace(/\s+/g, ' ').trim(),
            date: m.date,
        }));

    let aiResults: Map<string, ExtractedAiItem> = new Map();

    // If an AI API key is configured, attempt bulk AI classification
    if (isAiApiConfigured()) {
        try {
            // Process in batches of 20 to prevent prompt size issues
            const BATCH_SIZE = 20;
            for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
                const chunk = prepared.slice(i, i + BATCH_SIZE);
                const chunkMap = await callAiApi(chunk);
                chunkMap.forEach((v, k) => aiResults.set(k, v));
            }
        } catch (err) {
            console.warn('AI API call failed, falling back to local heuristic parsing:', err);
            aiResults.clear();
        }
    }

    const output: ParsedSms[] = [];
    const seenDedupe = new Set<string>();

    for (const item of prepared) {
        const localParsed = localHeuristicAiParser(item.text, item.date);
        if (!localParsed) continue;

        const aiItem = aiResults.get(item.id);

        const finalParsed: ParsedSms = {
            ...localParsed,
            amount: aiItem?.amount ?? localParsed.amount,
            type: aiItem?.type ?? localParsed.type,
            category: aiItem?.category ?? localParsed.category,
            merchant: aiItem?.merchant ?? localParsed.merchant,
            paymentMethod: aiItem?.paymentMethod ?? localParsed.paymentMethod,
            countForNextMonth: aiItem?.countForNextMonth ?? localParsed.countForNextMonth,
            rawBody: item.text,
        };

        if (!seenDedupe.has(finalParsed.dedupeKey)) {
            seenDedupe.add(finalParsed.dedupeKey);
            output.push(finalParsed);
        }
    }

    // Sort newest first
    output.sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
    });

    return output;
}
