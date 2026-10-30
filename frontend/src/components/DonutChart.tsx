import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, fonts } from '@/constants/theme';
import { getCategory } from '@/lib/categories';
import { moneyShort } from '@/lib/format';
import type { TrendCategory } from '@/lib/types';
import { T } from './ui';

export const MORE = 'More';
const MORE_TINT = '#9AA5A0';
const MAX_SLICES = 6;

// Everything past the biggest few categories folds into one grey "More" slice, so the ring stays legible.
export const groupSlices = (data: TrendCategory[]): TrendCategory[] => {
    const top = data.slice(0, MAX_SLICES);
    const rest = data.slice(MAX_SLICES);
    if (rest.length) {
        const total = rest.reduce((sum, c) => sum + c.total, 0);
        const percent = Math.round(rest.reduce((sum, c) => sum + c.percent, 0) * 10) / 10;
        top.push({ category: MORE, total: Math.round(total * 100) / 100, percent });
    }
    return top;
};

export const sliceColor = (category: string) => (category === MORE ? MORE_TINT : getCategory(category).tint);

// A ring split by category. Tapping a slice selects it; the rest dim so it stands out.
export function DonutChart({
    slices,
    total,
    label,
    size = 148,
    selected,
    onSelect,
}: {
    slices: TrendCategory[];
    total: number;
    label: string;
    size?: number;
    selected?: string | null;
    onSelect?: (category: string | null) => void;
}) {
    const stroke = size * 0.18;
    const r = (size - stroke) / 2;
    const c = size / 2;
    const circumference = 2 * Math.PI * r;
    const gap = slices.length > 1 ? 3 : 0;

    let cursor = 0;
    const segments = slices.map((slice) => {
        const share = (slice.percent / 100) * circumference;
        const segment = { slice, length: Math.max(share - gap, 0.5), offset: cursor };
        cursor += share;
        return segment;
    });

    const appear = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.spring(appear, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
    }, [appear]);

    return (
        <Animated.View
            style={{ width: size, height: size, opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}
        >
            <Svg width={size} height={size}>
                <G rotation="-90" origin={`${c}, ${c}`}>
                    <Circle cx={c} cy={c} r={r} stroke="rgba(14,16,15,0.07)" strokeWidth={stroke} fill="none" />
                    {segments.map(({ slice, length, offset }) => {
                        const isSelected = selected === slice.category;
                        const dimmed = !!selected && !isSelected;
                        return (
                            <Circle
                                key={slice.category}
                                cx={c}
                                cy={c}
                                r={r}
                                stroke={sliceColor(slice.category)}
                                strokeWidth={isSelected ? stroke + 7 : stroke}
                                strokeDasharray={`${length} ${circumference - length}`}
                                strokeDashoffset={-offset}
                                fill="none"
                                opacity={dimmed ? 0.28 : 1}
                                onPress={() => slice.category !== MORE && onSelect?.(isSelected ? null : slice.category)}
                            />
                        );
                    })}
                </G>
            </Svg>

            <View pointerEvents="none" style={styles.center}>
                {total > 0 ? (
                    <>
                        <T variant="heading" style={{ fontFamily: fonts.extrabold, fontSize: size * 0.135 }} numberOfLines={1} adjustsFontSizeToFit>
                            {moneyShort(total)}
                        </T>
                        <T variant="tiny" color={colors.muted} style={{ marginTop: 2 }}>{label}</T>
                    </>
                ) : (
                    <T variant="small" color={colors.muted} style={{ textAlign: 'center' }}>No spending</T>
                )}
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
});
