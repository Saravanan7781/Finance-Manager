import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
    ArrowDownLeft,
    ArrowUpRight,
    Check,
    CheckSquare,
    ChevronDown,
    ChevronUp,
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

interface ImportItem extends ParsedSms {
    id: string;
    selected: boolean;
    isDuplicate: boolean;
    expanded: boolean;
}

export default function SmsImport() {
    const familyId = useFamilyId();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [items, setItems] = useState<ImportItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
    const [categorySheetItem, setCategorySheetItem] = useState<ImportItem | null>(null);
    const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
    const [isNativeScanner, setIsNativeScanner] = useState(true);

    const loadAndScan = async (useDemoFallback = false) => {
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

            const scanResult = await scanSmsInbox({
                limit: 300,
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
                setError('No bank or UPI transaction messages found in your recent SMS.');
            }
        } catch (e) {
            setError((e as Error).message || 'Failed to scan SMS inbox.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAndScan();
    }, [familyId]);

    const filteredItems = useMemo(() => {
        if (typeFilter === 'all') return items;
        return items.filter((it) => it.type === typeFilter);
    }, [items, typeFilter]);

    const selectedCount = items.filter((it) => it.selected).length;
    const allSelected = items.length > 0 && items.every((it) => it.selected);

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

    return (
        <Screen scroll={false}>
            <Header
                close
                title="Extract from SMS"
                right={
                    <IconButton
                        Icon={RefreshCw}
                        label="Rescan SMS"
                        onPress={() => loadAndScan(false)}
                        disabled={loading || saving}
                    />
                }
            />

            <View style={{ flex: 1 }}>
                <SuccessBanner message={success} />
                <ErrorBanner message={error} onRetry={() => loadAndScan(false)} />

                {/* Loading state */}
                {loading && (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md }}>
                        <Loading />
                        <T variant="heading" style={{ fontSize: 17, marginTop: 8 }}>Scanning Messages...</T>
                        <T variant="small" color={colors.muted}>Analyzing bank alerts & transaction details</T>
                    </View>
                )}

                {/* Content when loaded */}
                {!loading && items.length > 0 && (
                    <>
                        {/* Elegant Hero Summary Card */}
                        <Glass strong style={styles.heroCard}>
                            <View style={styles.heroTopRow}>
                                <View style={styles.pillBadge}>
                                    <Sparkles size={13} color={colors.ink} />
                                    <T variant="tiny" style={{ fontFamily: fonts.bold, color: colors.ink }}>
                                        {items.length} ALERTS FOUND
                                    </T>
                                </View>

                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={allSelected ? 'Unselect all transactions' : 'Select all transactions'}
                                    onPress={toggleSelectAll}
                                    style={({ pressed }) => [
                                        styles.selectToggle,
                                        { opacity: pressed ? 0.75 : 1 },
                                    ]}
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

                            {/* Hero Amounts */}
                            <View style={styles.amountsRow}>
                                <View style={{ flex: 1 }}>
                                    <T variant="tiny" color={colors.muted} style={{ letterSpacing: 0.5 }}>
                                        SELECTED TO IMPORT
                                    </T>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                                        <T variant="title" style={{ fontSize: 26 }}>
                                            {selectedCount}
                                        </T>
                                        <T variant="small" color={colors.muted}>
                                            of {items.length} items
                                        </T>
                                    </View>
                                </View>

                                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                    {selectedExpenseSum > 0 && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <ArrowDownLeft size={13} color={colors.expense} />
                                            <T variant="body" color={colors.expense} style={{ fontFamily: fonts.extrabold }}>
                                                -{money(selectedExpenseSum)}
                                            </T>
                                        </View>
                                    )}
                                    {selectedIncomeSum > 0 && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <ArrowUpRight size={13} color={colors.income} />
                                            <T variant="body" color={colors.income} style={{ fontFamily: fonts.extrabold }}>
                                                +{money(selectedIncomeSum)}
                                            </T>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* Type filter */}
                            <View style={{ marginTop: space.xs }}>
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

                        {/* List of clean cards */}
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingBottom: insets.bottom + 90, gap: space.sm }}
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
                                                item.isDuplicate && { opacity: 0.65 },
                                                pressed && { opacity: 0.88 },
                                            ]}
                                        >
                                            <Glass
                                                strong
                                                style={[
                                                    styles.cardInner,
                                                    item.selected && { backgroundColor: 'rgba(255, 255, 255, 0.95)' },
                                                ]}
                                            >
                                                {/* Top row: Checkbox, Category Icon, Title, Subtitle, Amount */}
                                                <View style={styles.cardHeaderRow}>
                                                    {/* Round checkbox */}
                                                    <View
                                                        style={[
                                                            styles.roundCheckbox,
                                                            item.selected
                                                            ? { backgroundColor: colors.ink, borderColor: colors.ink }
                                                            : { borderColor: colors.faint, backgroundColor: 'transparent' },
                                                        ]}
                                                    >
                                                        {item.selected && <Check size={13} color={colors.white} strokeWidth={3} />}
                                                    </View>

                                                    {/* Category avatar */}
                                                    <View style={[styles.categoryAvatar, { backgroundColor: `${cat.tint}20` }]}>
                                                        <cat.Icon size={19} color={cat.tint} strokeWidth={2.2} />
                                                    </View>

                                                    {/* Merchant title & details */}
                                                    <View style={styles.cardMiddle}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <T variant="heading" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16 }}>
                                                                {item.merchant || (isIncome ? 'Received' : 'Spent')}
                                                            </T>
                                                            {item.isDuplicate && (
                                                                <View style={styles.duplicateTag}>
                                                                    <T variant="tiny" color={colors.muted}>Already added</T>
                                                                </View>
                                                            )}
                                                        </View>

                                                        <T variant="small" color={colors.muted} numberOfLines={1}>
                                                            {isIncome ? 'Received' : 'Paid'} · {item.paymentMethod}
                                                            {item.date ? ` · ${timeAgo(item.date)}` : ''}
                                                        </T>
                                                    </View>

                                                    {/* Clean Amount */}
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

                                                {/* Footer: Category button & SMS preview link */}
                                                <View style={styles.cardFooterRow}>
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`Change category for ${item.merchant || 'item'}, current is ${item.category}`}
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
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
                        <Empty
                            Icon={MessageSquare}
                            title="No transaction messages"
                            hint={
                                !isNativeScanner
                                    ? 'Native SMS scanning is available when running the Android APK build. You can try with sample bank alerts to preview.'
                                    : 'We scanned your messages but could not find any unrecorded bank or UPI alerts.'
                            }
                        />
                        {!isNativeScanner && (
                            <PillButton
                                label="Load Sample Bank Alerts"
                                Icon={Sparkles}
                                onPress={() => loadAndScan(true)}
                                style={{ marginTop: space.lg }}
                            />
                        )}
                    </View>
                )}

                {/* Floating Bottom Action Pill */}
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
                                    ? 'Select transactions to save'
                                    : `Save ${selectedCount} transaction${selectedCount === 1 ? '' : 's'} (${money(selectedExpenseSum + selectedIncomeSum)})`
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

            {/* Category selection sheet */}
            <Sheet
                visible={!!categorySheetItem}
                onClose={() => setCategorySheetItem(null)}
                title={`Category · ${categorySheetItem?.merchant || 'Transaction'}`}
            >
                <View style={{ gap: space.md }}>
                    <T variant="small" color={colors.inkSoft}>
                        Pick a category for this transaction:
                    </T>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {categorySheetItem &&
                            categoriesFor(categorySheetItem.type, customCategories).map((c) => (
                                <Chip
                                    key={c.name}
                                    label={c.name}
                                    Icon={c.Icon}
                                    active={categorySheetItem.category === c.name}
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
    heroCard: {
        padding: space.md + 2,
        borderRadius: radius.xl,
        marginBottom: space.sm + 4,
        gap: space.sm + 2,
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
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.mint1,
    },
    selectToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.white,
    },
    amountsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    cardWrapper: {
        borderRadius: radius.lg,
        ...shadow.card,
        shadowOpacity: 0.06,
        shadowRadius: 10,
    },
    cardSelected: {
        borderWidth: 1.5,
        borderColor: colors.mint2,
    },
    cardUnselected: {
        borderWidth: 1,
        borderColor: colors.hairline,
        opacity: 0.85,
    },
    cardInner: {
        borderRadius: radius.lg,
        padding: space.md,
        gap: space.xs + 2,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm + 2,
    },
    roundCheckbox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardMiddle: {
        flex: 1,
        gap: 2,
    },
    duplicateTag: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: radius.sm,
        backgroundColor: 'rgba(0,0,0,0.06)',
    },
    cardFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: space.xs,
        paddingLeft: 30, // Aligns nicely with the text
    },
    categoryPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    viewSmsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 4,
    },
    smsQuoteBox: {
        marginTop: space.xs,
        marginLeft: 30,
        padding: space.sm,
        borderRadius: radius.md,
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
        borderLeftWidth: 2,
        borderLeftColor: colors.mint2,
    },
    floatingBar: {
        position: 'absolute',
        left: space.md,
        right: space.md,
    },
});
