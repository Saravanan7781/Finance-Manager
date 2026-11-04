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

        // Quick Menu & FAB
        quick_earn: 'Earn',
        quick_spend: 'Spend',
        quick_lend: 'Lend',
        hold_me: 'Hold me!',

        // Stats & Headers
        spent: 'SPENT',
        received: 'RECEIVED',
        balance: 'BALANCE',
        your_balance: 'Your balance',
        family_balance: 'Family balance',
        this_month: 'this month',
        net: 'NET',
        all: 'All',

        // Spending & Transactions
        your_spending: 'Your spending',
        spending: 'Spending',
        latest_transactions: 'Latest Transactions',
        your_expenses: 'Your expenses',
        expenses: 'Expenses',
        income: 'Income',
        total_spent: 'Total spent',
        breakdown_by_category: 'Breakdown by category',
        monthly_comparison: 'Monthly comparison',
        no_expenses_recorded: 'No expenses recorded for this month.',
        biggest_expense: 'Biggest expense',

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
        nothing_spent_period: 'Nothing spent in this period.',

        // Filtering & Search
        search: 'Search',
        search_hint: 'Search note, category, person',
        filter_by_month: 'Filter by month',
        just_me: 'Just me',
        clear_filters: 'Clear filters',
        no_transactions_found: 'No transactions found',
        no_transactions_here: 'No transactions here',
        nothing_matches: 'Nothing matches',
        try_different_search: 'Try a different search, category or month.',
        add_one_with_plus: 'Add one with the yellow + button.',

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

        // Plan Together / Settings
        plan_together: 'Plan together',
        members: 'Members',
        you: 'You',
        invite_code: 'INVITE CODE',
        generate_new_code: 'Generate a new code',
        copy: 'Copy',
        copied: 'Copied',
        share: 'Share',
        goals: 'Goals',
        goals_hint: 'Save for what matters',
        loans: 'Loans',
        loans_hint: 'Money lent and borrowed',
        budgets: 'Budgets',
        budgets_hint: 'Monthly limits by category',
        recurring_bills: 'Recurring Bills',
        recurring_hint: 'Rent, bills, subscriptions',
        custom_categories: 'Custom Categories',
        custom_hint: 'Personalize transaction categories',
        export_csv: 'Export to CSV',
        export_hint: 'Download backup & spreadsheet',
        ai_api_key: 'AI API Key',
        ai_hint: 'Set Gemini / OpenAI Key',
        your_name: 'Your name',
        family_name: 'Family name',
        color_theme: 'Color theme',
        smart_reminders: 'Smart reminders',
        reminders_hint: 'Loan due dates and goal deadlines',
        leave_family: 'Leave family',
        sign_out: 'Sign out',

        // Recurring Bills
        est_monthly_spend: 'EST. MONTHLY SPEND',
        est_monthly_income: 'EST. MONTHLY INCOME',
        save_recurring: 'Save recurring item',
        frequency: 'FREQUENCY',
        freq_monthly: 'Monthly',
        freq_weekly: 'Weekly',
        freq_yearly: 'Yearly',
        freq_daily: 'Daily',
        auto_record: 'Auto-record',

        // SMS Import
        extract_from_sms: 'Extract from SMS',
        ai_categorize: 'AI Categorize',
        select_all: 'Select all',
        unselect_all: 'Unselect all',
        ready_to_import: 'READY TO IMPORT',
        delete_all_sms: 'Delete all stored SMS transactions',
        paste_sms: 'Paste SMS alert',

        // Ask Chatbot
        ask_title: 'Ask AI',
        what_to_know: 'What do you want to know?',
        ask_subtitle: 'Ask questions about your family finances in English or Tamil.',
        ask_money_hint: 'Ask about your money',
        thinking: 'Thinking...',

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

        // Language
        language: 'Language',
        language_english: 'English',
        language_tamil: 'தமிழ் (Tamil)',
        switch_language: 'Switch Language',
        // Extra UI Labels
        scope_me: 'ME',
        scope_family: 'FAMILY',
        see_all: 'See All',
        view_all: 'View All',
        manage: 'Manage',
        add_goal: 'Add goal',
        load_older: 'Load older',
        all_time: 'All time',
        all_categories: 'All categories',
        no_spending: 'No spending',
        a_quiet_month: 'A quiet month',
        biggest_categories: 'Biggest categories',
        who_spent: 'Who spent',
        where_your_money_went: 'WHERE YOUR MONEY WENT',
        where_money_went: 'WHERE THE MONEY WENT',
        tap_bar_transactions: 'TAP A BAR TO SEE ITS TRANSACTIONS',
    },
    ta: {
        // Tabs & Navigation
        tab_home: 'முகப்பு',
        tab_activity: 'பரிவர்த்தனைகள்',
        tab_insights: 'பகுப்பாய்வு',
        tab_family: 'குடும்பம்',

        // Quick Menu & FAB
        quick_earn: 'வருமானம்',
        quick_spend: 'செலவு',
        quick_lend: 'கடன்',
        hold_me: 'அழுத்திப் பிடிக்கவும்!',

        // Stats & Headers
        spent: 'செலவு',
        received: 'வரவு',
        balance: 'இருப்பு',
        your_balance: 'உங்கள் இருப்பு',
        family_balance: 'குடும்ப இருப்பு',
        this_month: 'இந்த மாதம்',
        net: 'நிகர மதிப்பு',
        all: 'அனைத்தும்',

        // Spending & Transactions
        your_spending: 'உங்கள் செலவு',
        spending: 'செலவு',
        latest_transactions: 'சமீபத்திய பரிவர்த்தனைகள்',
        your_expenses: 'உங்கள் செலவுகள்',
        expenses: 'செலவுகள்',
        income: 'வருமானம்',
        total_spent: 'மொத்த செலவு',
        breakdown_by_category: 'பிரிவு வாரியான விவரம்',
        monthly_comparison: 'மாத ஒப்பீடு',
        no_expenses_recorded: 'இந்த மாதத்தில் எந்த செலவும் பதிவு செய்யப்படவில்லை.',
        biggest_expense: 'அதிகபட்ச செலவு',

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
        nothing_spent_period: 'இந்த காலத்தில் செலவு எதுவும் இல்லை.',

        // Filtering & Search
        search: 'தேடுக',
        search_hint: 'குறிப்பு, பிரிவு, நபரைத் தேடுங்கள்',
        filter_by_month: 'மாதம் வாரியாக வடிகட்டவும்',
        just_me: 'எனக்கு மட்டும்',
        clear_filters: 'வடிகட்டிகளை நீக்கு',
        no_transactions_found: 'பரிவர்த்தனைகள் எதுவும் கிடைக்கவில்லை',
        no_transactions_here: 'இங்கு பரிவர்த்தனைகள் இல்லை',
        nothing_matches: 'பொருத்தம் எதுவும் இல்லை',
        try_different_search: 'வேறு தேடல், பிரிவு அல்லது மாதத்தைத் தேர்ந்தெடுக்கவும்.',
        add_one_with_plus: 'மஞ்சள் + பொத்தானைக் கொண்டு சேர்க்கவும்.',

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

        // Plan Together / Settings
        plan_together: 'ஒன்றாக திட்டமிடுங்கள்',
        members: 'உறுப்பினர்கள்',
        you: 'நீங்கள்',
        invite_code: 'அழைப்பு குறியீடு',
        generate_new_code: 'புதிய குறியீட்டை உருவாக்கு',
        copy: 'நகலெடு',
        copied: 'நகலெடுக்கப்பட்டது',
        share: 'பகிர்',
        goals: 'இலக்குகள்',
        goals_hint: 'முக்கியமானவற்றுக்கு சேமிக்கவும்',
        loans: 'கடன்கள்',
        loans_hint: 'கொடுத்த மற்றும் வாங்கிய கடன்',
        budgets: 'பட்ஜெட்',
        budgets_hint: 'பிரிவு வாரியான மாத வரம்புகள்',
        recurring_bills: 'தொடர் பில்கள்',
        recurring_hint: 'வாடகை, பில்கள், சந்தாக்கள்',
        custom_categories: 'தனிப்பயன் பிரிவுகள்',
        custom_hint: 'பரிவர்த்தனை பிரிவுகளைத் தனிப்பயனாக்குங்கள்',
        export_csv: 'CSV ஏற்றுமதி',
        export_hint: 'காப்புப்பிரதி மற்றும் விரிதாளைப் பதிவிறக்குங்கள்',
        ai_api_key: 'AI API சாவி',
        ai_hint: 'Gemini / OpenAI சாவியை அமைக்கவும்',
        your_name: 'உங்கள் பெயர்',
        family_name: 'குடும்ப பெயர்',
        color_theme: 'வண்ண தீம்',
        smart_reminders: 'நினைவூட்டல்கள்',
        reminders_hint: 'கடன் மற்றும் இலக்கு நினைவூட்டல்',
        leave_family: 'குடும்பத்திலிருந்து வெளியேறு',
        sign_out: 'வெளியேறு',

        // Recurring Bills
        est_monthly_spend: 'மதிப்பிடப்பட்ட மாதச் செலவு',
        est_monthly_income: 'மதிப்பிடப்பட்ட மாத வரவு',
        save_recurring: 'தொடர் பில்லைச் சேமிக்கவும்',
        frequency: 'அதிர்வெண்',
        freq_monthly: 'மாதாந்திர',
        freq_weekly: 'வாராந்திர',
        freq_yearly: 'வருடாந்திர',
        freq_daily: 'தினசரி',
        auto_record: 'தானியங்கி பதிவு',

        // SMS Import
        extract_from_sms: 'SMS-லிருந்து எடுக்கவும்',
        ai_categorize: 'AI வகைப்படுத்துதல்',
        select_all: 'அனைத்தும்',
        unselect_all: 'தேர்வை நீக்கு',
        ready_to_import: 'பதிவு செய்ய தயார்',
        delete_all_sms: 'சேமிக்கப்பட்ட SMS பரிவர்த்தனைகளை நீக்கு',
        paste_sms: 'SMS ஒட்டுக',

        // Ask Chatbot
        ask_title: 'கேளுங்கள் (AI)',
        what_to_know: 'நீங்கள் என்ன தெரிந்துகொள்ள விரும்புகிறீர்கள்?',
        ask_subtitle: 'உங்கள் குடும்ப நிதி பற்றிய கேள்விகளை ஆங்கிலம் அல்லது தமிழில் கேளுங்கள்.',
        ask_money_hint: 'உங்கள் பணத்தைப் பற்றி கேட்கவும்',
        thinking: 'சிந்திக்கிறது...',

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

        // Language
        language: 'மொழி (Language)',
        language_english: 'English',
        language_tamil: 'தமிழ் (Tamil)',
        switch_language: 'மொழியை மாற்றுக',
        // Extra UI Labels
        scope_me: 'நான்',
        scope_family: 'குடும்பம்',
        see_all: 'அனைத்தும்',
        view_all: 'அனைத்தும்',
        manage: 'நிர்வகி',
        add_goal: 'இலக்கு சேர்க்க',
        load_older: 'பழையவை பார்க்க',
        all_time: 'எல்லா நேரமும்',
        all_categories: 'அனைத்து பிரிவுகள்',
        no_spending: 'செலவு இல்லை',
        a_quiet_month: 'அமைதியான மாதம்',
        biggest_categories: 'அதிகபட்ச பிரிவுகள்',
        who_spent: 'யார் செலவழித்தது',
        where_your_money_went: 'உங்கள் செலவு விவரம்',
        where_money_went: 'குடும்ப செலவு விவரம்',
        tap_bar_transactions: 'பரிவர்த்தனைகளைக் காண தட்டவும்',
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
