import type { LucideIcon } from 'lucide-react-native';
import {
    Briefcase,
    Bus,
    Clapperboard,
    Dumbbell,
    Fuel,
    Gift,
    GraduationCap,
    HandCoins,
    HeartPulse,
    House,
    Landmark,
    PiggyBank,
    Receipt,
    Shirt,
    ShoppingCart,
    Tag,
    Utensils,
    Wallet,
} from 'lucide-react-native';
import type { CustomCategory, TxType } from './types';

export interface Category {
    name: string;
    Icon: LucideIcon;
    tint: string;
}

export const EXPENSE_CATEGORIES: Category[] = [
    { name: 'Groceries', Icon: ShoppingCart, tint: '#2B8A5F' },
    { name: 'Food', Icon: Utensils, tint: '#B5651D' },
    { name: 'Travel', Icon: Bus, tint: '#2B66E0' },
    { name: 'Health', Icon: HeartPulse, tint: '#D6336C' },
    { name: 'Sport', Icon: Dumbbell, tint: '#7048E8' },
    { name: 'Clothes and Shoes', Icon: Shirt, tint: '#0C8599' },
    { name: 'Bills', Icon: Receipt, tint: '#E8590C' },
    { name: 'Rent', Icon: House, tint: '#5C7CFA' },
    { name: 'Fuel', Icon: Fuel, tint: '#495057' },
    { name: 'Education', Icon: GraduationCap, tint: '#9C36B5' },
    { name: 'Entertainment', Icon: Clapperboard, tint: '#F03E3E' },
    { name: 'Savings', Icon: PiggyBank, tint: '#0CA678' },
    { name: 'Lent', Icon: HandCoins, tint: '#2563EB' },
    { name: 'Other', Icon: Tag, tint: '#868E96' },
];

export const INCOME_CATEGORIES: Category[] = [
    { name: 'Salary', Icon: Wallet, tint: '#1F8F46' },
    { name: 'Business', Icon: Briefcase, tint: '#0B7285' },
    { name: 'Interest', Icon: Landmark, tint: '#5C940D' },
    { name: 'Gift', Icon: Gift, tint: '#D6336C' },
    { name: 'Savings withdrawal', Icon: PiggyBank, tint: '#0CA678' },
    { name: 'Loan repayment', Icon: HandCoins, tint: '#2563EB' },
    { name: 'Other income', Icon: Tag, tint: '#868E96' },
];

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export const normalizeCategory = (name: string): string => {
    if (!name) return '';
    if (/cafes?\s*(and|&)\s*restaurants?/i.test(name)) return 'Food';
    return name;
};

export const categoriesFor = (type: TxType, customCategories?: CustomCategory[] | null): Category[] => {
    const base = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const customs: Category[] = (customCategories || [])
        .filter((c) => c && c.type === type)
        .map((c) => ({
            name: c.name,
            Icon: Tag,
            tint: c.tint || (type === 'income' ? '#1F8F46' : '#E8590C'),
        }));
    return [...base, ...customs];
};

export const getCategory = (name?: string | null, customCategories?: CustomCategory[] | null): Category => {
    const safeName = name || '';
    const normalized = normalizeCategory(safeName);
    const standard = ALL.find((c) => c.name.toLowerCase() === normalized.toLowerCase());
    if (standard) return standard;

    const custom = (customCategories || []).find((c) => c && c.name.toLowerCase() === normalized.toLowerCase());
    if (custom) {
        return {
            name: custom.name,
            Icon: Tag,
            tint: custom.tint || (custom.type === 'income' ? '#1F8F46' : '#E8590C'),
        };
    }

    return { name: safeName, Icon: Tag, tint: '#868E96' };
};

export const PAYMENT_METHODS = ['UPI', 'Card', 'Cash', 'Bank'];
