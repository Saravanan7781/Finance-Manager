import { CURRENCY } from './config';

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const money = (n: number) => `${CURRENCY}${inr.format(typeof n === 'number' && !isNaN(n) ? n : 0)}`;
export const moneyShort = (n: number) => `${CURRENCY}${inrWhole.format(Math.round(typeof n === 'number' && !isNaN(n) ? n : 0))}`;

// "₹1,842" and ".56" are styled separately so the cents can sit muted, as in the reference design.
export const splitMoney = (n: number) => {
    const valid = typeof n === 'number' && !isNaN(n) ? n : 0;
    const parts = inr.format(Math.abs(valid)).split('.');
    const whole = parts[0] || '0';
    const cents = parts[1] || '00';
    return { sign: valid < 0 ? '-' : '', whole: `${CURRENCY}${whole}`, cents: `.${cents}` };
};

// Live number formatter for text inputs: adds Indian comma delimiters (e.g. 1,00,000.50) while typing
export const formatAmountInput = (val: string, prevVal?: string): string => {
    if (!val) return '';
    // If user hit backspace on a comma (val is 1 char shorter than prevVal, but same digits),
    // remove the digit preceding the deleted comma so backspacing feels natural.
    if (prevVal && val.length === prevVal.length - 1 && val.replace(/,/g, '') === prevVal.replace(/,/g, '')) {
        let diffIdx = -1;
        for (let i = 0; i < val.length; i++) {
            if (val[i] !== prevVal[i]) {
                diffIdx = i;
                break;
            }
        }
        if (diffIdx === -1) diffIdx = val.length;
        if (diffIdx > 0) {
            val = val.slice(0, diffIdx - 1) + val.slice(diffIdx);
        }
    }
    const clean = val.replace(/[^0-9.]/g, '');
    if (!clean) return '';
    const parts = clean.split('.');
    const intDigits = parts[0];
    let formattedInt = '';
    if (intDigits) {
        try {
            formattedInt = BigInt(intDigits).toLocaleString('en-IN');
        } catch {
            formattedInt = intDigits;
        }
    }
    if (parts.length > 1) {
        const dec = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
        return (formattedInt || '0') + '.' + dec;
    }
    return formattedInt;
};

// Strips comma delimiters / currency symbols and returns a valid floating-point number
export const parseAmountInput = (val: string | number | null | undefined): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const clean = val.replace(/[^0-9.-]/g, '').trim();
    if (!clean) return 0;
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const shiftMonth = (key: string, delta: number) => {
    const [y, m] = key.split('-').map(Number);
    return monthKey(new Date(y, m - 1 + delta, 1));
};

export const monthLabel = (key: string, short = false) => {
    const [y, m] = key.split('-').map(Number);
    const name = MONTHS[m - 1];
    return short ? `${name.slice(0, 3)} ${y}` : `${name} ${y}`;
};

export const monthBounds = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return {
        from: new Date(y, m - 1, 1).toISOString(),
        to: new Date(new Date(y, m, 1).getTime() - 1).toISOString(),
    };
};

// Minutes east of UTC, which is what the API expects for month boundaries.
export const tzOffset = () => -new Date().getTimezoneOffset();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const dayLabel = (iso: string) => {
    if (!iso) return 'Unknown';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return 'Unknown';
    const diff = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
    return date.getFullYear() === new Date().getFullYear() ? base : `${base} ${date.getFullYear()}`;
};

export const shortDate = (iso: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
};

export const timeAgo = (iso: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return `${days} d ago`;
};

// Whole days from today to the date; negative once it has passed.
export const daysUntil = (iso: string) => {
    if (!iso) return 0;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 0;
    return Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86400000);
};

export const toDateInput = (d: Date) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A calendar date typed as YYYY-MM-DD becomes local noon, which stays on the same day in every timezone.
export const fromDateInput = (text: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return isNaN(date.getTime()) ? null : date;
};

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A bucket's `localStart` is a plain calendar date; read it back at local noon so it never slips a day.
const bucketDate = (localStart: string) => {
    const [y, m, d] = localStart.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
};

const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;

// Short label under a chart bar.
export const bucketLabel = (range: 'day' | 'week' | 'month' | 'year', localStart: string, isLast: boolean) => {
    const d = bucketDate(localStart);
    if (range === 'day') return isLast ? 'Today' : WEEKDAYS_SHORT[d.getDay()];
    if (range === 'week') return isLast ? 'This wk' : dayMonth(d);
    if (range === 'year') return d.getFullYear().toString();
    return MONTHS[d.getMonth()].slice(0, 3);
};

// Heading shown above the transactions of a selected bar.
export const bucketTitle = (range: 'day' | 'week' | 'month' | 'year', localStart: string) => {
    const d = bucketDate(localStart);
    if (range === 'day') {
        const diff = daysUntil(d.toISOString());
        if (diff === 0) return 'Today';
        if (diff === -1) return 'Yesterday';
        return `${WEEKDAYS_LONG[d.getDay()]}, ${dayMonth(d)}`;
    }
    if (range === 'week') {
        const end = new Date(d);
        end.setDate(d.getDate() + 6);
        return `${dayMonth(d)} – ${dayMonth(end)}`;
    }
    if (range === 'year') {
        return `Year ${d.getFullYear()}`;
    }
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// The last `count` calendar days in local time, oldest first, ending today (noon keeps DST shifts harmless).
export const lastDays = (count: number) =>
    Array.from({ length: count }, (_, i) => {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - (count - 1 - i));
        return d;
    });

export const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
