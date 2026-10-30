import { router } from 'expo-router';
import { Bell, Eye, EyeOff, Plus, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SpendChart, SpendChartSkeleton } from '@/components/SpendChart';
import { TxRow, TxRowSkeleton } from '@/components/TxRow';
import { Amount, Avatar, Empty, ErrorBanner, Glass, IconButton, Progress, Reveal, Screen, SectionHeader, Skeleton, T } from '@/components/ui';
import { colors, fonts, radius, shadow, space } from '@/constants/theme';
import { useAuth, useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { bucketTitle, daysUntil, firstName, monthKey, moneyShort, tzOffset } from '@/lib/format';
import { syncReminders } from '@/lib/notifications';
import type { SummaryScope, TrendRange } from '@/lib/types';

export default function Home() {
    const { me } = useAuth();
    const familyId = useFamilyId();
    const [hidden, setHidden] = useState(false);
    const [scope, setScope] = useState<SummaryScope>('me');
    const mine = scope === 'me';

    const [range, setRange] = useState<TrendRange>('day');
    const [selected, setSelected] = useState<number | null>(null);

    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(async () => {
        const [summary, trend, recent, goals, loans] = await Promise.all([
            api.summary(familyId, monthKey(), tzOffset(), scope),
            api.trend(familyId, range, tzOffset(), scope),
            api.transactions(familyId, { limit: 4, scope }),
            api.goals(familyId),
            api.loans(familyId, 'open'),
        ]);
        syncReminders(loans, goals).catch(() => {});
        return { summary, buckets: trend.buckets, recent, goals, loans };
    }, [familyId, scope, range]);

    // Tapping a bar swaps "Latest" for everything that bar adds up, fetched by the bar's own time span.
    const bucket = selected !== null ? data?.buckets[selected] ?? null : null;
    const period = useAsync(async () => {
        if (!bucket) return [];
        return api.transactions(familyId, {
            scope,
            limit: 100,
            from: bucket.start,
            to: new Date(Date.parse(bucket.end) - 1).toISOString(),
        });
    }, [familyId, scope, bucket?.start, bucket?.end]);

    const changeScope = (next: SummaryScope) => {
        setScope(next);
        setSelected(null);
    };
    const changeRange = (next: TrendRange) => {
        setRange(next);
        setSelected(null);
    };

    const listed = bucket ? period.data ?? [] : data?.recent ?? [];
    const listLoading = bucket ? period.loading && !period.data : false;

    const summary = data?.summary;
    const overdue = (data?.loans ?? []).filter((l) => l.dueDate && daysUntil(l.dueDate) < 0).length;

    return (
        <Screen bottomInset={96} refreshing={refreshing} onRefresh={pullToRefresh}>
            <View style={styles.header}>
                <Avatar name={me?.displayName ?? '?'} size={48} />
                <View style={{ flex: 1 }}>
                    <T variant="small" color={colors.inkSoft}>{me?.family?.name}</T>
                    <T variant="heading" style={{ fontSize: 20 }}>Hi, {firstName(me?.displayName ?? '')}!</T>
                </View>
                <IconButton Icon={Bell} label={overdue ? `${overdue} overdue loans` : 'Loans and reminders'} badge={overdue > 0} onPress={() => router.push('/loans')} />
                <IconButton Icon={Sparkles} label="Ask about your money" onPress={() => router.push('/ask')} />
            </View>

            <ErrorBanner message={error} onRetry={reload} />

            <Glass strong style={styles.heroShell}>
                <View style={styles.hero}>
                    <View style={styles.heroTop}>
                        <View style={styles.scopeToggle}>
                            {(['me', 'family'] as const).map((option) => (
                                <Pressable
                                    key={option}
                                    accessibilityRole="button"
                                    accessibilityLabel={option === 'family' ? 'Show family balance' : 'Show my balance'}
                                    accessibilityState={{ selected: scope === option }}
                                    onPress={() => changeScope(option)}
                                    style={[styles.scopeOption, scope === option && styles.scopeOptionActive]}
                                >
                                    <T variant="tiny" color={scope === option ? colors.white : colors.inkSoft} style={{ fontFamily: fonts.bold }}>
                                        {option === 'family' ? 'FAMILY' : 'ME'}
                                    </T>
                                </Pressable>
                            ))}
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'} onPress={() => setHidden((h) => !h)} hitSlop={12}>
                            {hidden ? <EyeOff size={20} color={colors.inkSoft} /> : <Eye size={20} color={colors.inkSoft} />}
                        </Pressable>
                    </View>
                    {loading && !summary ? (
                        <View style={{ gap: 12, paddingTop: 4 }}>
                            <Skeleton width={96} height={12} />
                            <Skeleton width="80%" height={46} radius={12} />
                            <Skeleton width={130} height={12} />
                        </View>
                    ) : (
                        <>
                            <T variant="small" color={colors.inkSoft} style={{ marginBottom: 2 }}>{mine ? 'Your balance' : 'Family balance'}</T>
                            <Amount value={summary?.balance ?? 0} size={46} hidden={hidden} mutedColor="rgba(14,16,15,0.38)" animateKey="home-balance" />
                            <T variant="small" color={(summary?.net ?? 0) >= 0 ? colors.income : colors.expense} style={{ fontFamily: fonts.bold, marginTop: 4 }}>
                                {hidden ? '' : `${(summary?.net ?? 0) >= 0 ? '+' : '-'}${moneyShort(Math.abs(summary?.net ?? 0))} this month`}
                            </T>
                        </>
                    )}
                </View>

            </Glass>

            {data ? (
                <SpendChart range={range} onRangeChange={changeRange} buckets={data.buckets} selected={selected} onSelect={setSelected} mine={mine} />
            ) : loading ? (
                <SpendChartSkeleton />
            ) : null}

            <SectionHeader
                title={bucket ? bucketTitle(range, bucket.localStart) : 'Latest Transactions'}
                action={bucket ? 'Clear' : 'See All'}
                onAction={() => (bucket ? setSelected(null) : router.push('/activity'))}
            />
            {bucket ? (
                <T variant="small" color={colors.inkSoft} style={{ marginTop: -6, marginBottom: space.md }}>
                    {moneyShort(bucket.expense)} spent
                    {bucket.income > 0 ? ` · ${moneyShort(bucket.income)} received` : ''}
                    {period.data ? ` · ${period.data.length} transaction${period.data.length === 1 ? '' : 's'}` : ''}
                </T>
            ) : null}
            {listLoading || (loading && !data) ? (
                <View style={{ gap: 10 }}>
                    {[0, 1, 2].map((i) => <TxRowSkeleton key={i} />)}
                </View>
            ) : null}
            {!listLoading && data && listed.length === 0 ? (
                <Glass>
                    <Empty
                        title={bucket ? 'No transactions in this period' : 'Nothing yet'}
                        hint={bucket ? 'Tap the bar again, or Clear, to go back to your latest.' : 'Tap the yellow + to add your first transaction.'}
                    />
                </Glass>
            ) : (
                <View style={{ gap: 10 }}>
                    {listed.map((tx, i) => (
                        <Reveal key={tx.id} index={i}>
                            <TxRow tx={tx} showTime={!!bucket && range !== 'day'} onPress={() => router.push(`/add?id=${tx.id}`)} />
                        </Reveal>
                    ))}
                </View>
            )}

            <SectionHeader title="Goals" action="Manage" onAction={() => router.push('/goals')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: space.lg }} style={{ marginHorizontal: -space.lg, paddingHorizontal: space.lg, overflow: 'visible' }}>
                {loading && !data ? [0, 1, 2].map((i) => <Skeleton key={i} width={150} height={118} radius={radius.lg} />) : null}
                {(data?.goals ?? []).slice(0, 4).map((goal) => {
                    const pct = goal.targetAmount ? goal.currentAmount / goal.targetAmount : 0;
                    return (
                        <Pressable key={goal.id} onPress={() => router.push('/goals')} style={styles.goalCard} accessibilityRole="button" accessibilityLabel={`${goal.title}, ${Math.round(pct * 100)} percent saved`}>
                            <T variant="small" color={colors.muted} numberOfLines={1}>{goal.title}</T>
                            <T variant="heading" style={{ fontSize: 20, marginVertical: 6 }}>{Math.round(Math.min(pct, 1) * 100)}%</T>
                            <Progress value={pct} tint={pct >= 1 ? colors.income : colors.ink} />
                            <T variant="tiny" color={colors.muted} style={{ marginTop: 8 }}>{moneyShort(goal.currentAmount)} of {moneyShort(goal.targetAmount)}</T>
                        </Pressable>
                    );
                })}
                {/* Only once the goals are known: this solid black card used to show up before any data and looked like a glitch. */}
                {data ? (
                    <Pressable onPress={() => router.push('/goals?new=1')} style={[styles.goalCard, styles.goalAdd]} accessibilityRole="button" accessibilityLabel="Add a goal">
                        <Plus size={26} color={colors.white} strokeWidth={2.2} />
                        <T variant="body" color={colors.white} style={{ fontFamily: fonts.bold, marginTop: 6 }}>Add goal</T>
                    </Pressable>
                ) : null}
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xl },
    heroShell: { padding: 8, borderRadius: radius.xl },
    hero: { backgroundColor: colors.lemon, borderRadius: 28, padding: space.xl, paddingBottom: space.xxl, gap: 2 },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
    scopeToggle: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: 'rgba(14,16,15,0.1)' },
    scopeOption: { minWidth: 62, minHeight: 30, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    scopeOptionActive: { backgroundColor: colors.ink },    goalCard: { width: 150, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.glassStrong, ...shadow.card, shadowOpacity: 0.08 },
    goalAdd: { backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', width: 130 },
});
