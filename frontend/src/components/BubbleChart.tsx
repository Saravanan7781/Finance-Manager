import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    PanResponder,
    StyleSheet,
    View,
    type PanResponderInstance,
} from 'react-native';
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

interface Ball {
    id: string;
    item: CategoryShare;
    d: number;
    r: number;
    mass: number;
    originX: number;
    originY: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    isDragging: boolean;
    dragStartX: number;
    dragStartY: number;
    lastMoveX: number;
    lastMoveY: number;
    lastMoveTime: number;
    grantTime: number;
    animX: Animated.Value;
    animY: Animated.Value;
    animScale: Animated.Value;
    animOpacity: Animated.Value;
    panResponder: PanResponderInstance;
}

const GAP = 8;
const MIN_D = 78;

// Greedy circle packing: biggest first, each circle takes the free spot nearest the middle.
const tryPack = (items: CategoryShare[], width: number, height: number, scale: number): Placed[] | null => {
    const top = Math.max(...items.map((i) => i.percent), 1);
    const maxD = Math.max(MIN_D, Math.min(width * 0.6, height * 0.46) * scale);

    const placed: Placed[] = [];
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const d = MIN_D + (maxD - MIN_D) * Math.sqrt(item.percent / top);
        const r = d / 2;

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
    const [balls, setBalls] = useState<Ball[]>([]);

    const ballsRef = useRef<Ball[]>([]);
    ballsRef.current = balls;

    const animFrameRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const lastHapticRef = useRef<number>(0);

    const widthRef = useRef(width);
    widthRef.current = width;
    const heightRef = useRef(height);
    heightRef.current = height;

    const onPressRef = useRef(onPress);
    onPressRef.current = onPress;

    // Physics update step (runs via requestAnimationFrame)
    const stepPhysics = useCallback((now: number) => {
        let dt = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;

        // Clamp dt to avoid tunneling when frame rate drops or pauses
        if (dt > 0.035) dt = 0.016;
        if (dt < 0.005) dt = 0.016;

        const currentBalls = ballsRef.current;
        if (!currentBalls || currentBalls.length === 0) {
            animFrameRef.current = null;
            return;
        }

        const currentW = widthRef.current;
        const currentH = heightRef.current;

        // 1. Spring return forces pulling each ball towards its equilibrium packed origin
        for (let i = 0; i < currentBalls.length; i++) {
            const b = currentBalls[i];
            if (b.isDragging) continue;

            const dx = b.originX - b.x;
            const dy = b.originY - b.y;

            // Spring constant & damping for smooth, bouncy return
            const kSpring = 24.0;
            const damping = 3.8;

            const ax = kSpring * dx - damping * b.vx;
            const ay = kSpring * dy - damping * b.vy;

            b.vx += ax * dt;
            b.vy += ay * dt;

            // Air friction
            b.vx *= 0.985;
            b.vy *= 0.985;

            b.x += b.vx * dt;
            b.y += b.vy * dt;
        }

        // 2. Ball-to-ball elastic collision & push solver
        // Multiple iterations to cleanly handle chain-reaction pushes
        const solverIterations = 3;
        for (let iter = 0; iter < solverIterations; iter++) {
            for (let i = 0; i < currentBalls.length; i++) {
                for (let j = i + 1; j < currentBalls.length; j++) {
                    const b1 = currentBalls[i];
                    const b2 = currentBalls[j];

                    let dx = b2.x - b1.x;
                    let dy = b2.y - b1.y;
                    let dist = Math.hypot(dx, dy);
                    const minDist = b1.r + b2.r + 2;

                    if (dist < minDist) {
                        if (dist < 0.001) {
                            dx = 1;
                            dy = 0;
                            dist = 1;
                        }

                        const nx = dx / dist;
                        const ny = dy / dist;
                        const overlap = minDist - dist;

                        // Mass weighting (dragged ball acts like an immovable wall to other balls)
                        const m1 = b1.isDragging ? 1000000 : b1.mass;
                        const m2 = b2.isDragging ? 1000000 : b2.mass;
                        const totalM = m1 + m2;
                        const w1 = b1.isDragging ? 0 : (b2.isDragging ? 1 : m2 / totalM);
                        const w2 = b2.isDragging ? 0 : (b1.isDragging ? 1 : m1 / totalM);

                        // Positional separation (push out of overlap)
                        if (!b1.isDragging) {
                            b1.x -= nx * overlap * w1;
                            b1.y -= ny * overlap * w1;
                        }
                        if (!b2.isDragging) {
                            b2.x += nx * overlap * w2;
                            b2.y += ny * overlap * w2;
                        }

                        // Elastic impulse bounce
                        const rvx = b2.vx - b1.vx;
                        const rvy = b2.vy - b1.vy;
                        const velAlongNormal = rvx * nx + rvy * ny;

                        if (velAlongNormal < 0) {
                            const restitution = 0.8; // High bounciness
                            const impulse = -(1 + restitution) * velAlongNormal / (1 / m1 + 1 / m2);
                            const ix = impulse * nx;
                            const iy = impulse * ny;

                            if (!b1.isDragging) {
                                b1.vx -= ix / m1;
                                b1.vy -= iy / m1;
                            }
                            if (!b2.isDragging) {
                                b2.vx += ix / m2;
                                b2.vy += iy / m2;
                            }

                            // Trigger light haptic on hard collisions
                            const nowMs = Date.now();
                            if (Math.abs(velAlongNormal) > 380 && nowMs - lastHapticRef.current > 140) {
                                lastHapticRef.current = nowMs;
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            }
                        }
                    }
                }
            }

            // 3. Wall boundaries (container edges)
            for (let i = 0; i < currentBalls.length; i++) {
                const b = currentBalls[i];
                if (b.isDragging) continue;

                const wallRestitution = 0.65;
                if (b.x - b.r < 0) {
                    b.x = b.r;
                    b.vx = -b.vx * wallRestitution;
                } else if (b.x + b.r > currentW) {
                    b.x = currentW - b.r;
                    b.vx = -b.vx * wallRestitution;
                }

                if (b.y - b.r < 0) {
                    b.y = b.r;
                    b.vy = -b.vy * wallRestitution;
                } else if (b.y + b.r > currentH) {
                    b.y = currentH - b.r;
                    b.vy = -b.vy * wallRestitution;
                }
            }
        }

        // 4. Update GPU transforms and check if simulation has rested
        let stillActive = false;
        for (let i = 0; i < currentBalls.length; i++) {
            const b = currentBalls[i];
            b.animX.setValue(b.x - b.r);
            b.animY.setValue(b.y - b.r);

            if (b.isDragging) {
                stillActive = true;
            } else {
                const speed = Math.hypot(b.vx, b.vy);
                const distHome = Math.hypot(b.x - b.originX, b.y - b.originY);
                if (speed > 1.2 || distHome > 1.0) {
                    stillActive = true;
                }
            }
        }

        if (stillActive) {
            animFrameRef.current = requestAnimationFrame(stepPhysics);
        } else {
            // Settle completely at origin and stop loop to save CPU
            for (let i = 0; i < currentBalls.length; i++) {
                const b = currentBalls[i];
                b.x = b.originX;
                b.y = b.originY;
                b.vx = 0;
                b.vy = 0;
                b.animX.setValue(b.originX - b.r);
                b.animY.setValue(b.originY - b.r);
            }
            animFrameRef.current = null;
        }
    }, []);

    const wakePhysics = useCallback(() => {
        if (animFrameRef.current === null) {
            lastTimeRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
            animFrameRef.current = requestAnimationFrame(stepPhysics);
        }
    }, [stepPhysics]);

    // Initialize ball physics states when placed layout changes
    useEffect(() => {
        if (animFrameRef.current !== null) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }

        const newBalls: Ball[] = placed.map((p, index) => {
            const r = p.d / 2;
            const animX = new Animated.Value(p.x - r);
            const animY = new Animated.Value(p.y - r);
            // Start fully visible and at full scale — no blink/scale-up
            const animScale = new Animated.Value(1);
            const animOpacity = new Animated.Value(1);

            const ball: Ball = {
                id: `${p.item.category}-${index}`,
                item: p.item,
                d: p.d,
                r,
                mass: Math.pow(r, 1.4),
                originX: p.x,
                originY: p.y,
                x: p.x,
                y: p.y,
                vx: 0,
                vy: 0,
                isDragging: false,
                dragStartX: p.x,
                dragStartY: p.y,
                lastMoveX: p.x,
                lastMoveY: p.y,
                lastMoveTime: 0,
                grantTime: 0,
                animX,
                animY,
                animScale,
                animOpacity,
                panResponder: null as any,
            };

            ball.panResponder = PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onStartShouldSetPanResponderCapture: () => true,
                onMoveShouldSetPanResponder: (_, gesture) => Math.hypot(gesture.dx, gesture.dy) > 2,
                onMoveShouldSetPanResponderCapture: (_, gesture) => Math.hypot(gesture.dx, gesture.dy) > 2,
                onPanResponderTerminationRequest: () => false,

                onPanResponderGrant: () => {
                    ball.isDragging = true;
                    ball.dragStartX = ball.x;
                    ball.dragStartY = ball.y;
                    ball.lastMoveX = ball.x;
                    ball.lastMoveY = ball.y;
                    ball.lastMoveTime = Date.now();
                    ball.grantTime = Date.now();
                    ball.vx = 0;
                    ball.vy = 0;

                    Animated.spring(ball.animScale, {
                        toValue: 1.08,
                        friction: 6,
                        tension: 80,
                        useNativeDriver: true,
                    }).start();

                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    wakePhysics();
                },

                onPanResponderMove: (_evt, gesture) => {
                    if (!ball.isDragging) return;
                    const now = Date.now();
                    const w = widthRef.current;
                    const h = heightRef.current;

                    const targetX = Math.max(ball.r, Math.min(w - ball.r, ball.dragStartX + gesture.dx));
                    const targetY = Math.max(ball.r, Math.min(h - ball.r, ball.dragStartY + gesture.dy));

                    const dt = Math.max(16, now - ball.lastMoveTime) / 1000;
                    ball.vx = (targetX - ball.x) / dt;
                    ball.vy = (targetY - ball.y) / dt;

                    ball.x = targetX;
                    ball.y = targetY;
                    ball.lastMoveX = targetX;
                    ball.lastMoveY = targetY;
                    ball.lastMoveTime = now;

                    ball.animX.setValue(ball.x - ball.r);
                    ball.animY.setValue(ball.y - ball.r);

                    wakePhysics();
                },

                onPanResponderRelease: (_evt, gesture) => {
                    const elapsed = Date.now() - ball.grantTime;
                    const dist = Math.hypot(gesture.dx, gesture.dy);

                    // Quick tap triggers normal category drill-down
                    if (dist < 8 && elapsed < 320) {
                        onPressRef.current?.(ball.item.category);
                    }

                    ball.isDragging = false;

                    Animated.spring(ball.animScale, {
                        toValue: 1,
                        friction: 6,
                        tension: 80,
                        useNativeDriver: true,
                    }).start();

                    // Calculate throw momentum
                    const gVx = (gesture.vx || 0) * 1000;
                    const gVy = (gesture.vy || 0) * 1000;
                    let vx = gVx;
                    let vy = gVy;

                    if (Math.hypot(vx, vy) < 50 && Math.hypot(ball.vx, ball.vy) > 80) {
                        vx = ball.vx;
                        vy = ball.vy;
                    }

                    // Cap maximum throw speed
                    const speed = Math.hypot(vx, vy);
                    const maxSpeed = 2200;
                    if (speed > maxSpeed) {
                        vx = (vx / speed) * maxSpeed;
                        vy = (vy / speed) * maxSpeed;
                    }

                    ball.vx = vx;
                    ball.vy = vy;

                    wakePhysics();
                },

                onPanResponderTerminate: () => {
                    ball.isDragging = false;
                    Animated.spring(ball.animScale, { toValue: 1, useNativeDriver: true }).start();
                    wakePhysics();
                },
            });

            return ball;
        });

        ballsRef.current = newBalls;
        setBalls(newBalls);

        // ── Tease animation ──────────────────────────────────────────────────
        // After a short settle, nudge every bubble toward its nearest neighbour
        // so they bump, bounce off each other, and spring back to origin —
        // giving the user a glimpse of the physics before they interact.
        const teaseTimer = setTimeout(() => {
            const bs = ballsRef.current;
            if (!bs || bs.length === 0) return;

            // For each ball, find nearest neighbour and give a gentle push that way
            for (let i = 0; i < bs.length; i++) {
                const b = bs[i];
                let nearestDist = Infinity;
                let nx = 0;
                let ny = 0;
                for (let j = 0; j < bs.length; j++) {
                    if (i === j) continue;
                    const dx = bs[j].x - b.x;
                    const dy = bs[j].y - b.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nx = dx / dist;
                        ny = dy / dist;
                    }
                }
                // Kick strength proportional to ball size so small & big ones move similarly
                const kick = 260 + b.r * 1.4;
                b.vx += nx * kick;
                b.vy += ny * kick;
            }

            wakePhysics();
        }, 520); // wait for page-enter transition to finish before teasing

        return () => {
            clearTimeout(teaseTimer);
            if (animFrameRef.current !== null) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
        };
    }, [placed, wakePhysics]);

    const key = data.map((d) => `${d.category}:${d.percent}`).join('|');

    return (
        <View style={{ width, height, position: 'relative' }} key={key}>
            {balls.map((b, index) => {
                const category = getCategory(b.item.category);
                const ring = arc(b.r, b.r, b.r - 3, b.item.percent / 100);
                const compact = b.d < 100;

                return (
                    <Animated.View
                        key={b.id}
                        {...b.panResponder.panHandlers}
                        style={[
                            styles.bubble,
                            {
                                width: b.d,
                                height: b.d,
                                opacity: b.animOpacity,
                                transform: [
                                    { translateX: b.animX },
                                    { translateY: b.animY },
                                    { scale: b.animScale },
                                ],
                            },
                        ]}
                    >
                        <View
                            accessibilityRole="button"
                            accessibilityLabel={`${b.item.category}, ${b.item.percent} percent of spending`}
                            style={styles.fill}
                        >
                            <Svg width={b.d} height={b.d} style={StyleSheet.absoluteFill}>
                                <Defs>
                                    <RadialGradient id={`sheen${index}`} cx="30%" cy="22%" rx="85%" ry="85%">
                                        <Stop offset="0" stopColor="#fff" stopOpacity="0.34" />
                                        <Stop offset="0.6" stopColor="#fff" stopOpacity="0.1" />
                                        <Stop offset="1" stopColor="#fff" stopOpacity="0.05" />
                                    </RadialGradient>
                                </Defs>
                                <Circle cx={b.r} cy={b.r} r={b.r - 1} fill={`url(#sheen${index})`} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
                                {ring ? (
                                    <Path d={ring} stroke="rgba(255,255,255,0.92)" strokeWidth={3} strokeLinecap="round" fill="none" />
                                ) : (
                                    <Circle cx={b.r} cy={b.r} r={b.r - 3} stroke="rgba(255,255,255,0.92)" strokeWidth={3} fill="none" />
                                )}
                            </Svg>

                            <category.Icon size={compact ? 20 : 26} color="#fff" strokeWidth={2} />
                            <T
                                variant="small"
                                color="#fff"
                                numberOfLines={2}
                                style={{
                                    textAlign: 'center',
                                    marginTop: 4,
                                    fontSize: compact ? 10.5 : 12.5,
                                    lineHeight: compact ? 13 : 16,
                                    paddingHorizontal: 8,
                                }}
                            >
                                {b.item.category}
                            </T>
                            <T
                                variant="heading"
                                color="#fff"
                                style={{
                                    fontFamily: fonts.extrabold,
                                    fontSize: compact ? 14 : 18,
                                    marginTop: 1,
                                }}
                            >
                                {b.item.percent.toFixed(1)}%
                            </T>
                        </View>
                    </Animated.View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    bubble: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
    fill: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
