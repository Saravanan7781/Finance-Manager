import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
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
// Animates in with a clockwise ribbon sweep and subtle elastic scale.
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

    const [progress, setProgress] = useState(0);
    const appear = useRef(new Animated.Value(0)).current;

    const segments = useMemo(() => {
        let cursor = 0;
        return slices.map((slice) => {
            const share = (slice.percent / 100) * circumference;
            const fullLength = Math.max(share - gap, 0.5);
            const offset = cursor;
            cursor += share;
            return { slice, share, fullLength, offset };
        });
    }, [slices, circumference, gap]);

    const slicesKey = useMemo(() => slices.map((s) => `${s.category}:${s.total}`).join('|'), [slices]);

    useEffect(() => {
        appear.setValue(0);
        Animated.spring(appear, {
            toValue: 1,
            friction: 8,
            tension: 65,
            useNativeDriver: true,
        }).start();

        let start: number | null = null;
        let animId: number;
        const duration = 750;

        const frame = (now: number) => {
            if (!start) start = now;
            const elapsed = now - start;
            const t = Math.min(1, elapsed / duration);
            // Ease-out quartic curve: fast energetic start, silky smooth deceleration
            const eased = 1 - Math.pow(1 - t, 4);
            setProgress(eased);
            if (t < 1) {
                animId = requestAnimationFrame(frame);
            }
        };

        animId = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(animId);
    }, [slicesKey, appear]);

    const drawnLength = progress * circumference;

    return (
        <Animated.View
            style={{
                width: size,
                height: size,
                opacity: appear,
                transform: [
                    { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
                    { rotate: appear.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] }) },
                ],
            }}
        >
            <Svg width={size} height={size}>
                <G transform={`rotate(-90 ${c} ${c})`}>
                    <Circle cx={c} cy={c} r={r} stroke="rgba(14,16,15,0.07)" strokeWidth={stroke} fill="none" />
                    {segments.map(({ slice, share, fullLength, offset }) => {
                        const isSelected = selected === slice.category;
                        const dimmed = !!selected && !isSelected;

                        // Calculate how much of this segment has been reached by the sweep
                        const portion = Math.max(0, Math.min(share, drawnLength - offset));
                        const visibleLength = share > 0 ? (portion / share) * fullLength : 0;
                        if (visibleLength <= 0.05) return null;

                        return (
                            <Circle
                                key={slice.category}
                                cx={c}
                                cy={c}
                                r={r}
                                stroke={sliceColor(slice.category)}
                                strokeWidth={isSelected ? stroke + 8 : stroke}
                                strokeDasharray={`${visibleLength} ${circumference}`}
                                strokeDashoffset={-offset}
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

            <Animated.View
                pointerEvents="none"
                style={[
                    styles.center,
                    {
                        opacity: appear.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] }),
                        transform: [
                            { scale: appear.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.75, 0.85, 1] }) },
                        ],
                    },
                ]}
            >
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
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
});
