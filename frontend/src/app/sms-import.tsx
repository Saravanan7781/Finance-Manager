import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
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
    Sparkles,
    Square,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { money, timeAgo } from '@/lib/format';
import { ParsedSms } from '@/lib/sms';
import { scanSmsInbox } from '@/lib/smsReader';
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
    const [items, setItems] = useState<ImportItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
    const [categorySheetItem, setCategorySheetItem] = useState<ImportItem | null>(null);
    const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
    const [isNativeScanner, setIsNativeScanner] = useState(true);

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

            const mapped: ImportItem[] = scanResult.transactions.map((tx, idx) => {
                const isDuplicate = existingDedupeKeys.has(tx.dedupeKey);
                return {
                    ...tx,
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
            }));

            const res = await api.addTransactionsBatch(familyId, payload);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setSuccess(`Saved ${res.added} transaction${res.added === 1 ? '' : 's'}${res.skipped > 0 ? ` (${res.skipped} duplicate skipped)` : ''}!`);

            setItems((prev) => prev.filter((it) => !it.selected));

            setTimeout(() => {
                router.back();
            }, 1800);
        } catch (e) {
            setError((e as Error).message || 'Failed to save transactions.');
        } finally {
            setSaving(false);
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
                    <IconButton
                        Icon={RefreshCw}
                        label="Rescan SMS"
                        onPress={() => loadAndScan(false, period)}
                        disabled={loading || saving}
                    />
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
                                    {selectedExpenseSum > 0 && (
                                        <View style={styles.amountBadgeExpense}>
                                            <ArrowDownLeft size={12} color={colors.expense} strokeWidth={2.5} />
                                            <T variant="small" color={colors.expense} style={{ fontFamily: fonts.extrabold }}>
                                                -{money(selectedExpenseSum)}
                                            </T>
                                        </View>
                                    )}
                                    {selectedIncomeSum > 0 && (
                                        <View style={styles.amountBadgeIncome}>
                                            <ArrowUpRight size={12} color={colors.income} strokeWidth={2.5} />
                                            <T variant="small" color={colors.income} style={{ fontFamily: fonts.extrabold }}>
                                                +{money(selectedIncomeSum)}
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
                                        { value: 'expense', label: `Spent (${items.filter((i) => i.type === 'expense').length})` },
                                        { value: 'income', label: `Received (${items.filter((i) => i.type === 'income').length})` },
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
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <T variant="heading" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16 }}>
                                                                {item.merchant || (isIncome ? 'Received' : 'Paid')}
                                                            </T>
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
                        {!isNativeScanner && (
                            <PillButton
                                label="Load Sample Bank Alerts"
                                Icon={Sparkles}
                                onPress={() => loadAndScan(true, period)}
                                style={{ marginTop: space.lg }}
                            />
                        )}
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
    smsQuoteBox: {
        marginTop: space.xs,
        marginLeft: 36,
        padding: space.sm,
        borderRadius: radius.sm,
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
        borderLeftWidth: 2,
        borderLeftColor: colors.hairline,
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
