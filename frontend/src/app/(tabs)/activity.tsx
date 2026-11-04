import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ReceiptText, Search, X, type LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { DonutChart, groupSlices, sliceColor } from '@/components/DonutChart';
import { RangeToggle } from '@/components/RangeToggle';
import { TxRow, TxRowSkeleton } from '@/components/TxRow';
import { Chip, Empty, ErrorBanner, Glass, IconButton, PillButton, Reveal, Screen, Segmented, Sheet, Skeleton, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { categoriesFor, getCategory } from '@/lib/categories';
import { dayLabel, money, moneyShort, monthBounds, monthKey, monthLabel, shiftMonth, tzOffset } from '@/lib/format';
import type { Tx, TxType, TrendRange } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';

const PAGE = 30;
// A month or a category is a bounded slice of history, so load it in one go instead of paging.
const WHOLE = 200;

const PIE_LABEL: Record<TrendRange, string> = { day: 'TODAY', week: '1 WEEK', month: 'CURRENT MONTH', year: 'THAT YEAR' };

export default function Activity() {
    const { t, translateCategory } = useTranslation();
    const familyId = useFamilyId();
    // Insights sends the category and month of the bubble you tapped; `at` makes repeat taps count as new.
    const params = useLocalSearchParams<{ category?: string; month?: string; scope?: string; at?: string }>();

    const [filter, setFilter] = useState<'all' | TxType>('all');
    const [category, setCategory] = useState<string | null>(params.category ?? null);
    const [month, setMonth] = useState<string | null>(params.month ?? null);
    const [mine, setMine] = useState(params.scope === 'me');
    const [sheet, setSheet] = useState<'category' | 'month' | null>(null);
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [pieRange, setPieRange] = useState<TrendRange>('month');
    const [more, setMore] = useState<Tx[]>([]);
    const [exhausted, setExhausted] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searching ? query.trim() : '');
        }, 300);
        return () => clearTimeout(timer);
    }, [query, searching]);

    useEffect(() => {
        if (!params.at) return;
        setCategory(params.category ?? null);
        setMonth(params.month ?? null);
        setMine(params.scope === 'me');
        setFilter('all');
    }, [params.at, params.category, params.month, params.scope]);

    const type = filter === 'all' ? undefined : filter;
    const range = month ? monthBounds(month) : null;
    // Firestore only has an index for category on its own, so with a type or "just me" it is filtered here.
    const serverCategory = category && !type && !mine ? category : undefined;
    const pageSize = range || serverCategory ? WHOLE : PAGE;
    const queryOpts = {
        type,
        category: serverCategory,
        scope: mine ? ('me' as const) : undefined,
        from: month ? undefined : range?.from,
        to: month ? undefined : range?.to,
        month: month || undefined,
        tzOffset: month ? tzOffset() : undefined,
        limit: pageSize,
        search: debouncedSearch || undefined,
    };

    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(
        () => api.transactions(familyId, queryOpts),
        [familyId, type, serverCategory, mine, month, debouncedSearch]
    );
    const pie = useAsync(() => api.trend(familyId, pieRange, tzOffset(), 'family', true), [familyId, pieRange]);
    const family = useAsync(() => api.family(familyId), [familyId]);

    // A fresh first page, or a different filter, invalidates whatever was paged in after it.
    useEffect(() => {
        setMore([]);
        setExhausted(false);
    }, [data]);

    const loaded = useMemo(() => [...(data ?? []), ...more], [data, more]);

    const needle = query.trim().toLowerCase();
    const items = useMemo(
        () =>
            loaded.filter(
                (tx) =>
                    (!category || serverCategory || tx.category === category) &&
                    (!needle ||
                        [tx.description, tx.category, tx.createdByName ?? '', tx.paymentMethod ?? ''].some((text) => text.toLowerCase().includes(needle)))
            ),
        [loaded, category, serverCategory, needle]
    );

    const spent = items.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const received = items.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

    const groups = useMemo(() => {
        const out: { label: string; rows: Tx[]; net: number }[] = [];
        items.forEach((tx) => {
            const label = dayLabel(tx.date);
            const signed = tx.type === 'income' ? tx.amount : -tx.amount;
            const last = out[out.length - 1];
            if (last && last.label === label) {
                last.rows.push(tx);
                last.net += signed;
            } else {
                out.push({ label, rows: [tx], net: signed });
            }
        });
        return out;
    }, [items]);

    const slices = useMemo(() => groupSlices(pie.data?.byCategory ?? []), [pie.data]);
    const pieTotal = (pie.data?.byCategory ?? []).reduce((sum, c) => sum + c.total, 0);

    const filtering = !!category || !!month || mine || !!needle;
    const filteredHere = !!needle || (!!category && !serverCategory);

    const customCats = family.data?.customCategories ?? [];
    const categoryOptions =
        filter === 'expense'
            ? categoriesFor('expense', customCats)
            : filter === 'income'
              ? categoriesFor('income', customCats)
              : [
                    ...categoriesFor('expense', customCats),
                    ...categoriesFor('income', customCats).filter(
                        (c) => !categoriesFor('expense', customCats).some((e) => e.name === c.name)
                    ),
                ];
    const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(monthKey(), -i)), []);

    const loadMore = async () => {
        const last = loaded[loaded.length - 1];
        if (!last) return;
        setLoadingMore(true);
        try {
            const next = await api.transactions(familyId, { ...queryOpts, startAfter: last.id });
            setMore((m) => [...m, ...next]);
            if (next.length < pageSize) setExhausted(true);
        } finally {
            setLoadingMore(false);
        }
    };

    const clearFilters = () => {
        setCategory(null);
        setMonth(null);
        setMine(false);
        setQuery('');
    };

    // Picking a slice of the pie filters the list to that category.
    const pickFromPie = (picked: string | null) => {
        setCategory(picked);
        if (picked && filter === 'income') setFilter('expense');
    };

    return (
        <Screen bottomInset={96} refreshing={refreshing} onRefresh={pullToRefresh}>
            <View style={styles.header}>
                <T variant="title" style={{ flex: 1 }}>{t('tab_activity')}</T>
                <IconButton
                    Icon={searching ? X : Search}
                    label={searching ? 'Close search' : 'Search transactions'}
                    onPress={() => {
                        setSearching((s) => !s);
                        setQuery('');
                    }}
                />
            </View>

            {searching ? (
                <View style={styles.searchBox}>
                    <Search size={18} color={colors.muted} />
                    <TextInput
                        accessibilityLabel="Search transactions"
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('search_hint')}
                        placeholderTextColor={colors.faint}
                        autoFocus
                        returnKeyType="search"
                        style={styles.searchInput}
                    />
                </View>
            ) : null}

            <Glass strong>
                <T variant="heading">{t('spending_by_category')}</T>
                <View style={{ marginTop: space.md }}>
                    <RangeToggle value={pieRange} onChange={setPieRange} />
                </View>

                <View style={styles.pieBody}>
                    {pie.loading && !pie.data ? (
                        <>
                            <Skeleton width={148} height={148} radius={74} />
                            <View style={{ flex: 1, gap: 12 }}>
                                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={14} />)}
                            </View>
                        </>
                    ) : (
                        <>
                            <DonutChart key={pieRange} slices={slices} total={pieTotal} label={{ day: t('range_today'), week: t('range_1week'), month: t('range_current_month'), year: t('range_that_year') }[pieRange]} selected={category} onSelect={pickFromPie} />
                            <View style={styles.legend}>
                                {slices.length === 0 ? (
                                    <T variant="small" color={colors.muted}>{t('nothing_spent_period')}</T>
                                ) : (
                                    slices.map((slice) => {
                                        const selected = category === slice.category;
                                        return (
                                            <Pressable
                                                key={slice.category}
                                                accessibilityRole="button"
                                                accessibilityLabel={`${slice.category}, ${slice.percent} percent`}
                                                disabled={slice.category === 'More'}
                                                onPress={() => pickFromPie(selected ? null : slice.category)}
                                                style={styles.legendRow}
                                            >
                                                <View style={[styles.dot, { backgroundColor: sliceColor(slice.category) }]} />
                                                <T variant="small" numberOfLines={1} style={{ flex: 1, fontFamily: selected ? fonts.extrabold : fonts.medium }}>
                                                    {translateCategory(slice.category)}
                                                </T>
                                                <T variant="small" color={colors.inkSoft} style={{ fontFamily: fonts.bold }}>{slice.percent}%</T>
                                            </Pressable>
                                        );
                                    })
                                )}
                            </View>
                        </>
                    )}
                </View>
            </Glass>

            <View style={{ marginTop: space.lg }}>
                <Segmented
                    value={filter}
                    onChange={(next) => {
                        setFilter(next);
                        setCategory(null);
                    }}
                    options={[
                        { value: 'all', label: t('all') },
                        { value: 'income', label: t('received') },
                        { value: 'expense', label: t('spent') },
                    ]}
                />
            </View>

            {/* Buttons that open a sheet showing every option at once, instead of a row you have to slide through. */}
            <View style={styles.filterRow}>
                <FilterButton label={t('category')} value={category ? translateCategory(category) : null} Icon={category ? getCategory(category).Icon : undefined} onPress={() => setSheet('category')} onClear={() => setCategory(null)} />
                <FilterButton label={t('range_month')} value={month ? monthLabel(month, true) : null} onPress={() => setSheet('month')} onClear={() => setMonth(null)} />
                {mine ? <FilterButton label={t('just_me')} value={t('just_me')} onPress={() => setMine(false)} onClear={() => setMine(false)} /> : null}
            </View>

            <Glass strong style={styles.stats}>
                <View style={styles.stat}>
                    <T variant="tiny" color={colors.muted}>{t('received')}</T>
                    {data ? (
                        <T variant="heading" color={colors.income} style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{money(received)}</T>
                    ) : (
                        <Skeleton width={96} height={22} style={{ marginTop: 4 }} />
                    )}
                </View>
                <View style={styles.statLine} />
                <View style={styles.stat}>
                    <T variant="tiny" color={colors.muted}>{t('spent')}</T>
                    {data ? (
                        <T variant="heading" color={colors.expense} style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{money(spent)}</T>
                    ) : (
                        <Skeleton width={96} height={22} style={{ marginTop: 4 }} />
                    )}
                </View>
            </Glass>

            <ErrorBanner message={error} onRetry={reload} />
            {loading && !data ? (
                <View style={{ marginTop: space.lg }}>
                    <View style={styles.dayHeader}>
                        <Skeleton width={70} height={13} />
                        <Skeleton width={52} height={13} />
                    </View>
                    <Glass strong style={styles.dayCard}>
                        {[0, 1, 2, 3].map((i) => (
                            <View key={i}>
                                {i > 0 ? <View style={styles.divider} /> : null}
                                <TxRowSkeleton flat />
                            </View>
                        ))}
                    </Glass>
                </View>
            ) : null}

            {data && items.length === 0 ? (
                <View>
                    <Empty
                        Icon={ReceiptText}
                        title={filtering ? t('nothing_matches') : t('no_transactions_here')}
                        hint={filtering ? t('try_different_search') : t('add_one_with_plus')}
                    />
                    {filtering ? <PillButton label={t('clear_filters')} variant="glass" onPress={clearFilters} style={{ alignSelf: 'center' }} /> : null}
                </View>
            ) : null}

            {groups.map((group, g) => (
                <Reveal key={group.label} index={g} style={{ marginTop: space.lg }}>
                    <View style={styles.dayHeader}>
                        <T variant="small" color={colors.inkSoft} style={{ fontFamily: fonts.bold }}>{group.label}</T>
                        <T variant="small" color={group.net < 0 ? colors.expense : colors.income} style={{ fontFamily: fonts.bold }}>
                            {group.net < 0 ? '-' : '+'}{moneyShort(Math.abs(group.net))}
                        </T>
                    </View>
                    <Glass strong style={styles.dayCard}>
                        {group.rows.map((tx, i) => (
                            <View key={tx.id}>
                                {i > 0 ? <View style={styles.divider} /> : null}
                                <TxRow
                                    flat
                                    tx={tx}
                                    showTime
                                    onPress={() =>
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
                                        })
                                    }
                                />
                            </View>
                        ))}
                    </Glass>
                </Reveal>
            ))}

            {data && data.length >= pageSize && !exhausted ? (
                <PillButton label={t('load_older')} variant="glass" loading={loadingMore} onPress={loadMore} style={{ marginTop: space.xl }} />
            ) : null}
            {filteredHere && loaded.length > 0 && items.length > 0 ? (
                <T variant="tiny" color={colors.faint} style={{ textAlign: 'center', marginTop: space.lg }}>
                    SHOWING {items.length} OF {loaded.length} LOADED
                </T>
            ) : null}

            <Sheet visible={sheet === 'category'} onClose={() => setSheet(null)} title={t('category')}>
                <View style={styles.sheetGrid}>
                    <Chip label={t('all_categories')} active={!category} onPress={() => { setCategory(null); setSheet(null); }} />
                    {categoryOptions.map((option) => (
                        <Chip
                            key={option.name}
                            label={option.name}
                            Icon={option.Icon}
                            active={category === option.name}
                            onPress={() => {
                                setCategory(option.name);
                                setSheet(null);
                            }}
                        />
                    ))}
                </View>
            </Sheet>

            <Sheet visible={sheet === 'month'} onClose={() => setSheet(null)} title={t('range_month')}>
                <View style={styles.sheetGrid}>
                    <Chip label={t('all_time')} active={!month} onPress={() => { setMonth(null); setSheet(null); }} />
                    {monthOptions.map((key) => (
                        <Chip
                            key={key}
                            label={monthLabel(key, true)}
                            active={month === key}
                            onPress={() => {
                                setMonth(key);
                                setSheet(null);
                            }}
                        />
                    ))}
                </View>
            </Sheet>
        </Screen>
    );
}

