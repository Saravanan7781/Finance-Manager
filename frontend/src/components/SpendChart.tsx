import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius, space } from '@/constants/theme';
import { bucketLabel, moneyShort } from '@/lib/format';
import type { TrendBucket, TrendRange } from '@/lib/types';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { Glass, Skeleton, T, useCountUp } from './ui';

const BAR_AREA = 118;

const RANGES: { value: TrendRange; labelKey: TranslationKey; period: string; unit: string }[] = [
    { value: 'day', labelKey: 'range_day', period: 'Last 7 days', unit: 'DAY' },
    { value: 'week', labelKey: 'range_week', period: 'Last 8 weeks', unit: 'WEEK' },
    { value: 'month', labelKey: 'range_month', period: 'Last 6 months', unit: 'MONTH' },
    { value: 'year', labelKey: 'range_year', period: 'Last 12 months', unit: 'YEAR' },
];

function Bar({ ratio, index, tone }: { ratio: number; index: number; tone: 'selected' | 'current' | 'peak' | 'plain' }) {
    const grow = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(grow, {
            toValue: 1,
            duration: 520,
            delay: index * 55,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [grow, index]);

    // Empty periods keep a small stub so the row still reads as a full set of bars.
    const height = grow.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(ratio * BAR_AREA, 5)] });
    const background = {
        selected: colors.ink,
        current: colors.ink,
        peak: 'rgba(14,16,15,0.5)',
        plain: 'rgba(14,16,15,0.16)',
    }[tone];

    return <Animated.View style={[styles.bar, { height, backgroundColor: background }]} />;
}

const GHOST_BARS = [0.55, 0.85, 0.4, 0.7, 0.5, 1, 0.3];

// The chart card with grey bars, shown until the first numbers arrive.
export function SpendChartSkeleton() {
    return (
        <Glass strong style={styles.card}>
            <View style={styles.head}>
                <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width={110} height={16} />
                    <Skeleton width={80} height={12} />
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <Skeleton width={70} height={20} />
                    <Skeleton width={56} height={10} />
                </View>
            </View>
            <Skeleton width={198} height={36} radius={18} style={{ marginTop: space.md }} />
            <View style={styles.chart}>
                {GHOST_BARS.map((ratio, i) => (
                    <View key={i} style={[styles.column, { justifyContent: 'flex-end' }]}>
                        <View style={styles.barArea}>
                            <Skeleton width="68%" height={Math.max(ratio * BAR_AREA, 8)} radius={radius.sm} style={{ maxWidth: 34 }} />
                        </View>
                        <Skeleton width={22} height={9} style={{ marginTop: 8 }} />
                    </View>
                ))}
            </View>
        </Glass>
    );
}

// Spending per day, week or month. Tapping a bar selects it so the screen can show that period's
// transactions; with nothing selected the newest bar stands out.
export function SpendChart({
    range,
    onRangeChange,
    buckets,
    selected,
    onSelect,
    mine,
}: {
    range: TrendRange;
    onRangeChange: (range: TrendRange) => void;
    buckets: TrendBucket[];
    selected: number | null;
    onSelect: (index: number | null) => void;
    mine: boolean;
}) {
    const { t } = useTranslation();
    const config = RANGES.find((r) => r.value === range)!;
    const total = buckets.reduce((sum, b) => sum + b.expense, 0);
    const shownTotal = useCountUp(total, 'spend-total');
    const max = Math.max(...buckets.map((b) => b.expense), 0);
    const average = buckets.length ? total / buckets.length : 0;
    const lastIndex = buckets.length - 1;
    const peak = max > 0 ? buckets.findIndex((b) => b.expense === max) : -1;
    const hasSelection = selected !== null;

    return (
        <Glass strong style={styles.card}>
            <View style={styles.head}>
                <View style={{ flex: 1 }}>
                    <T variant="heading">{mine ? t('your_spending') : t('spending')}</T>
                    <T variant="small" color={colors.muted}>{config.period}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <T variant="heading" style={{ fontFamily: fonts.extrabold, fontSize: 20 }}>{moneyShort(shownTotal)}</T>
                    <T variant="tiny" color={colors.muted}>{moneyShort(average)} / {config.unit}</T>
                </View>
            </View>

            <View style={styles.ranges}>
                {RANGES.map((option) => {
                    const active = option.value === range;
                    return (
                        <Pressable
                            key={option.value}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            onPress={() => !active && onRangeChange(option.value)}
                            style={[styles.rangeOption, active && styles.rangeActive]}
                        >
                            <T variant="tiny" color={active ? colors.white : colors.inkSoft} style={{ fontFamily: fonts.bold }}>
                                {t(option.labelKey).toUpperCase()}
                            </T>
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.chart}>
                {buckets.map((bucket, i) => {
                    const isSelected = selected === i;
                    const isCurrent = !hasSelection && i === lastIndex;
                    const showPeak = !hasSelection && i === peak && !isCurrent;
                    const labelled = bucket.expense > 0 && (isSelected || isCurrent || showPeak);
                    const tone = isSelected ? 'selected' : isCurrent ? 'current' : showPeak ? 'peak' : 'plain';
                    const label = bucketLabel(range, bucket.localStart, i === lastIndex);
                    const emphasised = isSelected || isCurrent;

                    return (
                        <Pressable
                            key={`${range}-${bucket.localStart}-${bucket.expense}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={`${label}, ${moneyShort(bucket.expense)} spent. ${isSelected ? 'Tap to clear.' : 'Tap to see transactions.'}`}
                            onPress={() => onSelect(isSelected ? null : i)}
                            style={styles.column}
                        >
                            <View style={styles.barArea}>
                                <T variant="tiny" color={colors.inkSoft} numberOfLines={1} style={[styles.value, { opacity: labelled ? 1 : 0 }]}>
                                    {moneyShort(bucket.expense)}
                                </T>
                                <Bar ratio={max > 0 ? bucket.expense / max : 0} index={i} tone={tone} />
                            </View>
                            <T
                                variant="tiny"
                                color={emphasised ? colors.ink : colors.muted}
                                numberOfLines={1}
                                style={{ marginTop: 8, fontFamily: emphasised ? fonts.extrabold : fonts.semibold }}
                            >
                                {label}
                            </T>
                        </Pressable>
                    );
                })}
            </View>

            {total === 0 ? (
                <T variant="small" color={colors.muted} style={{ textAlign: 'center', marginTop: space.md }}>
                    {t('nothing_spent_period')}
                </T>
            ) : (
                <T variant="tiny" color={colors.faint} style={{ textAlign: 'center', marginTop: space.md }}>
                    {t('tap_bar_transactions')}
                </T>
            )}
        </Glass>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: space.xl },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
    ranges: { flexDirection: 'row', alignSelf: 'flex-start', padding: 3, borderRadius: radius.pill, backgroundColor: 'rgba(14,16,15,0.08)', marginTop: space.md },
    rangeOption: { minWidth: 64, minHeight: 30, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    rangeActive: { backgroundColor: colors.ink },
    chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: space.lg },
    column: { flex: 1, alignItems: 'center', minHeight: 44 },
    barArea: { height: BAR_AREA + 18, width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
    value: { fontSize: 10, marginBottom: 4, width: 56, textAlign: 'center' },
    bar: { width: '68%', maxWidth: 34, borderRadius: radius.sm, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
});
