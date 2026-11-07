// AI-powered SMS Parser and Categorization Layer
// Supports Google Gemini, OpenAI, Groq, and custom OpenAI-compatible endpoints
// Includes persistent in-app configuration via AsyncStorage and resilient local heuristics fallback

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParsedSms, RawSmsMessage, suggestCategory, extractMerchantFromSms, parseBankSms, hash } from './sms';

export type AiProvider = 'gemini' | 'openai' | 'groq' | 'custom';

export interface AiSmsConfig {
    provider: AiProvider;
    apiKey: string;
    model: string;
    apiUrl: string;
    temperature: number;
}

export const AI_CONFIG_STORAGE_KEY = 'family_finance_user_ai_config';

export const PROVIDER_DEFAULTS: Record<AiProvider, { name: string; apiUrl: string; model: string; hint: string }> = {
    gemini: {
        name: 'Google Gemini',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model: 'gemini-1.5-flash',
        hint: 'Free API key from aistudio.google.com (generous free quota, no credit card)',
    },
    openai: {
        name: 'OpenAI',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        hint: 'API key from platform.openai.com',
    },
    groq: {
        name: 'Groq (Free & Fast)',
        apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'llama-3.1-8b-instant',
        hint: 'Fast free API key from console.groq.com',
    },
    custom: {
        name: 'Custom Endpoint',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        hint: 'Any OpenAI-compatible completions endpoint',
    },
};

// In-memory active configuration sourced strictly from environment variables (.env)
const getEnvKey = () => (process.env.EXPO_PUBLIC_AI_API_KEY || '').trim();
const getEnvModel = () => (process.env.EXPO_PUBLIC_AI_MODEL || 'gemini-3.8-flash').trim();

let activeConfig: AiSmsConfig = {
    provider: 'gemini',
    apiKey: getEnvKey(),
    model: getEnvModel(),
    apiUrl: process.env.EXPO_PUBLIC_AI_API_URL || PROVIDER_DEFAULTS.gemini.apiUrl,
    temperature: 0.1,
};

const listeners = new Set<(cfg: AiSmsConfig) => void>();

export const getAiConfig = (): AiSmsConfig => ({ ...activeConfig });

export const detectProviderFromKey = (key: string): AiProvider => {
    const k = (key || '').trim();
    if (k.startsWith('AIzaSy')) return 'gemini';
    if (k.startsWith('gsk_')) return 'groq';
    if (k.startsWith('sk-')) return 'openai';
    return 'gemini';
};

// Initialize from storage at startup
AsyncStorage.getItem(AI_CONFIG_STORAGE_KEY)
    .then((raw) => {
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    activeConfig = {
                        ...activeConfig,
                        ...parsed,
                        temperature: 0.1,
                    };
                    listeners.forEach((fn) => fn(activeConfig));
                }
            } catch {}
        }
    })
    .catch(() => {});

export const subscribeAiConfig = (listener: (cfg: AiSmsConfig) => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const loadStoredAiConfig = async (): Promise<AiSmsConfig> => {
    try {
        const raw = await AsyncStorage.getItem(AI_CONFIG_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            activeConfig = {
                ...activeConfig,
                ...parsed,
            };
        }
    } catch {}
    return { ...activeConfig };
};

export const saveStoredAiConfig = async (newCfg: Partial<AiSmsConfig>): Promise<AiSmsConfig> => {
    const provider = newCfg.provider || activeConfig.provider;
    const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.gemini;

    activeConfig = {
        provider,
        apiKey: newCfg.apiKey !== undefined ? newCfg.apiKey.trim() : activeConfig.apiKey,
        model: newCfg.model?.trim() || defaults.model,
        apiUrl: newCfg.apiUrl?.trim() || defaults.apiUrl,
        temperature: 0.1,
    };

    try {
        await AsyncStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(activeConfig));
    } catch {}

    listeners.forEach((fn) => fn(activeConfig));
    return { ...activeConfig };
};