// A filter that shows its current value, opens a sheet on tap, and clears with the small cross.
function FilterButton({ label, value, Icon, onPress, onClear }: { label: string; value: string | null; Icon?: LucideIcon; onPress: () => void; onClear: () => void }) {
    const active = !!value;
    const foreground = active ? colors.white : colors.ink;
    return (
        <View style={[styles.filterButton, active && styles.filterButtonActive]}>
            <Pressable accessibilityRole="button" accessibilityLabel={active ? `${label}: ${value}` : `Filter by ${label.toLowerCase()}`} onPress={onPress} style={styles.filterMain}>
                {Icon ? <Icon size={15} color={foreground} strokeWidth={2.4} /> : null}
                <T variant="small" color={foreground} numberOfLines={1} style={{ fontFamily: fonts.semibold, flexShrink: 1 }}>
                    {value ?? label}
                </T>
                {!active ? <ChevronDown size={15} color={foreground} strokeWidth={2.4} /> : null}
            </Pressable>
            {active ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()} filter`} onPress={onClear} hitSlop={8} style={styles.filterClear}>
                    <X size={15} color={foreground} strokeWidth={2.6} />
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 50,
        paddingHorizontal: space.lg,
        marginBottom: space.md,
        borderRadius: radius.pill,
        backgroundColor: colors.glassStrong,
        borderWidth: 1,
        borderColor: colors.hairline,
    },
    searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, paddingVertical: 10 },
    pieBody: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.lg },
    legend: { flex: 1, gap: 9 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    // Wraps onto new lines rather than scrolling sideways, so every filter is always in view.
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 40,
        borderRadius: radius.pill,
        backgroundColor: colors.glassStrong,
        borderWidth: 1,
        borderColor: colors.hairline,
        maxWidth: '100%',
    },
    filterButtonActive: { backgroundColor: colors.ink, borderColor: colors.ink },
    filterMain: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, flexShrink: 1 },
    filterClear: { paddingRight: 12, paddingLeft: 2, minHeight: 40, justifyContent: 'center' },
    stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.lg, marginTop: space.md },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { marginTop: 2, fontSize: 19 },
    statLine: { width: 1, height: 34, backgroundColor: colors.hairline },
    dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: space.sm },
    dayCard: { padding: 0, overflow: 'hidden' },
    // Inset so the line starts under the text, past the category icon.
    divider: { height: 1, backgroundColor: colors.hairline, marginLeft: 78, marginRight: space.lg },
    sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
