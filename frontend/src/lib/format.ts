import { CURRENCY } from './config';

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const money = (n: number) => `${CURRENCY}${inr.format(n)}`;
export const moneyShort = (n: number) => `${CURRENCY}${inrWhole.format(Math.round(n))}`;

// "₹1,842" and ".56" are styled separately so the cents can sit muted, as in the reference design.
export const splitMoney = (n: number) => {
    const [whole, cents] = inr.format(Math.abs(n)).split('.');
    return { sign: n < 0 ? '-' : '', whole: `${CURRENCY}${whole}`, cents: `.${cents}` };
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

// Minutes east of UTC, which is what the API expects for month boundaries.
export const tzOffset = () => -new Date().getTimezoneOffset();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const dayLabel = (iso: string) => {
    const date = new Date(iso);
    const diff = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
    return date.getFullYear() === new Date().getFullYear() ? base : `${base} ${date.getFullYear()}`;
};

export const shortDate = (iso: string) => {
    const date = new Date(iso);
    return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
};

export const timeAgo = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return `${days} d ago`;
};

// Whole days from today to the date; negative once it has passed.
export const daysUntil = (iso: string) =>
    Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(new Date()).getTime()) / 86400000);

export const toDateInput = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
export const bucketLabel = (range: 'day' | 'week' | 'month', localStart: string, isLast: boolean) => {
    const d = bucketDate(localStart);
    if (range === 'day') return isLast ? 'Today' : WEEKDAYS_SHORT[d.getDay()];
    if (range === 'week') return isLast ? 'This wk' : dayMonth(d);
    return MONTHS[d.getMonth()].slice(0, 3);
};

// Heading shown above the transactions of a selected bar.
export const bucketTitle = (range: 'day' | 'week' | 'month', localStart: string) => {
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
