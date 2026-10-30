import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { fonts } from '@/constants/theme';
import { getCategory } from '@/lib/categories';
import type { CategoryShare } from '@/lib/types';
import { T } from './ui';

interface Placed {
    item: CategoryShare;
    d: number;
    x: number;
    y: number;
}

const GAP = 8;

const MIN_D = 78;

// Greedy circle packing: biggest first, each circle takes the free spot nearest the middle.
// Returns null if any circle has nowhere to go, so the caller can try a smaller layout.
const tryPack = (items: CategoryShare[], width: number, height: number, scale: number): Placed[] | null => {
    const top = Math.max(...items.map((i) => i.percent), 1);
    const maxD = Math.max(MIN_D, Math.min(width * 0.6, height * 0.46) * scale);

    const placed: Placed[] = [];
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const d = MIN_D + (maxD - MIN_D) * Math.sqrt(item.percent / top);
        const r = d / 2;

        // The leader sits right of centre so the field leans like the reference.
        const anchor = index === 0 ? { x: width * 0.6, y: height * 0.5 } : { x: width * 0.5, y: height * 0.5 };

        let best: { x: number; y: number; score: number } | null = null;
        for (let y = r; y <= height - r; y += 6) {
            for (let x = r; x <= width - r; x += 6) {
                if (!placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.d / 2 + r + GAP)) continue;
                const score = Math.hypot(anchor.x - x, anchor.y - y);
                if (!best || score < best.score) best = { x, y, score };
            }
        }
        if (!best) return null;
        placed.push({ item, d, x: best.x, y: best.y });
    }
    return placed;
};

// Bubbles never overlap: if the field is too crowded, the big circles shrink first, and if that is
// still not enough the smallest categories are left out (they stay listed below the chart).
const pack = (items: CategoryShare[], width: number, height: number): Placed[] => {
    const candidates = items.slice(0, 7);
    for (let n = candidates.length; n >= 1; n--) {
        for (let scale = 1; scale >= 0.4; scale -= 0.05) {
            const placed = tryPack(candidates.slice(0, n), width, height, scale);
            if (placed) return placed;
        }
    }
    return [];
};

const arc = (cx: number, cy: number, r: number, fraction: number) => {
    if (fraction >= 0.999) return null;
    const angle = fraction * Math.PI * 2 - Math.PI / 2;
    const sx = cx;
    const sy = cy - r;
    const ex = cx + r * Math.cos(angle);
    const ey = cy + r * Math.sin(angle);
    return `M ${sx} ${sy} A ${r} ${r} 0 ${fraction > 0.5 ? 1 : 0} 1 ${ex} ${ey}`;
};

function Bubble({ placed, index, onPress }: { placed: Placed; index: number; onPress?: (category: string) => void }) {
    const { item, d, x, y } = placed;
    const scale = useRef(new Animated.Value(0.4)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(scale, { toValue: 1, delay: index * 90, friction: 7, tension: 60, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, delay: index * 90, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, [index, opacity, scale]);

    const category = getCategory(item.category);
    const r = d / 2;
    const ring = arc(r, r, r - 3, item.percent / 100);
    const compact = d < 100;

    return (
        <Animated.View style={[styles.bubble, { width: d, height: d, left: x - r, top: y - r, opacity, transform: [{ scale }] }]}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.category}, ${item.percent} percent of spending`}
                onPress={() => onPress?.(item.category)}
                style={styles.fill}
            >
                <Svg width={d} height={d} style={StyleSheet.absoluteFill}>
                    <Defs>
                        <RadialGradient id={`sheen${index}`} cx="30%" cy="22%" rx="85%" ry="85%">
                            <Stop offset="0" stopColor="#fff" stopOpacity="0.34" />
                            <Stop offset="0.6" stopColor="#fff" stopOpacity="0.1" />
                            <Stop offset="1" stopColor="#fff" stopOpacity="0.05" />
                        </RadialGradient>
                    </Defs>
                    <Circle cx={r} cy={r} r={r - 1} fill={`url(#sheen${index})`} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
                    {ring ? (
                        <Path d={ring} stroke="rgba(255,255,255,0.92)" strokeWidth={3} strokeLinecap="round" fill="none" />
                    ) : (
                        <Circle cx={r} cy={r} r={r - 3} stroke="rgba(255,255,255,0.92)" strokeWidth={3} fill="none" />
                    )}
                </Svg>

                <category.Icon size={compact ? 20 : 26} color="#fff" strokeWidth={2} />
                <T
                    variant="small"
                    color="#fff"
                    numberOfLines={2}
                    style={{ textAlign: 'center', marginTop: 4, fontSize: compact ? 10.5 : 12.5, lineHeight: compact ? 13 : 16, paddingHorizontal: 8 }}
                >
                    {item.category}
                </T>
                <T variant="heading" color="#fff" style={{ fontFamily: fonts.extrabold, fontSize: compact ? 14 : 18, marginTop: 1 }}>
                    {item.percent.toFixed(1)}%
                </T>
            </Pressable>
        </Animated.View>
    );
}

export function BubbleChart({
    data,
    width,
    height,
    onPress,
}: {
    data: CategoryShare[];
    width: number;
    height: number;
    onPress?: (category: string) => void;
}) {
    const placed = useMemo(() => pack(data.slice(0, 7), width, height), [data, width, height]);
    const key = data.map((d) => `${d.category}:${d.percent}`).join('|');

    return (
        <View style={{ width, height }} key={key}>
            {placed.map((p, i) => (
                <Bubble key={p.item.category} placed={p} index={i} onPress={onPress} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    bubble: { position: 'absolute' },
    fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
