// Reads details out of bank and UPI alert SMS messages.
// Supports both single-message parsing (from clipboard) and batch extraction from the device inbox.

export interface ParsedSms {
    amount: number;
    type: 'income' | 'expense';
    category: string;
    merchant: string | null;
    paymentMethod: 'UPI' | 'Card' | 'Bank';
    dedupeKey: string;
    date?: string;
    countForNextMonth?: boolean;
    rawBody?: string;
}

export interface RawSmsMessage {
    _id: string;
    address: string;
    body: string;
    date: number;
}

const AMOUNT = /(?:(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)|(?:debited|credited|spent|paid|purchase|withdrawn|sent|deducted|transfer(?:red)?|received|deposited)(?:\s+(?:by|with|for|of|amounting to))?\s*(?:(?:rs\.?|inr|₹)\s*)?([\d,]+(?:\.\d{1,2})?))/i;
const DEBIT = /\b(debited|spent|paid|purchase|withdrawn|sent|deducted|used for|transfer(?:red)? to|dr)\b/i;
const CREDIT = /\b(credited|received|deposited|refund(?:ed)?|cashback|cr)\b/i;
const MERCHANT = /\b(?:at|to|towards|from|by|@|info:|vpa|trf to)\s+([A-Za-z0-9][A-Za-z0-9 &._@'-]{1,38}?)(?=\s+(?:on|via|ref|upi|avl|bal|using|for|is|dated|a\/c|acct)\b|[.,;(]|\s*$)/i;

// Short, stable fingerprint so pasting or scanning the same alert twice never creates two entries.
export const hash = (text: string) => {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
};

export const suggestCategory = (text: string, merchant: string | null, type: 'income' | 'expense'): string => {
    const combined = `${merchant || ''} ${text}`.toLowerCase();

    if (type === 'income') {
        if (/salary|payroll|stipend|bonus|employer|credited for salary|wages|allowance/i.test(combined)) return 'Salary';
        if (/interest|dividend|fd payout|term deposit|savings int/i.test(combined)) return 'Interest';
        if (/client|invoice|settlement|business|customer|freelance|vendor payout/i.test(combined)) return 'Business';
        return 'Other';
    }

    // Expense categories
    if (/swiggy|zomato|mcdonald|kfc|starbucks|burger|pizza|domino|biryani|biriyani|chai|tea|cafe|coffee|restaurant|hotel|bakery|bakes|bake|sweets|juice|canteen|kitchen|mess|tiffin|dhaba|barbeque|shawarma|food/i.test(combined)) return 'Food';
    if (/zepto|blinkit|instamart|bigbasket|dmart|supermarket|super market|grocer|grocery|provision|kirana|mandi|fruits|vegetable|milk|dairy|fresh|reliance fresh|spencer|nature's basket|departmental/i.test(combined)) return 'Groceries';
    if (/uber|ola|rapido|metro|irctc|redbus|flight|indigo|air india|makemytrip|cleartrip|yatra|taxi|auto|toll|fastag|railway|train|bus ticket|travel/i.test(combined)) return 'Travel';
    if (/petrol|diesel|fuel|hpcl|bpcl|iocl|shell|gas station|petroleum|auto fuel|bunk/i.test(combined)) return 'Fuel';
    if (/airtel|jio|vodafone|vi\b|electricity|bescom|tneb|cesc|mseb|water bill|gas bill|indane|hp gas|bharat gas|broadband|wifi|act fibernet|tata play|dish tv|dth|recharge|postpaid/i.test(combined)) return 'Bills';
    if (/netflix|spotify|prime|hotstar|disney|cinema|pvr|inox|bookmyshow|movie|theatre|game|steam|playstation|sonyliv|youtube/i.test(combined)) return 'Entertainment';
    if (/apollo|medplus|pharmeasy|netmeds|1mg|hospital|clinic|pharmacy|medicine|medical|chemist|lab|diagnostic|healthcare|doctor/i.test(combined)) return 'Health';
    if (/myntra|ajio|zara|h&m|trends|max fashion|pantaloons|nykaa|westside|lifestyle|uniqlo|clothes|footwear|textile|silks|fashions|garment|tailor|shoes/i.test(combined)) return 'Clothes and Shoes';
    if (/rent|landlord|maintenance|housing|society dues|flat rent|pg rent/i.test(combined)) return 'Rent';
    if (/school|college|tuition|coursera|udemy|exam fee|university|education|academy|fees/i.test(combined)) return 'Education';
    if (/decathlon|gym|fitness|cult\.fit|cultfit|sports|badminton|turf/i.test(combined)) return 'Sport';

    return 'Other';
};

export const extractMerchantFromSms = (text: string, isDebit: boolean): string | null => {
    // Clean out common prefix filler like 'debited by', 'credited to your a/c', etc.
    const cleaned = text
        .replace(/debited by\s+/gi, '')
        .replace(/credited to (?:your\s+)?(?:a\/c|account)[^.]*?\s+(?:by\s+)?/gi, (m) => (m.includes('by') ? 'by ' : ' '))
        .replace(/(?:from|to)\s+(?:your\s+)?(?:a\/c|account|acct)[\w\s*#-]*?(?:to|towards|at|by|trf to)\s+/gi, 'to ')
        .replace(/(?:from|in)\s+[\w\s]+(?:bank|a\/c|account)[\w\s*#-]*?(?:to|towards|at)\s+/gi, 'to ');

    // For debits, prioritize 'to X', 'towards X', 'at X', 'vpa X', 'trf to X'
    const targetRegex = isDebit
        ? /(?:\b(?:to|towards|at|for|vpa|trf to)\s+)([a-zA-Z0-9][a-zA-Z0-9 &._@'-]{1,35}?)(?=\s+(?:on|via|ref|upi|avl|bal|using|is|dated|a\/c|acct|through)\b|[.,;(]|\s*$)/i
        : /(?:\b(?:by|from|towards)\s+)([a-zA-Z0-9][a-zA-Z0-9 &._@'-]{1,35}?)(?=\s+(?:on|via|ref|upi|avl|bal|using|is|dated|a\/c|acct|through)\b|[.,;(]|\s*$)/i;

    let match = targetRegex.exec(cleaned);
    if (!match) {
        match = /(?:\b(?:to|towards|at|by|from|trf to)\s+)([a-zA-Z0-9][a-zA-Z0-9 &._@'-]{1,35}?)(?=\s+(?:on|via|ref|upi|avl|bal|using|is|dated|a\/c|acct)\b|[.,;(]|\s*$)/i.exec(cleaned);
    }

    if (match) {
        const m = match[1].trim().replace(/[.\s]+$/, '');
        if (!/^(?:your|a\/c|account|inr|rs|upi|on\s+\d|\d{1,2}[-/]\w{3})/i.test(m) && m.length > 1) {
            return m;
        }
    }

    if (/salary/i.test(text)) return 'Salary';
    return null;
};

const MONTH_MAP: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export const extractDateFromSms = (text: string): string | null => {
    // 1. Matches DD-MMM-YY or DD-MMM-YYYY (e.g. 01-Nov-26, 30-Oct-2026, 05 Nov 26)
    const m1 = /\b(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})\b/i.exec(text);
    if (m1) {
        const d = m1[1].padStart(2, '0');
        const mon = MONTH_MAP[m1[2].toLowerCase()];
        let y = m1[3];
        if (y.length === 2) y = `20${y}`;
        if (mon) return `${y}-${mon}-${d}`;
    }

    // 2. Matches DD/MM/YYYY or DD-MM-YYYY (e.g. 02/11/2026)
    const m2 = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/.exec(text);
    if (m2) {
        const d = m2[1].padStart(2, '0');
        const m = m2[2].padStart(2, '0');
        let y = m2[3];
        if (y.length === 2) y = `20${y}`;
        const monthNum = parseInt(m, 10);
        if (monthNum >= 1 && monthNum <= 12) {
            return `${y}-${m}-${d}`;
        }
    }

    return null;
};

export const parseBankSms = (raw: string, smsDate?: number): ParsedSms | null => {
    const text = raw.replace(/\s+/g, ' ').trim();
    const amountMatch = AMOUNT.exec(text);
    if (!amountMatch) return null;

    const matchedStr = amountMatch[1] || amountMatch[2];
    if (!matchedStr) return null;

    const amount = parseFloat(matchedStr.replace(/,/g, ''));
    if (!(amount > 0)) return null;

    const isDebit = DEBIT.test(text);
    const isCredit = CREDIT.test(text);
    if (!isDebit && !isCredit) return null;

    const type: 'income' | 'expense' = isDebit ? 'expense' : 'income';
    const merchant = extractMerchantFromSms(text.replace(AMOUNT, ''), isDebit);
    const paymentMethod: 'UPI' | 'Card' | 'Bank' = /\bupi\b|@[a-z]{2,}/i.test(text) ? 'UPI' : /\bcard\b/i.test(text) ? 'Card' : 'Bank';
    const category = suggestCategory(text, merchant, type);

    let parsedDate: string | undefined;
    if (smsDate && smsDate > 0) {
        parsedDate = new Date(smsDate).toISOString();
    } else {
        const extracted = extractDateFromSms(text);
        if (extracted) {
            parsedDate = extracted;
        }
    }

    return {
        amount,
        type,
        category,
        merchant: merchant && merchant.length > 1 ? merchant : null,
        paymentMethod,
        dedupeKey: `sms-${hash(text.toLowerCase())}`,
        date: parsedDate,
        rawBody: text,
    };
};

export const extractTransactionsFromSmsList = (messages: RawSmsMessage[]): ParsedSms[] => {
    const results: ParsedSms[] = [];
    const seenDedupe = new Set<string>();

    for (const msg of messages) {
        if (!msg.body) continue;
        const parsed = parseBankSms(msg.body, msg.date);
        if (parsed && !seenDedupe.has(parsed.dedupeKey)) {
            seenDedupe.add(parsed.dedupeKey);
            results.push(parsed);
        }
    }

    // Sort newest first
    results.sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
    });

    return results;
};

// Realistic sample Indian bank transaction alerts for demo and testing preview
export const SAMPLE_INDIAN_BANK_SMS: RawSmsMessage[] = [
    {
        _id: 'demo-1',
        address: 'AD-HDFCBK',
        body: 'Dear Customer, INR 350.00 debited from A/C **1234 on 01-Nov-26 towards Swiggy via UPI Ref 429381029384. Avl Bal: INR 14,820.00.',
        date: Date.now() - 1000 * 60 * 35, // 35 mins ago
    },
    {
        _id: 'demo-2',
        address: 'VK-SBIINB',
        body: 'Your A/C ending 4567 is debited by Rs. 840.00 on 01-Nov-26 at Zepto Quick Grocery. UPI Ref: 429384918234. - SBI',
        date: Date.now() - 1000 * 60 * 180, // 3 hours ago
    },
    {
        _id: 'demo-3',
        address: 'BP-ICICIB',
        body: 'Sent Rs.250.00 from ICICI Bank A/C to Uber India via UPI on 31-Oct-26. Ref No: 429283746192.',
        date: Date.now() - 1000 * 60 * 60 * 22, // Yesterday
    },
    {
        _id: 'demo-4',
        address: 'VM-AXISBK',
        body: 'Axis Bank Alert: Rs. 1,450.00 spent on your Credit Card ending 9012 at HPCL Fuel Station on 30-Oct-26.',
        date: Date.now() - 1000 * 60 * 60 * 46, // 2 days ago
    },
    {
        _id: 'demo-5',
        address: 'AD-HDFCBK',
        body: 'Salary of INR 45,000.00 credited to your A/C **1234 on 30-Oct-26 by Employer Payroll. Avl Bal: INR 58,240.00.',
        date: Date.now() - 1000 * 60 * 60 * 50, // 2 days ago
    },
    {
        _id: 'demo-6',
        address: 'JM-PAYTM',
        body: 'Paid Rs. 650.00 to Airtel Postpaid via Paytm UPI on 29-Oct-26. UPI Ref: 429182736451.',
        date: Date.now() - 1000 * 60 * 60 * 70, // 3 days ago
    },
    {
        _id: 'demo-7',
        address: 'BP-ICICIB',
        body: 'Rs. 420.00 debited from A/C **7890 at Apollo Pharmacy on 28-Oct-26. Avl Bal: INR 12,300.00.',
        date: Date.now() - 1000 * 60 * 60 * 95, // 4 days ago
    },
    {
        _id: 'demo-8',
        address: 'VK-SBIINB',
        body: 'Rs. 799.00 debited from A/C 4567 on 27-Oct-26 towards Netflix via UPI AutoPay. - SBI',
        date: Date.now() - 1000 * 60 * 60 * 120, // 5 days ago
    },
];
