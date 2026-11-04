import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
    AlertTriangle,
    ArrowDownLeft,
    ArrowUpRight,
    Calendar,
    Check,
    CheckCircle2,
    CheckSquare,
    ChevronDown,
    ChevronUp,
    Clock,
    Filter,
    MessageSquare,
    RefreshCw,
    RotateCcw,
    Sparkles,
    Square,
    Trash2,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/Header';
import {
    Chip,
    Empty,
    ErrorBanner,
    Glass,
    IconButton,
    Loading,
    PillButton,
    Reveal,
    Screen,
    Segmented,
    Sheet,
    SuccessBanner,
    T,
} from '@/components/ui';
import { colors, fonts, radius, shadow, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { api } from '@/lib/api';
import { categoriesFor, getCategory } from '@/lib/categories';
import { CURRENCY } from '@/lib/config';
import { confirmAction } from '@/lib/dialog';
import { money, timeAgo } from '@/lib/format';
import { ParsedSms } from '@/lib/sms';
import { scanSmsInbox } from '@/lib/smsReader';
import { aiExtractBulkSms, getAiConfig, isAiApiConfigured, subscribeAiConfig, type AiSmsConfig } from '@/lib/aiSmsParser';
import type { CustomCategory, Tx } from '@/lib/types';

export type SmsPeriodFilter = 'today' | 'week' | 'month' | 'all';

interface ImportItem extends ParsedSms {
    id: string;
    selected: boolean;
    isDuplicate: boolean;
    expanded: boolean;
}

const PERIODS: { value: SmsPeriodFilter; label: string; hint: string }[] = [
    { value: 'today', label: 'Today', hint: 'Messages from today' },
    { value: 'week', label: 'Past Week', hint: 'Last 7 days' },
    { value: 'month', label: 'Past Month', hint: 'Last 30 days' },
    { value: 'all', label: 'All Recent', hint: 'All detected alerts' },
];

export default function SmsImport() {
    const familyId = useFamilyId();
    const insets = useSafeAreaInsets();

    const [period, setPeriod] = useState<SmsPeriodFilter>('week');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [undoing, setUndoing] = useState(false);
    const [deletingAll, setDeletingAll] = useState(false);
    const [items, setItems] = useState<ImportItem[]>([]);
    const [lastImportBatch, setLastImportBatch] = useState<{ ids: string[]; items: ImportItem[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
    const [categorySheetItem, setCategorySheetItem] = useState<ImportItem | null>(null);
    const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
    const [isNativeScanner, setIsNativeScanner] = useState(true);
    const [aiConfig, setAiConfig] = useState<AiSmsConfig>(getAiConfig());
    const [aiConfigured, setAiConfigured] = useState(isAiApiConfigured());

    useEffect(() => {
        return subscribeAiConfig((cfg) => {
            setAiConfig(cfg);
            setAiConfigured(isAiApiConfigured());
        });
    }, []);

    const getSinceTimestamp = (p: SmsPeriodFilter): number | undefined => {
        const now = new Date();
        if (p === 'today') {
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        }
        if (p === 'week') {
            return Date.now() - 7 * 24 * 60 * 60 * 1000;
        }
        if (p === 'month') {
            return Date.now() - 30 * 24 * 60 * 60 * 1000;
        }
        return undefined; // All recent
    };

    const loadAndScan = async (useDemoFallback = false, targetPeriod: SmsPeriodFilter = period) => {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const [familyData, existingTxs] = await Promise.all([
                api.family(familyId).catch(() => null),
                api.transactions(familyId, { limit: 500 }).catch(() => [] as Tx[]),
            ]);

            if (familyData?.customCategories) {
                setCustomCategories(familyData.customCategories);
            }

            const existingDedupeKeys = new Set(
                (existingTxs || []).map((t) => (t as any).dedupeKey).filter(Boolean)
            );

            const since = getSinceTimestamp(targetPeriod);
            const scanResult = await scanSmsInbox({
                limit: 400,
                since,
                useSampleIfUnavailable: useDemoFallback || Platform.OS !== 'android',
            });

            setIsNativeScanner(scanResult.isNative);

            if (scanResult.error && !useDemoFallback && Platform.OS === 'android') {
                setError(scanResult.error);
                setItems([]);
                return;
            }

            const rawMessages = scanResult.transactions.map((tx, idx) => ({
                _id: `raw-${idx}`,
                body: tx.rawBody || '',
                date: tx.date ? new Date(tx.date).getTime() : undefined,
            }));
            const { parsed: aiEnhanced } = await aiExtractBulkSms(rawMessages);
            const enhancedMap = new Map(aiEnhanced.map((e) => [e.dedupeKey, e]));

            const mapped: ImportItem[] = scanResult.transactions.map((tx, idx) => {
                const isDuplicate = existingDedupeKeys.has(tx.dedupeKey);
                const enhanced = enhancedMap.get(tx.dedupeKey);
                return {
                    ...tx,
                    category: enhanced?.category || tx.category,
                    merchant: enhanced?.merchant || tx.merchant,
                    countForNextMonth: enhanced?.countForNextMonth ?? tx.countForNextMonth,
                    id: `import-${idx}-${tx.dedupeKey}`,
                    selected: !isDuplicate,
                    isDuplicate,
                    expanded: false,
                };
            });

            setItems(mapped);

            if (mapped.length === 0) {
                const periodLabel = PERIODS.find((p) => p.value === targetPeriod)?.label.toLowerCase() || 'selected period';
                setError(`No bank or UPI transaction messages found for ${periodLabel}.`);
            }
        } catch (e) {
            setError((e as Error).message || 'Failed to scan SMS inbox.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAndScan(false, period);
    }, [familyId]);

    const changePeriod = (next: SmsPeriodFilter) => {
        if (next === period || loading) return;
        Haptics.selectionAsync().catch(() => {});
        setPeriod(next);
        loadAndScan(false, next);
    };

    const filteredItems = useMemo(() => {
        if (typeFilter === 'all') return items;
        return items.filter((it) => it.type === typeFilter);
    }, [items, typeFilter]);

    const selectedCount = items.filter((it) => it.selected).length;
    const allSelected = items.length > 0 && items.every((it) => it.selected);
    const duplicateCount = items.filter((it) => it.isDuplicate).length;

    const selectedExpenseSum = items
        .filter((it) => it.selected && it.type === 'expense')
        .reduce((sum, it) => sum + it.amount, 0);

    const selectedIncomeSum = items
        .filter((it) => it.selected && it.type === 'income')
        .reduce((sum, it) => sum + it.amount, 0);

    const toggleCountForNextMonth = (id: string) => {
        Haptics.selectionAsync().catch(() => {});
        setItems((prev) =>
            prev.map((it) => (it.id === id ? { ...it, countForNextMonth: !it.countForNextMonth } : it))
        );
    };

    const runAiCategorization = async () => {
        if (!isAiApiConfigured()) {
            setError('AI is not configured. Please check your environment variables.');
            return;
        }
        if (items.length === 0 || aiAnalyzing) return;
        setAiAnalyzing(true);
        setError(null);
        try {
            const rawMessages = items.map((it) => ({
                _id: it.id,
                body: it.rawBody || `${it.merchant || ''} ${it.category} ${it.amount}`,
                date: it.date ? new Date(it.date).getTime() : undefined,
            }));
            const { parsed: aiResults, usedAi, aiError } = await aiExtractBulkSms(rawMessages);
            if (aiError) {
                setError(`AI API Notice: ${aiError} (categorized using smart local parser)`);
            }
            const resultMap = new Map(aiResults.map((r) => [r.dedupeKey, r]));

            let updatedCount = 0;
            let salaryDetected = 0;
            setItems((prev) =>
                prev.map((it) => {
                    const found = resultMap.get(it.dedupeKey);
                    if (found) {
                        updatedCount++;
                        if (found.countForNextMonth) salaryDetected++;
                        return {
                            ...it,
                            category: found.category,
                            merchant: found.merchant || it.merchant,
                            paymentMethod: found.paymentMethod || it.paymentMethod,
                            countForNextMonth: Boolean(found.countForNextMonth),
                        };
                    }
                    return it;
                })
            );

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setSuccess(
                usedAi
                    ? `AI (${aiConfig.provider.toUpperCase()}) categorized ${updatedCount} transactions!`
                    : `Categorized ${updatedCount} transactions using smart local parser!`
            );
            setTimeout(() => setSuccess(null), 4000);
        } catch (err) {
            setError((err as Error).message || 'AI categorization completed with local heuristics.');
        } finally {
            setAiAnalyzing(false);
        }
    };

    const toggleSelect = (id: string) => {
        Haptics.selectionAsync().catch(() => {});
        setItems((prev) =>
            prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it))
        );
    };

    const toggleSelectAll = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        const nextState = !allSelected;
        setItems((prev) => prev.map((it) => ({ ...it, selected: nextState })));
    };

    const selectOnlyNew = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setItems((prev) => prev.map((it) => ({ ...it, selected: !it.isDuplicate })));
    };

    const toggleExpand = (id: string) => {
        setItems((prev) =>
            prev.map((it) => (it.id === id ? { ...it, expanded: !it.expanded } : it))
        );
    };

    const updateCategory = (newCat: string) => {
        if (!categorySheetItem) return;
        setItems((prev) =>
            prev.map((it) => (it.id === categorySheetItem.id ? { ...it, category: newCat } : it))
        );
        setCategorySheetItem(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    };

    const handleSave = async () => {
        const toSave = items.filter((it) => it.selected);
        if (toSave.length === 0) return;

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const payload = toSave.map((it) => ({
                amount: it.amount,
                type: it.type,
                category: it.category,
                description: it.merchant || (it.type === 'income' ? 'Received via SMS' : 'Spent via SMS'),
                paymentMethod: it.paymentMethod,
                date: it.date || new Date().toISOString(),
                source: 'sms' as const,
                dedupeKey: it.dedupeKey,
                countForNextMonth: Boolean(it.countForNextMonth),
            }));

            const res = await api.addTransactionsBatch(familyId, payload);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setSuccess(`Saved ${res.added} transaction${res.added === 1 ? '' : 's'}!`);

            // Store for immediate undo
            setLastImportBatch({ ids: res.ids, items: toSave });
            setItems((prev) => prev.filter((it) => !it.selected));
        } catch (e) {
            setError((e as Error).message || 'Failed to save transactions.');
        } finally {
            setSaving(false);
        }
    };

    const handleUndo = async () => {
        if (!lastImportBatch || lastImportBatch.ids.length === 0) return;

        setUndoing(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await api.deleteTransactionsBatch(familyId, lastImportBatch.ids);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setSuccess(res.message || 'Import undone! Transactions removed.');

            // Put the items back onto the screen
            setItems((prev) => [...lastImportBatch.items, ...prev]);
            setLastImportBatch(null);
        } catch (e) {
            setError((e as Error).message || 'Failed to undo import.');
        } finally {
            setUndoing(false);
        }
    };

    const handleDeleteAllSms = async () => {
        const confirmed = await confirmAction(
            'Delete all SMS transactions?',
            'This will permanently remove all transactions in this family that were imported from SMS messages and adjust your family balance.',
            'Delete All',
            true
        );
        if (!confirmed) return;

        setDeletingAll(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await api.deleteAllSmsTransactions(familyId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setSuccess(res.message || `Deleted ${res.deleted} SMS transactions.`);
            setLastImportBatch(null);
            await loadAndScan(false, period);
        } catch (e) {
            setError((e as Error).message || 'Failed to delete SMS transactions.');
        } finally {
            setDeletingAll(false);
        }
    };

    const formatSmsDate = (isoDate?: string) => {
        if (!isoDate) return 'Recent';
        const d = new Date(isoDate);
        if (isNaN(d.getTime())) return 'Recent';

        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = d.toDateString() === yesterday.toDateString();

        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (isToday) return `Today, ${timeStr}`;
        if (isYesterday) return `Yesterday, ${timeStr}`;
        return `${d.getDate()} ${d.toLocaleString([], { month: 'short' })}, ${timeStr}`;
    };

    return (
        <Screen scroll={false}>
            <Header
                close
                title="Extract from SMS"
                right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <IconButton
                            Icon={Sparkles}
                            label="AI Categorize"
                            tone={aiConfigured ? "ink" : "glass"}
                            onPress={runAiCategorization}
                            disabled={loading || saving || deletingAll || aiAnalyzing}
                        />
                        <IconButton
                            Icon={Trash2}
                            label="Delete all SMS transactions"
                            tone="glass"
                            onPress={handleDeleteAllSms}
                            disabled={loading || saving || deletingAll || aiAnalyzing}
                        />
                        <IconButton
                            Icon={RefreshCw}
                            label="Rescan SMS"
                            onPress={() => loadAndScan(false, period)}
                            disabled={loading || saving || deletingAll || aiAnalyzing}
                        />
                    </View>
                }
            />

            {/* Time Period Filter Bar */}
            <View style={styles.periodBarContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.periodBarScroll}
                >
                    {PERIODS.map((p) => {
                        const active = period === p.value;
                        return (
                            <Pressable
                                key={p.value}
                                accessibilityRole="button"
                                accessibilityLabel={`Filter by ${p.label}`}
                                onPress={() => changePeriod(p.value)}
                                style={({ pressed }) => [
                                    styles.periodPill,
                                    active ? styles.periodPillActive : styles.periodPillInactive,
                                    pressed && { opacity: 0.8 },
                                ]}
                            >
                                <T
                                    variant="small"
                                    style={[
                                        styles.periodPillText,
                                        active ? styles.periodPillTextActive : styles.periodPillTextInactive,
                                    ]}
                                >
                                    {p.label}
                                </T>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>

            

            <View style={{ flex: 1 }}>
                {/* Undo Notification Banner */}
                {lastImportBatch && (
                    <Glass strong style={styles.undoCard}>
                        <View style={{ flex: 1 }}>
                            <T variant="heading" style={{ fontSize: 14 }}>
                                Imported {lastImportBatch.ids.length} transaction{lastImportBatch.ids.length === 1 ? '' : 's'}
                            </T>
                            <T variant="tiny" color={colors.inkSoft}>
                                Added to family records
                            </T>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Undo last import"
                            onPress={handleUndo}
                            disabled={undoing}
                            style={styles.undoButton}
                        >
                            <RotateCcw size={14} color={colors.ink} />
                            <T variant="small" style={{ fontFamily: fonts.bold, color: colors.ink }}>
                                {undoing ? 'Undoing...' : 'Undo'}
                            </T>
                        </Pressable>
                    </Glass>
                )}

                <SuccessBanner message={success} />
                <ErrorBanner message={error} onRetry={() => loadAndScan(false, period)} />

                {/* Loading state */}
                {loading && (
                    <View style={styles.loadingContainer}>
                        <Loading />
                        <T variant="heading" style={{ fontSize: 18, marginTop: space.sm }}>Scanning Messages...</T>
                        <T variant="small" color={colors.muted}>
                            Loading bank & UPI alerts for {PERIODS.find((p) => p.value === period)?.label.toLowerCase()}
                        </T>
                    </View>
                )}

                {/* Content when loaded */}
                {!loading && items.length > 0 && (
                    <>
                        {/* Upgraded Hero Summary Glass Card */}
                        <Glass strong style={styles.heroCard}>
                            <View style={styles.heroTopRow}>
                                <View style={styles.pillBadge}>
                                    <Sparkles size={13} color={colors.ink} />
                                    <T variant="tiny" style={{ fontFamily: fonts.bold, color: colors.ink }}>
                                        {items.length} ALERTS FOUND
                                    </T>
                                </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    {duplicateCount > 0 && (
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="Select new transactions only"
                                            onPress={selectOnlyNew}
                                            hitSlop={6}
                                        >
                                            <T variant="tiny" color={colors.muted} style={{ fontFamily: fonts.bold }}>
                                                Select new
                                            </T>
                                        </Pressable>
                                    )}

                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={allSelected ? 'Unselect all' : 'Select all'}
                                        onPress={toggleSelectAll}
                                        style={styles.selectToggle}
                                    >
                                        {allSelected ? (
                                            <>
                                                <Square size={13} color={colors.muted} />
                                                <T variant="small" color={colors.muted} style={{ fontFamily: fonts.bold }}>
                                                    Unselect all
                                                </T>
                                            </>
                                        ) : (
                                            <>
                                                <CheckSquare size={13} color={colors.ink} />
                                                <T variant="small" style={{ fontFamily: fonts.bold }}>
                                                    Select all
                                                </T>
                                            </>
                                        )}
                                    </Pressable>
                                </View>
                            </View>

                            {/* Hero Amounts Overview */}
                            <View style={styles.amountsRow}>
                                <View style={{ flex: 1 }}>
                                    <T variant="tiny" color={colors.muted} style={{ letterSpacing: 0.5 }}>
                                        READY TO IMPORT
                                    </T>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                                        <T variant="title" style={{ fontSize: 26 }}>
                                            {selectedCount}
                                        </T>
                                        <T variant="small" color={colors.muted}>
                                            of {items.length} selected
                                        </T>
                                    </View>
                                </View>

                                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                    {selectedIncomeSum > 0 && (
                                        <View style={styles.amountBadgeIncome}>
                                            <ArrowUpRight size={12} color={colors.income} strokeWidth={2.5} />
                                            <T variant="small" color={colors.income} style={{ fontFamily: fonts.extrabold }}>
                                                +{money(selectedIncomeSum)}
                                            </T>
                                        </View>
                                    )}
                                    {selectedExpenseSum > 0 && (
                                        <View style={styles.amountBadgeExpense}>
                                            <ArrowDownLeft size={12} color={colors.expense} strokeWidth={2.5} />
                                            <T variant="small" color={colors.expense} style={{ fontFamily: fonts.extrabold }}>
                                                -{money(selectedExpenseSum)}
                                            </T>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* Type filter */}
                            <View style={{ marginTop: space.sm }}>
                                <Segmented
                                    value={typeFilter}
                                    onChange={setTypeFilter}
                                    options={[
                                        { value: 'all', label: `All (${items.length})` },
                                        { value: 'income', label: `Received (${items.filter((i) => i.type === 'income').length})` },
                                        { value: 'expense', label: `Spent (${items.filter((i) => i.type === 'expense').length})` },
                                    ]}
                                />
                            </View>
                        </Glass>

                        {/* List of clean, modern transaction cards */}
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingBottom: insets.bottom + 90, gap: space.sm, paddingTop: 4 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {filteredItems.map((item, idx) => {
                                const cat = getCategory(item.category, customCategories);
                                const isIncome = item.type === 'income';

                                return (
                                    <Reveal key={item.id} index={idx}>
                                        <Pressable
                                            accessibilityRole="checkbox"
                                            accessibilityState={{ checked: item.selected }}
                                            onPress={() => toggleSelect(item.id)}
                                            style={({ pressed }) => [
                                                styles.cardWrapper,
                                                item.selected ? styles.cardSelected : styles.cardUnselected,
                                                item.isDuplicate && { opacity: 0.75 },
                                                pressed && { opacity: 0.9 },
                                            ]}
                                        >
                                            <Glass
                                                strong
                                                style={[
                                                    styles.cardInner,
                                                    item.selected && { backgroundColor: 'rgba(255, 255, 255, 0.96)' },
                                                ]}
                                            >
                                                {/* Top row: Checkbox, Icon, Merchant & Subtitle, Amount */}
                                                <View style={styles.cardHeaderRow}>
                                                    {/* Round checkbox */}
                                                    <View
                                                        style={[
                                                            styles.roundCheckbox,
                                                            item.selected
                                                                ? { backgroundColor: colors.ink, borderColor: colors.ink }
                                                                : { borderColor: colors.hairline, backgroundColor: 'transparent' },
                                                        ]}
                                                    >
                                                        {item.selected && <Check size={13} color={colors.white} strokeWidth={3} />}
                                                    </View>

                                                    {/* Category avatar */}
                                                    <View style={[styles.categoryAvatar, { backgroundColor: `${cat.tint}22` }]}>
                                                        <cat.Icon size={19} color={cat.tint} strokeWidth={2.2} />
                                                    </View>

                                                    {/* Merchant title & details */}
                                                    <View style={styles.cardMiddle}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                            <T variant="heading" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16 }}>
                                                                {item.merchant || (isIncome ? 'Received' : 'Paid')}
                                                            </T>
                                                            {item.countForNextMonth ? (
                                                                <View style={{ backgroundColor: 'rgba(31, 143, 70, 0.12)', paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: radius.pill }}>
                                                                    <T variant="tiny" color={colors.income} style={{ fontFamily: fonts.bold, fontSize: 10 }}>
                                                                        Next Month
                                                                    </T>
                                                                </View>
                                                            ) : null}
                                                            {item.isDuplicate && (
                                                                <View style={styles.duplicateTag}>
                                                                    <T variant="tiny" style={{ color: '#A16207', fontFamily: fonts.bold, fontSize: 10 }}>
                                                                        Already Added
                                                                    </T>
                                                                </View>
                                                            )}
                                                        </View>

                                                        <T variant="tiny" color={colors.muted} numberOfLines={1} style={{ marginTop: 2 }}>
                                                            {formatSmsDate(item.date)} · {item.paymentMethod}
                                                        </T>
                                                    </View>

                                                    {/* Crisp Amount */}
                                                    <T
                                                        variant="heading"
                                                        style={{
                                                            fontSize: 17,
                                                            color: isIncome ? colors.income : colors.expense,
                                                        }}
                                                    >
                                                        {isIncome ? '+' : '-'}{money(item.amount)}
                                                    </T>
                                                </View>

                                                {/* Next Month Toggle for Salary or Income */}
                                                {(item.category === 'Salary' || isIncome) && (
                                                    <View style={styles.nextMonthRow}>
                                                        <View style={{ flex: 1, paddingRight: space.sm }}>
                                                            <T variant="tiny" style={{ fontFamily: fonts.bold, color: item.countForNextMonth ? colors.income : colors.ink }}>
                                                                {item.countForNextMonth ? 'Counting as Next Month' : 'Count as next month'}
                                                            </T>
                                                            <T variant="tiny" color={colors.muted} style={{ fontSize: 10 }}>
                                                                Include in next month's received while keeping original date
                                                            </T>
                                                        </View>
                                                        <Switch
                                                            value={Boolean(item.countForNextMonth)}
                                                            onValueChange={() => toggleCountForNextMonth(item.id)}
                                                            trackColor={{ false: colors.mint2, true: colors.ink }}
                                                            thumbColor={Platform.OS === 'android' ? colors.white : undefined}
                                                        />
                                                    </View>
                                                )}

                                                {/* Footer: Category selector pill & SMS expand button */}
                                                <View style={styles.cardFooterRow}>
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`Change category, currently ${item.category}`}
                                                        onPress={(e) => {
                                                             e.stopPropagation();
                                                             setCategorySheetItem(item);
                                                        }}
                                                        style={styles.categoryPill}
                                                    >
                                                        <View style={[styles.dot, { backgroundColor: cat.tint }]} />
                                                        <T variant="tiny" style={{ color: colors.ink, fontFamily: fonts.bold }}>
                                                            {item.category}
                                                        </T>
                                                        <ChevronDown size={11} color={colors.muted} />
                                                    </Pressable>

                                                    <Pressable
                                                        accessibilityRole="button"
                                                        accessibilityLabel="Show original SMS message"
                                                        onPress={(e) => {
                                                            e.stopPropagation();
                                                            toggleExpand(item.id);
                                                        }}
                                                        style={styles.viewSmsButton}
                                                    >
                                                        <T variant="tiny" color={colors.muted}>
                                                            {item.expanded ? 'Hide SMS' : 'View SMS'}
                                                        </T>
                                                        {item.expanded ? (
                                                            <ChevronUp size={11} color={colors.muted} />
                                                        ) : (
                                                            <ChevronDown size={11} color={colors.muted} />
                                                        )}
                                                    </Pressable>
                                                </View>

                                                {/* Expanded original SMS snippet */}
                                                {item.expanded && item.rawBody && (
                                                    <View style={styles.smsQuoteBox}>
                                                        <T variant="tiny" color={colors.inkSoft} style={{ fontStyle: 'italic', lineHeight: 17 }}>
                                                            "{item.rawBody}"
                                                        </T>
                                                    </View>
                                                )}
                                            </Glass>
                                        </Pressable>
                                    </Reveal>
                                );
                            })}

                            {/* Option to clear all previously imported SMS transactions */}
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Delete all stored SMS transactions"
                                onPress={handleDeleteAllSms}
                                style={styles.deleteAllCard}
                            >
                                <Trash2 size={16} color={colors.expense} />
                                <T variant="small" style={{ color: colors.expense, fontFamily: fonts.bold }}>
                                    Delete all stored SMS transactions
                                </T>
                            </Pressable>
                        </ScrollView>
                    </>
                )}

                {/* Empty State */}
                {!loading && items.length === 0 && (
                    <View style={styles.emptyContainer}>
                        <Empty
                            Icon={MessageSquare}
                            title="No transaction messages"
                            hint={
                                !isNativeScanner
                                    ? 'Native SMS scanning is active on Android APK builds. You can load realistic sample bank alerts to preview.'
                                    : `No bank or UPI alerts found for ${PERIODS.find((p) => p.value === period)?.label.toLowerCase()}. Try selecting a wider period.`
                            }
                        />
                        <View style={{ gap: space.sm, marginTop: space.lg, width: '100%', maxWidth: 320 }}>
                            {!isNativeScanner && (
                                <PillButton
                                    label="Load Sample Bank Alerts"
                                    Icon={Sparkles}
                                    onPress={() => loadAndScan(true, period)}
                                />
                            )}
                            <PillButton
                                label="Delete All Stored SMS Transactions"
                                variant="glass"
                                Icon={Trash2}
                                onPress={handleDeleteAllSms}
                                loading={deletingAll}
                            />
                        </View>
                    </View>
                )}

                {/* Floating Bottom Action Bar */}
                {!loading && items.length > 0 && (
                    <View
                        style={[
                            styles.floatingBar,
                            { bottom: Math.max(insets.bottom, 12) + 8 },
                        ]}
                    >
                        <PillButton
                            label={
                                selectedCount === 0
                                    ? 'Select transactions to import'
                                    : `Import ${selectedCount} transaction${selectedCount === 1 ? '' : 's'} (${money(selectedExpenseSum + selectedIncomeSum)})`
                            }
                            Icon={Sparkles}
                            onPress={handleSave}
                            disabled={selectedCount === 0 || saving}
                            loading={saving}
                            style={{ minHeight: 52, ...shadow.card }}
                        />
                    </View>
                )}
            </View>

            {/* Category selection bottom sheet */}
            <Sheet
                visible={!!categorySheetItem}
                onClose={() => setCategorySheetItem(null)}
                title="Choose Category"
            >
                <View style={{ gap: space.md }}>
                    <T variant="small" color={colors.muted}>
                        Pick a category for "{categorySheetItem?.merchant || 'this transaction'}"
                    </T>
                    <View style={styles.categoryGrid}>
                        {categoriesFor(categorySheetItem?.type || 'expense', customCategories).map((c) => (
                            <Chip
                                key={c.name}
                                label={c.name}
                                Icon={c.Icon}
                                active={categorySheetItem?.category === c.name}
                                onPress={() => updateCategory(c.name)}
                            />
                        ))}
                    </View>
                </View>
            </Sheet>
        </Screen>
    );
}

const styles = StyleSheet.create({
    periodBarContainer: {
        marginBottom: space.sm,
    },
    aiStatusBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: space.lg,
        marginTop: space.xs,
        marginBottom: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: 8,
        borderRadius: radius.md,
    },
    aiStatusBarActive: {
        backgroundColor: 'rgba(43, 138, 95, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(43, 138, 95, 0.2)',
    },
    aiStatusBarInactive: {
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.06)',
    },
    periodBarScroll: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: space.sm,
        paddingVertical: 2,
    },
    periodPill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    periodPillActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    periodPillInactive: {
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
        borderColor: colors.hairline,
    },
    periodPillText: {
        fontFamily: fonts.bold,
        fontSize: 13,
    },
    periodPillTextActive: {
        color: colors.white,
    },
    periodPillTextInactive: {
        color: colors.inkSoft,
    },
    undoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: space.md,
        marginBottom: space.sm,
        borderRadius: radius.md,
        backgroundColor: `${colors.mint2}99`,
        borderWidth: 1,
        borderColor: colors.mint1,
    },
    undoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.hairline,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xl,
    },
    heroCard: {
        marginBottom: space.md,
        padding: space.lg,
        gap: space.md,
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    pillBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: `${colors.mint2}80`,
    },
    selectToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    amountsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    amountBadgeExpense: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.sm,
    },
    amountBadgeIncome: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.sm,
    },
    cardWrapper: {
        borderRadius: radius.lg,
        overflow: 'hidden',
    },
    cardSelected: {
        borderWidth: 1.5,
        borderColor: colors.ink,
    },
    cardUnselected: {
        borderWidth: 1,
        borderColor: colors.hairline,
    },
    cardInner: {
        padding: space.md,
        gap: space.sm,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
    },
    roundCheckbox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardMiddle: {
        flex: 1,
        justifyContent: 'center',
    },
    duplicateTag: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: '#FEF08A',
    },
    cardFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 36,
        paddingTop: 2,
    },
    categoryPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.mint0,
        borderWidth: 1,
        borderColor: colors.hairline,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    viewSmsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    nextMonthRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: colors.glassLine,
    },
    smsQuoteBox: {
        marginTop: space.xs,
        marginLeft: 36,
        padding: space.sm,
        borderRadius: radius.sm,
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
        borderLeftWidth: 2,
        borderLeftColor: colors.hairline,
    },
    deleteAllCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(239, 68, 68, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
        marginTop: space.md,
    },
    floatingBar: {
        position: 'absolute',
        left: space.lg,
        right: space.lg,
    },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingVertical: space.sm,
    },
});
