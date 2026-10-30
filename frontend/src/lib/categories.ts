import type { LucideIcon } from 'lucide-react-native';
import {
    Briefcase,
    Bus,
    Clapperboard,
    Coffee,
    Dumbbell,
    Fuel,
    Gift,
    GraduationCap,
    HandCoins,
    HeartPulse,
    House,
    Landmark,
    Receipt,
    Shirt,
    ShoppingCart,
    Tag,
    Wallet,
} from 'lucide-react-native';
import type { TxType } from './types';

export interface Category {
    name: string;
    Icon: LucideIcon;
    tint: string;
}

export const EXPENSE_CATEGORIES: Category[] = [
    { name: 'Groceries', Icon: ShoppingCart, tint: '#2B8A5F' },
    { name: 'Cafes and Restaurants', Icon: Coffee, tint: '#B5651D' },
    { name: 'Travel', Icon: Bus, tint: '#2B66E0' },
    { name: 'Health', Icon: HeartPulse, tint: '#D6336C' },
    { name: 'Sport', Icon: Dumbbell, tint: '#7048E8' },
    { name: 'Clothes and Shoes', Icon: Shirt, tint: '#0C8599' },
    { name: 'Bills', Icon: Receipt, tint: '#E8590C' },
    { name: 'Rent', Icon: House, tint: '#5C7CFA' },
    { name: 'Fuel', Icon: Fuel, tint: '#495057' },
    { name: 'Education', Icon: GraduationCap, tint: '#9C36B5' },
    { name: 'Entertainment', Icon: Clapperboard, tint: '#F03E3E' },
    { name: 'Lent', Icon: HandCoins, tint: '#2563EB' },
    { name: 'Other', Icon: Tag, tint: '#868E96' },
];

export const INCOME_CATEGORIES: Category[] = [
    { name: 'Salary', Icon: Wallet, tint: '#1F8F46' },
    { name: 'Business', Icon: Briefcase, tint: '#0B7285' },
    { name: 'Interest', Icon: Landmark, tint: '#5C940D' },
    { name: 'Gift', Icon: Gift, tint: '#D6336C' },
    { name: 'Other income', Icon: Tag, tint: '#868E96' },
];

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export const categoriesFor = (type: TxType) => (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);

export const getCategory = (name: string): Category =>
    ALL.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? { name, Icon: Tag, tint: '#868E96' };

export const PAYMENT_METHODS = ['UPI', 'Card', 'Cash', 'Bank'];