export const clearStoredAiConfig = async (): Promise<void> => {
    activeConfig = {
        provider: 'gemini',
        apiKey: '',
        model: PROVIDER_DEFAULTS.gemini.model,
        apiUrl: PROVIDER_DEFAULTS.gemini.apiUrl,
        temperature: 0.1,
    };
    try {
        await AsyncStorage.removeItem(AI_CONFIG_STORAGE_KEY);
    } catch {}
    listeners.forEach((fn) => fn(activeConfig));
};

// Check if a real AI API key is configured
export const isAiApiConfigured = (): boolean => {
    const key = (process.env.EXPO_PUBLIC_AI_API_KEY || activeConfig.apiKey || '').trim();
    return Boolean(
        key &&
        key !== 'PLACEHOLDER_API_KEY' &&
        key.length > 5
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

const SYSTEM_PROMPT = `You are an expert financial transaction extraction system for Indian bank and UPI SMS messages.
For each message, extract:
- amount (number, positive float)
- type ('income' or 'expense')
- category (one of: 'Food', 'Groceries', 'Travel', 'Fuel', 'Bills', 'Entertainment', 'Health', 'Clothes and Shoes', 'Rent', 'Education', 'Sport', 'Salary', 'Interest', 'Business', 'Other')
- merchant (clean merchant or entity name, or null)
- paymentMethod ('UPI', 'Card', or 'Bank')
- countForNextMonth (boolean: true if category is 'Salary' and credited near end of month or for next month's cycle, otherwise false)

Return ONLY valid JSON matching this exact structure:
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

/**
 * Call the AI LLM API (OpenAI compatible or Gemini native) to categorize and extract useful info in bulk.
 */
async function callAiApi(
    batch: { id: string; text: string; date?: number }[],
    config: AiSmsConfig = activeConfig
): Promise<Map<string, ExtractedAiItem>> {
    const userPrompt = JSON.stringify(
        batch.map((b) => ({ id: b.id, text: b.text }))
    );

    let rawJsonContent: string | null = null;

    // 1. Try standard OpenAI-compatible completions endpoint
    try {
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                temperature: 0.1,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt },
                ],
            }),
        });

        if (response.ok) {
            const data = await response.json();
            rawJsonContent = data.choices?.[0]?.message?.content || null;
        } else {
            const errBody = await response.text().catch(() => '');
            // If Gemini OpenAI endpoint failed with 400 or 404, we will try native Gemini below
            if (config.provider !== 'gemini') {
                throw new Error(`AI API error (${response.status}): ${errBody.slice(0, 160)}`);
            }
        }
    } catch (openAiErr) {
        if (config.provider !== 'gemini') {
            throw openAiErr;
        }
    }

    // 2. If Gemini and OpenAI-compatible failed or was not parsed, try Gemini native generateContent
    if (!rawJsonContent && (config.provider === 'gemini' || config.apiKey)) {
        const key = (process.env.EXPO_PUBLIC_AI_API_KEY || config.apiKey || '').trim();
        const rawModel = (process.env.EXPO_PUBLIC_AI_MODEL || config.model || 'gemini-3.5-flash').trim();
        const candidateModels = [
            rawModel.toLowerCase().replace(/\s+/g, '-'),
            'gemini-3.5-flash',
            'gemini-flash-lite-latest',
            'gemini-3.8-flash',
            'gemini-3.7-flash',
            'gemini-flash-latest',
        ];
        const uniqueModels = Array.from(new Set(candidateModels));
        let lastErrorText = '';

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
                                parts: [{ text: `${SYSTEM_PROMPT}\n\nInput transactions to process:\n${userPrompt}` }],
                            },
                        ],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.1,
                        },
                    }),
                    signal: AbortSignal.timeout(15000),
                });

                if (nativeResp.ok) {
                    const nativeData = await nativeResp.json();
                    rawJsonContent = nativeData.candidates?.[0]?.content?.parts?.[0]?.text || null;
                    if (rawJsonContent) break;
                } else {
                    const errBody = await nativeResp.text().catch(() => '');
                    lastErrorText = `(${nativeResp.status}): ${errBody.slice(0, 160)}`;
                }
            } catch (fetchErr: any) {
                lastErrorText = fetchErr?.message || '';
            }
        }

        if (!rawJsonContent && lastErrorText) {
            console.warn(`Gemini API bulk parse error: ${lastErrorText}`);
        }
    }

    if (!rawJsonContent) {
        throw new Error('Empty or unparseable response from AI API');
    }

    // Extract JSON substring if LLM added markdown code blocks
    const cleanedJson = rawJsonContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanedJson);
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
 * Test an API key and configuration with a tiny test message.
 */
export async function testAiConnection(config: AiSmsConfig): Promise<{ ok: boolean; message: string }> {
    if (!config.apiKey || config.apiKey.trim().length < 8) {
        return { ok: false, message: 'Please enter a valid API key' };
    }

    try {
        const testBatch = [
            { id: 'test-1', text: 'Dear Customer, INR 150.00 debited from A/C **1234 on 01-Nov-26 towards Swiggy via UPI Ref 429381029384.' },
        ];
        const res = await callAiApi(testBatch, config);
        const item = res.get('test-1');
        if (item && item.amount === 150) {
            return {
                ok: true,
                message: `Connected successfully to ${config.provider.toUpperCase()} (${config.model})! Extracted: ₹${item.amount} • ${item.category}`,
            };
        }
        return { ok: true, message: `Connected to ${config.provider} (${config.model}) successfully!` };
    } catch (e) {
        const msg = (e as Error).message || 'Connection failed';
        return { ok: false, message: msg };
    }
}

/**
 * Bulk extract transactions and categorization using AI with automatic local fallback.
 */
export async function aiExtractBulkSms(
    messages: (RawSmsMessage | { body: string; date?: number; _id?: string })[]
): Promise<{ parsed: ParsedSms[]; usedAi: boolean; aiError?: string }> {
    if (!messages || messages.length === 0) return { parsed: [], usedAi: false };

    const prepared = messages
        .filter((m) => m && m.body && m.body.trim().length > 10)
        .map((m, index) => ({
            id: m._id || `msg-${index}`,
            text: m.body.replace(/\s+/g, ' ').trim(),
            date: m.date,
        }));

    let aiResults: Map<string, ExtractedAiItem> = new Map();
    let usedAi = false;
    let aiError: string | undefined;

    // If an AI API key is configured, attempt bulk AI classification
    if (isAiApiConfigured()) {
        try {
            // Process in batches of 20 to prevent prompt size issues
            const BATCH_SIZE = 20;
            for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
                const chunk = prepared.slice(i, i + BATCH_SIZE);
                const chunkMap = await callAiApi(chunk, activeConfig);
                chunkMap.forEach((v, k) => aiResults.set(k, v));
            }
            usedAi = aiResults.size > 0;
        } catch (err) {
            aiError = (err as Error).message || 'AI API call failed';
            console.warn('AI API call failed, falling back to local heuristic parsing:', aiError);
            aiResults.clear();
        }
    }

    const output: ParsedSms[] = [];
    const seenDedupe = new Set<string>();

    for (const item of prepared) {
        const localParsed = localHeuristicAiParser(item.text, item.date);
        const aiItem = aiResults.get(item.id);

        if (!localParsed && !aiItem) continue;

        const amount = aiItem?.amount ?? localParsed?.amount ?? 0;
        if (!(amount > 0)) continue;

        const type = aiItem?.type ?? localParsed?.type ?? 'expense';
        const category = aiItem?.category ?? localParsed?.category ?? 'Other';
        const merchant = aiItem?.merchant ?? localParsed?.merchant ?? null;
        const paymentMethod = aiItem?.paymentMethod ?? localParsed?.paymentMethod ?? 'Bank';
        const countForNextMonth = aiItem?.countForNextMonth ?? localParsed?.countForNextMonth ?? false;

        const parsedDate = localParsed?.date || (item.date ? new Date(item.date).toISOString() : new Date().toISOString());
        const dedupeKey = localParsed?.dedupeKey || `sms-${hash(item.text)}-${amount}`;

        const finalParsed: ParsedSms = {
            amount,
            type,
            category,
            merchant,
            paymentMethod,
            dedupeKey,
            date: parsedDate,
            countForNextMonth,
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

    return { parsed: output, usedAi, aiError };
}
