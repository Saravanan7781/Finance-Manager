import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type Language = 'en' | 'ta';

const STORAGE_KEY = 'app_language_preference';

let currentLanguage: Language = 'en';
const listeners = new Set<(lang: Language) => void>();

export const getLanguage = (): Language => currentLanguage;

export const setLanguage = async (lang: Language) => {
    currentLanguage = lang;
    try {
        await AsyncStorage.setItem(STORAGE_KEY, lang);
    } catch {}
    listeners.forEach((listener) => listener(lang));
};

// Initialize language from storage
AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
    if (stored === 'ta' || stored === 'en') {
        currentLanguage = stored;
        listeners.forEach((listener) => listener(stored));
    }
}).catch(() => {});

export const DICTIONARY = {
    en: {
        // Tabs & Navigation
        tab_home: 'Home',
        tab_activity: 'Transactions',
        tab_insights: 'Insights',
        tab_family: 'Family',

        // Quick Menu
        quick_earn: 'Earn',
        quick_spend: 'Spend',
        quick_lend: 'Lend',

        // Stats & Headers
        spent: 'SPENT',
        received: 'RECEIVED',
        balance: 'BALANCE',
        your_balance: 'Your balance',
        family_balance: 'Family balance',
        this_month: 'this month',
        net: 'NET',
        all: 'All',

        // Ranges
        range_day: 'Day',
        range_week: 'Week',
        range_month: 'Month',
        range_year: 'Year',
        range_today: 'TODAY',
        range_1week: '1 WEEK',
        range_current_month: 'CURRENT MONTH',
        range_that_year: 'THAT YEAR',
        spending_by_category: 'Spending by category',

        // Common Actions
        save: 'Save',
        save_changes: 'Save changes',
        add_transaction: 'Add transaction',
        new_transaction: 'New transaction',
        edit_transaction: 'Edit transaction',
        delete: 'Delete',
        cancel: 'Cancel',
        undo: 'Undo',
        retry: 'Retry',
        search: 'Search',
        search_hint: 'Search note, category, person',
        today: 'Today',
        yesterday: 'Yesterday',
        loading: 'Loading...',

        // Transaction Details
        amount: 'AMOUNT',
        category: 'CATEGORY',
        note: 'Note',
        paid_via: 'PAID VIA',
        date: 'Date',

        // Features: Salary & Split
        count_as_next_month: 'Count as next month',
        count_as_next_month_desc: 'Count this salary towards next month received income while keeping original date',
        next_month_badge: 'Next Month',
        split_expense: 'Split this expense',
        split_expense_desc: 'Pay for friends and track their share in Lent',
        my_share: 'My Share',
        friends_owe: 'Friends owe you',
        split_with: 'Friend(s) name',
        split_badge: 'Split',

        // SMS Import
        extract_from_sms: 'Extract from SMS',
        ai_categorize: 'AI Categorize',
        select_all: 'Select all',
        unselect_all: 'Unselect all',
        ready_to_import: 'READY TO IMPORT',
        delete_all_sms: 'Delete all stored SMS transactions',
        paste_sms: 'Paste SMS alert',

        // Categories
        cat_Food: 'Food',
        cat_Groceries: 'Groceries',
        cat_Travel: 'Travel',
        cat_Fuel: 'Fuel',
        cat_Bills: 'Bills',
        cat_Rent: 'Rent',
        cat_Entertainment: 'Entertainment',
        cat_Health: 'Health',
        cat_Clothes_and_Shoes: 'Clothes & Shoes',
        cat_Education: 'Education',
        cat_Sport: 'Sport',
        cat_Salary: 'Salary',
        cat_Interest: 'Interest',
        cat_Business: 'Business',
        cat_Savings: 'Savings',
        cat_Lent: 'Lent',
        cat_Other: 'Other',

        // Settings / Language
        language: 'Language',
        language_english: 'English',
        language_tamil: 'தமிழ் (Tamil)',
        switch_language: 'Switch Language',
    },
    ta: {
        // Tabs & Navigation
        tab_home: 'முகப்பு',
        tab_activity: 'பரிவர்த்தனைகள்',
        tab_insights: 'பகுப்பாய்வு',
        tab_family: 'குடும்பம்',

        // Quick Menu
        quick_earn: 'வருமானம்',
        quick_spend: 'செலவு',
        quick_lend: 'கடன்',

        // Stats & Headers
        spent: 'செலவு',
        received: 'வரவு',
        balance: 'இருப்பு',
        your_balance: 'உங்கள் இருப்பு',
        family_balance: 'குடும்ப இருப்பு',
        this_month: 'இந்த மாதம்',
        net: 'நிகர மதிப்பு',
        all: 'அனைத்தும்',

        // Ranges
        range_day: 'நாள்',
        range_week: 'வாரம்',
        range_month: 'மாதம்',
        range_year: 'ஆண்டு',
        range_today: 'இன்று',
        range_1week: '1 வாரம்',
        range_current_month: 'நடப்பு மாதம்',
        range_that_year: 'இந்த ஆண்டு',
        spending_by_category: 'பிரிவு வாரியாக செலவு',

        // Common Actions
        save: 'சேமி',
        save_changes: 'மாற்றங்களைச் சேமி',
        add_transaction: 'பரிவர்த்தனை சேர்க்க',
        new_transaction: 'புதிய பரிவர்த்தனை',
        edit_transaction: 'பரிவர்த்தனை திருத்து',
        delete: 'நீக்கு',
        cancel: 'ரத்து செய்',
        undo: 'முந்தைய நிலை',
        retry: 'மீண்டும் முயற்சி',
        search: 'தேடுக',
        search_hint: 'குறிப்பு, பிரிவு, நபரைத் தேடுங்கள்',
        today: 'இன்று',
        yesterday: 'நேற்று',
        loading: 'ஏற்றுகிறது...',

        // Transaction Details
        amount: 'தொகை',
        category: 'பிரிவு',
        note: 'குறிப்பு',
        paid_via: 'செலுத்திய முறை',
        date: 'தேதி',

        // Features: Salary & Split
        count_as_next_month: 'அடுத்த மாதத்தில் சேர்க்கவும்',
        count_as_next_month_desc: 'அசல் தேதியைப் பாதுகாத்து அடுத்த மாத வரவில் கணக்கிடப்படும்',
        next_month_badge: 'அடுத்த மாதம்',
        split_expense: 'செலவைப் பகிர்க (Split)',
        split_expense_desc: 'நண்பர்களுக்காக செலுத்தி அவர்களின் பங்கை கடனில் பதிவு செய்க',
        my_share: 'என் பங்கு',
        friends_owe: 'நண்பர்கள் தர வேண்டியது',
        split_with: 'நண்பரின் பெயர்',
        split_badge: 'பகிரப்பட்டது',

        // SMS Import
        extract_from_sms: 'SMS-லிருந்து எடுக்கவும்',
        ai_categorize: 'AI வகைப்படுத்துதல்',
        select_all: 'அனைத்தும்',
        unselect_all: 'தேர்வை நீக்கு',
        ready_to_import: 'பதிவு செய்ய தயார்',
        delete_all_sms: 'சேமிக்கப்பட்ட SMS பரிவர்த்தனைகளை நீக்கு',
        paste_sms: 'SMS ஒட்டுக',

        // Categories
        cat_Food: 'உணவு',
        cat_Groceries: 'மளிகை',
        cat_Travel: 'பயணம்',
        cat_Fuel: 'எரிபொருள்',
        cat_Bills: 'கட்டணங்கள்',
        cat_Rent: 'வாடகை',
        cat_Entertainment: 'பொழுதுபோக்கு',
        cat_Health: 'மருத்துவம்',
        cat_Clothes_and_Shoes: 'ஆடைகள்',
        cat_Education: 'கல்வி',
        cat_Sport: 'விளையாட்டு',
        cat_Salary: 'சம்பளம்',
        cat_Interest: 'வட்டி',
        cat_Business: 'வணிகம்',
        cat_Savings: 'சேமிப்பு',
        cat_Lent: 'கடன்',
        cat_Other: 'மற்றவை',

        // Settings / Language
        language: 'மொழி (Language)',
        language_english: 'English',
        language_tamil: 'தமிழ் (Tamil)',
        switch_language: 'மொழியை மாற்றுக',
    },
};

export type TranslationKey = keyof typeof DICTIONARY.en;

export const t = (key: TranslationKey): string => {
    const dict = DICTIONARY[currentLanguage] || DICTIONARY.en;
    return (dict as any)[key] || (DICTIONARY.en as any)[key] || key;
};

// Category translation helper
export const translateCategory = (catName: string): string => {
    if (!catName) return catName;
    const cleanKey = `cat_${catName.replace(/[\s&]+/g, '_')}` as TranslationKey;
    if (cleanKey in DICTIONARY.en) {
        return t(cleanKey);
    }
    return catName;
};

export function useTranslation() {
    const [lang, setLangState] = useState<Language>(currentLanguage);

    useEffect(() => {
        const handler = (newLang: Language) => setLangState(newLang);
        listeners.add(handler);
        return () => {
            listeners.delete(handler);
        };
    }, []);

    return {
        t,
        lang,
        setLanguage,
        isTamil: lang === 'ta',
        translateCategory,
    };
}
