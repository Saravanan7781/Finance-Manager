import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight, ReceiptText, TrendingDown, TrendingUp, User, Users, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BubbleChart } from '@/components/BubbleChart';
import { TxRow, TxRowSkeleton } from '@/components/TxRow';
import { Amount, Chip, Empty, ErrorBanner, IconButton, Progress, Screen, SectionHeader, Skeleton, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { getCategory, normalizeCategory } from '@/lib/categories';
import { money, monthBounds, monthKey, monthLabel, shiftMonth, tzOffset } from '@/lib/format';
import type { SummaryScope, Tx } from '@/lib/types';

export default function Insights() {
    const familyId = useFamilyId();
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [month, setMonth] = useState(monthKey());
    const [scope, setScope] = useState<SummaryScope>('me');
    const isCurrent = month === monthKey();
    const mine = scope === 'me';

    // Category transactions modal state
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [catTxs, setCatTxs] = useState<Tx[]>([]);
    const [loadingCatTxs, setLoadingCatTxs] = useState(false);
    const [catTxsError, setCatTxsError] = useState<string | null>(null);

    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(async () => {
        // Budgets are set for the whole family, so they only make sense next to family spending.
        const [summary, budgets] = await Promise.all([
            api.summary(familyId, month, tzOffset(), scope),
            mine ? Promise.resolve([]) : api.budgets(familyId),
        ]);
        return { summary, budgets };
    }, [familyId, month, scope]);

    const summary = data?.summary;

    // Fetch transactions for selected category in this month
    useEffect(() => {
        if (!selectedCategory || !familyId) {
            setCatTxs([]);
            return;
        }
        let cancelled = false;
        setLoadingCatTxs(true);
        setCatTxsError(null);

        const bounds = monthBounds(month);
        api.transactions(familyId, {
            from: bounds.from,
            to: bounds.to,
            scope: mine ? 'me' : undefined,
            limit: 200,
        })
            .then((list) => {
                if (cancelled) return;
                const filtered = list.filter((t) => {
                    const norm = normalizeCategory(t.category);
                    return norm.toLowerCase() === selectedCategory.toLowerCase();
                });
                setCatTxs(filtered);
            })
            .catch((e) => {
                if (cancelled) return;
                setCatTxsError((e as Error).message);
            })
            .finally(() => {
                if (cancelled) return;
                setLoadingCatTxs(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedCategory, familyId, month, mine]);

    const handleCategoryPress = (catName: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setSelectedCategory(catName);
    };

    // Opens Transactions already narrowed to this month, this category, and "just me" when that is the view.
    const openTransactions = (category?: string) =>
        router.push({ pathname: '/activity', params: { at: String(Date.now()), month, ...(category ? { category } : {}), ...(mine ? { scope: 'me' } : {}) } });

    const chartWidth = Math.min(width, 560) - space.lg * 2;
    const categories = summary?.byCategory ?? [];
    const change = summary?.expenseChangePercent;

    // 2 cards per row layout calculation
    const cardWidth = (Math.min(width, 560) - space.xl * 2 - 12) / 2;

    const selectedShare = categories.find(
        (c) => normalizeCategory(c.category).toLowerCase() === (selectedCategory || '').toLowerCase()
    );
    const selectedCategoryObj = selectedCategory ? getCategory(selectedCategory) : null;
    const selectedBudget = selectedCategory
        ? data?.budgets.find((b) => b.category.toLowerCase() === selectedCategory.toLowerCase())
        : null;

    return (
        <Screen variant="blue" refreshing={refreshing} onRefresh={pullToRefresh} contentStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}>
            <View style={styles.topRow}>
                <IconButton Icon={ChevronLeft} tone="onDark" label="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} />
                <View style={{ alignItems: 'center' }}>
                    <T variant="heading" color={colors.white}>{monthLabel(month)}</T>
                    <T variant="tiny" color="rgba(255,255,255,0.65)">{mine ? 'WHERE YOUR MONEY WENT' : 'WHERE THE MONEY WENT'}</T>
                </View>
                <IconButton Icon={ChevronRight} tone="onDark" label="Next month" disabled={isCurrent} onPress={() => setMonth(shiftMonth(month, 1))} />
            </View>

            <View style={styles.scopeRow}>
                <Chip dark label="Just me" Icon={User} active={mine} onPress={() => setScope('me')} />
                <Chip dark label="Family" Icon={Users} active={!mine} onPress={() => setScope('family')} />
            </View>

            <View style={{ paddingHorizontal: space.lg }}>
                <ErrorBanner message={error} onRetry={reload} />
            </View>

            <View style={{ alignItems: 'center', minHeight: 400, justifyContent: 'center' }}>
                {loading && !summary ? <BubbleGhosts width={chartWidth} /> : null}
                {summary && summary.byCategory.length === 0 ? (
                    <View style={{ paddingHorizontal: space.xl }}>
                        <T variant="heading" color={colors.white} style={{ textAlign: 'center' }}>{mine ? 'You have no spending' : 'No spending'} in {monthLabel(month)}</T>
                        <T variant="small" color="rgba(255,255,255,0.7)" style={{ textAlign: 'center', marginTop: 4 }}>Add an expense and it shows up here.</T>
                    </View>
                ) : null}
                {summary && summary.byCategory.length > 0 ? (
                    <BubbleChart data={summary.byCategory} width={chartWidth} height={400} onPress={(category) => handleCategoryPress(category)} />
                ) : null}
            </View>

            <View style={styles.sheet}>
                <View style={styles.sheetTop}>
                    <T variant="title" style={{ fontSize: 22 }}>{mine ? 'Your expenses' : 'Expenses'}</T>
                    <T variant="small" color={colors.muted} style={{ fontFamily: fonts.semibold }} onPress={() => openTransactions()} accessibilityRole="link">View All</T>
                </View>

                {summary ? (
                    <Amount value={summary.expense} size={44} animateKey="insights-expense" style={{ marginVertical: space.sm }} />
                ) : (
                    <Skeleton width={230} height={46} radius={12} style={{ marginVertical: space.sm }} />
                )}

                {change !== null && change !== undefined ? (
                    <View style={styles.changeRow}>
                        {change <= 0 ? <TrendingDown size={16} color={colors.income} /> : <TrendingUp size={16} color={colors.expense} />}
                        <T variant="small" color={change <= 0 ? colors.income : colors.expense} style={{ fontFamily: fonts.bold }}>
                            {Math.abs(change)}% {change <= 0 ? 'less' : 'more'} than {monthLabel(shiftMonth(month, -1), true)}
                        </T>
                    </View>
                ) : null}

                <View style={styles.statRow}>
                    {summary ? (
                        <>
                            <Stat label="Income" value={money(summary.income)} tint={colors.income} />
                            <Stat label="Net" value={`${summary.net < 0 ? '-' : ''}${money(Math.abs(summary.net))}`} tint={summary.net < 0 ? colors.expense : colors.ink} />
                        </>
                    ) : (
                        <>
                            <Skeleton height={62} radius={radius.md} style={{ flex: 1 }} />
                            <Skeleton height={62} radius={radius.md} style={{ flex: 1 }} />
                        </>
                    )}
                </View>

                {categories.length === 0 ? null : (
                    <>
                        <SectionHeader title="Biggest categories" />
                        <View style={styles.cards}>
                            {categories.map((c) => {
                                const category = getCategory(c.category);
                                const budget = data?.budgets.find((b) => b.category.toLowerCase() === c.category.toLowerCase());
                                return (
                                    <Pressable
                                        key={c.category}
                                        onPress={() => handleCategoryPress(c.category)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${c.category}, ${money(c.total)}`}
                                        style={({ pressed }) => [
                                            styles.catCard,
                                            { width: cardWidth, opacity: pressed ? 0.75 : 1 },
                                        ]}
                                    >
                                        <View style={styles.catHead}>
                                            <T variant="small" color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>{c.category}</T>
                                            <category.Icon size={17} color={category.tint} strokeWidth={2.2} />
                                        </View>
                                        <Amount value={c.total} size={22} />
                                        {budget ? (
                                            <View style={{ marginTop: 8 }}>
                                                <Progress value={c.total / budget.limit} tint={c.total > budget.limit ? colors.expense : colors.ink} height={6} />
                                                <T variant="tiny" color={c.total > budget.limit ? colors.expense : colors.muted} style={{ marginTop: 4 }}>
                                                    {c.total > budget.limit ? `${money(c.total - budget.limit)} over budget` : `${money(budget.limit - c.total)} left`}
                                                </T>
                                            </View>
                                        ) : (
                                            <T variant="tiny" color={colors.muted} style={{ marginTop: 8 }}>
                                                {c.percent.toFixed(1)}% · {c.count} tx{c.count === 1 ? '' : 's'}
                                            </T>
                                        )}
                                    </Pressable>
                                );
                            })}
                        </View>
                    </>
                )}

                {summary && !mine && summary.byMember.length > 1 ? (
                    <>
                        <SectionHeader title="Who spent" />
                        {summary.byMember.map((m) => (
                            <View key={m.userId} style={{ marginBottom: 10 }}>
                                <View style={styles.memberRow}>
                                    <T variant="small">{m.name}</T>
                                    <T variant="small" style={{ fontFamily: fonts.bold }}>{money(m.expense)}</T>
                                </View>
                                <Progress value={summary.expense ? m.expense / summary.expense : 0} height={6} />
                            </View>
                        ))}
                    </>
                ) : null}

                {summary && summary.transactionCount === 0 ? <Empty title="A quiet month" /> : null}
            </View>

            {/* Category Transactions Modal */}
            <Modal
                visible={!!selectedCategory}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedCategory(null)}
            >
                <View style={styles.modalRoot}>
                    <Pressable
                        style={styles.modalBackdrop}
                        onPress={() => setSelectedCategory(null)}
                        accessibilityLabel="Close"
                    />
                    <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) + space.lg }]}>
                        <View style={styles.modalHandle} />

                        <View style={styles.modalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
                                {selectedCategoryObj ? (
                                    <View style={[styles.catIconCircle, { backgroundColor: `${selectedCategoryObj.tint}1A` }]}>
                                        <selectedCategoryObj.Icon size={24} color={selectedCategoryObj.tint} strokeWidth={2.2} />
                                    </View>
                                ) : null}
                                <View style={{ flex: 1 }}>
                                    <T variant="heading" numberOfLines={1} style={{ fontSize: 20 }}>
                                        {selectedCategory}
                                    </T>
                                    <T variant="tiny" color={colors.muted}>
                                        {monthLabel(month)} · {selectedShare ? `${selectedShare.count} transaction${selectedShare.count === 1 ? '' : 's'}` : ''}
                                    </T>
                                </View>
                            </View>
                            <IconButton
                                Icon={X}
                                label="Close"
                                size={36}
                                onPress={() => setSelectedCategory(null)}
                            />
                        </View>

                        {selectedShare ? (
                            <View style={styles.modalTotalCard}>
                                <View style={{ flex: 1 }}>
                                    <T variant="tiny" color={colors.muted}>TOTAL SPENT</T>
                                    <Amount value={selectedShare.total} size={26} />
                                </View>
                                {selectedBudget ? (
                                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                        <T variant="tiny" color={colors.muted}>BUDGET ({money(selectedBudget.limit)})</T>
                                        <T variant="tiny" color={selectedShare.total > selectedBudget.limit ? colors.expense : colors.income} style={{ marginTop: 4, fontFamily: fonts.bold }}>
                                            {selectedShare.total > selectedBudget.limit
                                                ? `${money(selectedShare.total - selectedBudget.limit)} over budget`
                                                : `${money(selectedBudget.limit - selectedShare.total)} remaining`}
                                        </T>
                                    </View>
                                ) : (
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <T variant="tiny" color={colors.muted}>SHARE OF EXPENSES</T>
                                        <T variant="heading" style={{ fontSize: 20, marginTop: 2 }}>{selectedShare.percent.toFixed(1)}%</T>
                                    </View>
                                )}
                            </View>
                        ) : null}

                        {catTxsError ? <ErrorBanner message={catTxsError} /> : null}

                        <ScrollView
                            style={{ maxHeight: height * 0.48 }}
                            contentContainerStyle={{ gap: 10, paddingVertical: space.xs }}
                            showsVerticalScrollIndicator={false}
                        >
                            {loadingCatTxs ? (
                                <>
                                    <TxRowSkeleton />
                                    <TxRowSkeleton />
                                    <TxRowSkeleton />
                                </>
                            ) : catTxs.length === 0 ? (
                                <Empty
                                    Icon={ReceiptText}
                                    title="No transactions"
                                    hint={`No transactions recorded for ${selectedCategory} in ${monthLabel(month)}.`}
                                />
                            ) : (
                                catTxs.map((tx) => (
                                    <TxRow
                                        key={tx.id}
                                        tx={tx}
                                        showTime
                                        onPress={() => {
                                            setSelectedCategory(null);
                                            router.push({
                                                pathname: '/add',
                                                params: {
                                                    id: tx.id,
                                                    type: tx.type,
                                                    amount: String(tx.amount),
                                                    category: tx.category,
                                                    description: tx.description || '',
                                                    paymentMethod: tx.paymentMethod || '',
                                                    date: tx.date,
                                                    countForNextMonth: tx.countForNextMonth ? '1' : '0',
                                                    isSplit: tx.isSplit ? '1' : '0',
                                                    myShare: tx.myShare != null ? String(tx.myShare) : undefined,
                                                    splitWith: tx.splitWith || undefined,
                                                },
                                            });
                                        }}
                                    />
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </Screen>
    );
}

// Faint circles in roughly the places the real bubbles land, pulsing until the numbers arrive.
const GHOSTS = [
    { x: 0.62, y: 0.46, d: 170 },
    { x: 0.2, y: 0.3, d: 96 },
    { x: 0.5, y: 0.1, d: 88 },
    { x: 0.18, y: 0.7, d: 100 },
    { x: 0.8, y: 0.84, d: 92 },
];

function BubbleGhosts({ width }: { width: number }) {
    const height = 400;
    return (
        <View style={{ width, height }}>
            {GHOSTS.map((g, i) => (
                <Skeleton
                    key={i}
                    dark
                    width={g.d}
                    height={g.d}
                    radius={g.d / 2}
                    style={{ position: 'absolute', left: Math.min(Math.max(g.x * width - g.d / 2, 0), width - g.d), top: Math.min(Math.max(g.y * height - g.d / 2, 0), height - g.d) }}
                />
            ))}
        </View>
    );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
    return (
        <View style={styles.stat}>
            <T variant="tiny" color={colors.muted}>{label}</T>
            <T variant="heading" color={tint} style={{ marginTop: 2 }}>{value}</T>
        </View>
    );
}

const styles = StyleSheet.create({
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, marginBottom: space.md },
    scopeRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: space.sm },
    sheet: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 38,
        borderTopRightRadius: 38,
        paddingHorizontal: space.xl,
        paddingTop: space.xl,
        // The sheet runs to the bottom edge and keeps its own room for the floating tab bar, so no strip
        // of blue shows underneath it. It also grows to fill short screens.
        paddingBottom: 140,
        marginTop: space.lg,
        minHeight: 360,
        flexGrow: 1,
    },
    sheetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    changeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statRow: { flexDirection: 'row', gap: 12, marginTop: space.lg },
    stat: { flex: 1, padding: space.md, borderRadius: radius.md, backgroundColor: '#F2F6F4' },
    cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    catCard: { padding: space.lg, borderRadius: radius.lg, backgroundColor: '#F2F6F4' },
    catHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    memberRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },

    // Category modal
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,12,10,0.5)' },
    modalContent: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: space.xl,
        paddingTop: space.md,
        maxHeight: '88%',
    },
    modalHandle: {
        alignSelf: 'center',
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.hairline,
        marginBottom: space.md,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: space.md,
    },
    catIconCircle: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalTotalCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#F2F6F4',
        borderRadius: radius.lg,
        padding: space.md,
        marginBottom: space.md,
    },
});
