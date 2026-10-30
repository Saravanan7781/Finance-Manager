// Reads the details out of a bank or UPI alert SMS. The text is pasted in by the person, which works on
// every platform; reading the inbox automatically would need a native build and the READ_SMS permission.

export interface ParsedSms {
    amount: number;
    type: 'income' | 'expense';
    merchant: string | null;
    paymentMethod: 'UPI' | 'Card' | 'Bank';
    dedupeKey: string;
}

const AMOUNT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DEBIT = /\b(debited|spent|paid|purchase|withdrawn|sent|deducted)\b/i;
const CREDIT = /\b(credited|received|deposited|refund(?:ed)?)\b/i;
const MERCHANT = /\b(?:at|to|towards|from|by|@)\s+([A-Za-z0-9][A-Za-z0-9 &._@'-]{1,38}?)(?=\s+(?:on|via|ref|upi|avl|bal|using|for|is|dated)\b|[.,;(]|\s*$)/i;

// Short, stable fingerprint so pasting the same alert twice never creates two entries.
const hash = (text: string) => {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
};

export const parseBankSms = (raw: string): ParsedSms | null => {
    const text = raw.replace(/\s+/g, ' ').trim();
    const amountMatch = AMOUNT.exec(text);
    if (!amountMatch) return null;

    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (!(amount > 0)) return null;

    const isDebit = DEBIT.test(text);
    const isCredit = CREDIT.test(text);
    if (!isDebit && !isCredit) return null;

    // "debited ... credited to X" style alerts describe money leaving.
    const type = isDebit ? 'expense' : 'income';

    const merchantMatch = MERCHANT.exec(text.replace(AMOUNT, ''));
    const merchant = merchantMatch ? merchantMatch[1].trim().replace(/[.\s]+$/, '') : null;

    const paymentMethod = /\bupi\b|@[a-z]{2,}/i.test(text) ? 'UPI' : /\bcard\b/i.test(text) ? 'Card' : 'Bank';

    return {
        amount,
        type,
        merchant: merchant && merchant.length > 1 ? merchant : null,
        paymentMethod,
        dedupeKey: `sms-${hash(text.toLowerCase())}`,
    };
};
