import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, fonts } from '@/constants/theme';
import { getCategory } from '@/lib/categories';
import { moneyShort } from '@/lib/format';
import type { TrendCategory } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
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
// Clean butt linecaps prevent Android Skia overlap glitches while keeping exact segment geometry.
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
    const { t } = useTranslation();
    const stroke = size * 0.17;
    const r = (size - stroke) / 2;
    const c = size / 2;
    const circumference = 2 * Math.PI * r;
    const gap = slices.length > 1 ? 2.5 : 0;

    const segments = useMemo(() => {
        let cursor = 0;
        return slices.map((slice) => {
            const share = (slice.percent / 100) * circumference;
            const length = Math.max(share - gap, 0.5);
            const offset = cursor;
            cursor += share;
            return { slice, length, offset };
        });
    }, [slices, circumference, gap]);

    const appear = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        appear.setValue(0);
        Animated.spring(appear, {
            toValue: 1,
            friction: 7,
            tension: 80,
            useNativeDriver: true,
        }).start();
    }, [slices, total, label]);

    return (
        <Animated.View
            style={{
                width: size,
                height: size,
                opacity: appear,
                transform: [
                    { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                ],
            }}
        >
            <Svg width={size} height={size}>
                <G rotation="-90" origin={`${c}, ${c}`}>
                    {/* Background track circle */}
                    <Circle
                        cx={c}
                        cy={c}
                        r={r}
                        stroke="rgba(14,16,15,0.08)"
                        strokeWidth={stroke}
                        fill="none"
                    />
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
                                strokeWidth={isSelected ? stroke + 5 : stroke}
                                strokeDasharray={`${length} ${Math.max(0, circumference - length)}`}
                                strokeDashoffset={-offset}
                                strokeLinecap="butt"
                                fill="none"
                                opacity={dimmed ? 0.28 : 1}
                                onPress={() => {
                                    if (slice.category !== MORE) {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                        onSelect?.(isSelected ? null : slice.category);
                                    }
                                }}
                            />
                        );
                    })}
                </G>
            </Svg>

            <View pointerEvents="none" style={styles.center}>
                {total > 0 ? (
                    <>
                        <T
                            variant="heading"
                            style={{ fontFamily: fonts.extrabold, fontSize: size * 0.13, textAlign: 'center' }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {moneyShort(total)}
                        </T>
                        <T
                            variant="tiny"
                            color={colors.muted}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={{ marginTop: 2, textAlign: 'center', fontSize: 10, maxWidth: 84 }}
                        >
                            {label}
                        </T>
                    </>
                ) : (
                    <T variant="small" color={colors.muted} style={{ textAlign: 'center', fontSize: 11 }}>
                        {t('no_spending')}
                    </T>
                )}
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    center: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
});
