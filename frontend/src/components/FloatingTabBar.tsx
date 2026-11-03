import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChartPie, HandCoins, House, Plus, Users, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts, shadow } from '@/constants/theme';
import { useTranslation, t } from '@/lib/i18n';
import { DEMO } from '@/lib/config';
import { HOLD_MS, MOVE_SLOP, OPTIONS, OPTION_SIZE, pickOption, type QuickKey } from '@/lib/quickMenu';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, { Icon: LucideIcon; label: string }> = {
    index: { Icon: House, label: 'Home' },
    activity: { Icon: ArrowLeftRight, label: 'Activity' },
    insights: { Icon: ChartPie, label: 'Insights' },
    family: { Icon: Users, label: 'Family' },
};

const OPTION_ICONS: Record<QuickKey, LucideIcon> = {
    spend: ArrowUpFromLine,
    earn: ArrowDownToLine,
    lend: HandCoins,
};

const BUTTON = 60;

const buzz = (kind: 'open' | 'hover' | 'commit') => {
    if (Platform.OS === 'web') return;
    if (kind === 'open') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    else if (kind === 'hover') Haptics.selectionAsync().catch(() => {});
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

function QuickOptionBubble({ option, progress, hovered }: { option: (typeof OPTIONS)[number]; progress: Animated.Value; hovered: boolean }) {
    const lift = useRef(new Animated.Value(0)).current;
    const Icon = OPTION_ICONS[option.key];

    useEffect(() => {
        Animated.spring(lift, { toValue: hovered ? 1 : 0, friction: 6, tension: 140, useNativeDriver: true }).start();
    }, [hovered, lift]);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.option,
                {
                    left: BUTTON / 2 + option.x - OPTION_SIZE / 2,
                    top: BUTTON / 2 + option.y - OPTION_SIZE / 2,
                    opacity: progress,
                    // Fly out from the + button to the final spot.
                    transform: [
                        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-option.x, 0] }) },
                        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-option.y, 0] }) },
                        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                    ],
                },
            ]}
        >
            <Animated.View
                style={[
                    styles.optionDisc,
                    hovered && styles.optionDiscActive,
                    { transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }] },
                ]}
            >
                <Icon size={26} color={hovered ? colors.white : colors.ink} strokeWidth={2.3} />
            </Animated.View>
            <View style={[styles.optionLabel, hovered && { backgroundColor: colors.lemon }]}>
                <Text style={[styles.optionLabelText, hovered && { color: colors.ink }]}>{t(('quick_' + option.key) as any)}</Text>
            </View>
        </Animated.View>
    );
}

/* ------------------------------------------------------------ First-run intro */

const INTRO_KEY = 'fab-intro-seen';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Ring sits just outside the button without touching the neighbouring tabs.
const RING_R = 35;
const RING_SIZE = 80;
const RING_LENGTH = 2 * Math.PI * RING_R;

// Three rays fanned above the button, left, centre and right.
const RAYS = [-38, 0, 38];
const RAY_START = 48;
const RAY_LENGTH = 22;
const RAY_WIDTH = 7;

// A one-time hello on the + button: a ring draws itself around it, then flares out as three rays
// spark up above it. It never takes touches, and is skipped when the phone asks for reduced motion.
function FabIntro() {
    const [playing, setPlaying] = useState(false);
    const draw = useRef(new Animated.Value(0)).current;
    const burst = useRef(new Animated.Value(0)).current;
    const fade = useRef(new Animated.Value(1)).current;
    const rays = useRef(RAYS.map(() => new Animated.Value(0))).current;

    useEffect(() => {
        let cancelled = false;
        let tick: ReturnType<typeof setTimeout> | null = null;

        (async () => {
            try {
                const [seen, reduceMotion] = await Promise.all([AsyncStorage.getItem(INTRO_KEY), AccessibilityInfo.isReduceMotionEnabled()]);
                if (reduceMotion || (seen === '1' && !DEMO)) return;
                // Marked as seen before it plays, so an interrupted launch cannot make it repeat forever.
                await AsyncStorage.setItem(INTRO_KEY, '1');
            } catch {
                // Storage is only a convenience; if it fails the intro still plays this once.
            }
            if (cancelled) return;

            setPlaying(true);
            tick = setTimeout(() => buzz('hover'), 700 + 950);
            Animated.sequence([
                Animated.delay(700),
                Animated.timing(draw, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
                Animated.parallel([
                    Animated.timing(burst, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    Animated.stagger(
                        110,
                        rays.map((value) => Animated.spring(value, { toValue: 1, friction: 5, tension: 150, useNativeDriver: true }))
                    ),
                ]),
                Animated.delay(1800),
                Animated.timing(fade, { toValue: 0, duration: 500, useNativeDriver: true }),
            ]).start(() => {
                if (!cancelled) setPlaying(false);
            });
        })();

        return () => {
            cancelled = true;
            if (tick) clearTimeout(tick);
        };
    }, [draw, burst, fade, rays]);

    if (!playing) return null;

    return (
        <View pointerEvents="none" style={styles.intro}>
            <Animated.View style={[styles.introRing, { opacity: fade }]}>
                <Animated.View
                    style={{
                        opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                        transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }, { rotate: '-90deg' }],
                    }}
                >
                    <Svg width={RING_SIZE} height={RING_SIZE}>
                        <AnimatedCircle
                            cx={RING_SIZE / 2}
                            cy={RING_SIZE / 2}
                            r={RING_R}
                            stroke={colors.ink}
                            strokeWidth={3}
                            strokeLinecap="round"
                            fill="none"
                            strokeDasharray={RING_LENGTH}
                            strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [RING_LENGTH, 0] })}
                        />
                    </Svg>
                </Animated.View>
            </Animated.View>

            {/* Each ray is an upright stick above a zero-size pivot at the button centre, tilted by rotating the pivot. */}
            <Animated.View style={[styles.rayPivotRoot, { opacity: fade }]}>
                {RAYS.map((angle, i) => (
                    <View key={angle} style={[styles.rayPivot, { transform: [{ rotate: `${angle}deg` }] }]}>
                        <Animated.View
                            style={[
                                styles.ray,
                                {
                                    opacity: rays[i].interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
                                    // Grows outward from its base rather than from its middle.
                                    transform: [
                                        { translateY: rays[i].interpolate({ inputRange: [0, 1], outputRange: [RAY_LENGTH / 2, 0] }) },
                                        { scaleY: rays[i].interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                    ],
                                },
                            ]}
                        />
                    </View>
                ))}
            </Animated.View>
        </View>
    );
}

let hasShownOpeningAnimationThisSession = false;

// The yellow + button. A tap opens the normal add screen. Holding fans out Spend (left), Earn (up) and
// Lend (right); sliding onto one and letting go opens it, and letting go anywhere else cancels.
function AddButton({ progress, onOpenChange }: { progress: Animated.Value; onOpenChange: (open: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const [hover, setHover] = useState<QuickKey | null>(null);

    // The gesture handlers are created once, so everything they touch lives in a ref.
    const g = useRef({
        timer: null as ReturnType<typeof setTimeout> | null,
        open: false,
        hover: null as QuickKey | null,
        startX: 0,
        startY: 0,
        moved: false,
        startedAt: 0,
    }).current;

    const setMenu = (next: boolean) => {
        g.open = next;
        setOpen(next);
        onOpenChange(next);
    };

    const close = () => {
        if (g.timer) clearTimeout(g.timer);
        g.timer = null;
        g.hover = null;
        setHover(null);
        Animated.timing(progress, { toValue: 0, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMenu(false));
    };

    const finish = (commit: boolean) => {
        if (g.timer) clearTimeout(g.timer);
        g.timer = null;

        if (g.open) {
            const chosen = commit ? OPTIONS.find((o) => o.key === g.hover) : undefined;
            close();
            if (chosen) {
                buzz('commit');
                router.push(chosen.href as never);
            }
        } else if (commit && !g.moved && Date.now() - g.startedAt < HOLD_MS) {
            router.push('/add');
        }
    };

    // Demonstrate the 3 functionality animation once after 5s of opening the app
    useEffect(() => {
        if (hasShownOpeningAnimationThisSession) return;
        hasShownOpeningAnimationThisSession = true;

        const autoTimer = setTimeout(() => {
            if (g.open) return;
            buzz('open');
            setMenu(true);
            progress.setValue(0);
            Animated.spring(progress, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start(() => {
                setTimeout(() => {
                    if (g.open && !g.moved && !g.hover) {
                        close();
                    }
                }, 2200);
            });
        }, 5000);

        return () => clearTimeout(autoTimer);
    }, []);

    const responder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            // Once the menu is open nothing else, such as a scroll view, may take the touch away.
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (event) => {
                g.moved = false;
                g.startedAt = Date.now();
                // Where on the button the finger landed, measured from its centre.
                const { locationX, locationY } = event.nativeEvent;
                g.startX = Number.isFinite(locationX) ? locationX - BUTTON / 2 : 0;
                g.startY = Number.isFinite(locationY) ? locationY - BUTTON / 2 : 0;

                g.timer = setTimeout(() => {
                    if (g.moved) return;
                    buzz('open');
                    setMenu(true);
                    progress.setValue(0);
                    Animated.spring(progress, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start();
                }, HOLD_MS);
            },
            onPanResponderMove: (_event, gesture) => {
                if (!g.open) {
                    // Moving before the hold completes means a drag, not a press or a hold.
                    if (Math.hypot(gesture.dx, gesture.dy) > MOVE_SLOP) {
                        g.moved = true;
                        if (g.timer) clearTimeout(g.timer);
                        g.timer = null;
                    }
                    return;
                }
                const next = pickOption(g.startX + gesture.dx, g.startY + gesture.dy);
                if (next !== g.hover) {
                    g.hover = next;
                    setHover(next);
                    if (next) buzz('hover');
                }
            },
            onPanResponderRelease: () => finish(true),
            onPanResponderTerminate: () => finish(false),
        })
    ).current;

    useEffect(() => () => { if (g.timer) clearTimeout(g.timer); }, [g]);

    return (
        <View style={styles.addSlot}>
            <FabIntro />
            {open ? OPTIONS.map((option) => <QuickOptionBubble key={option.key} option={option} progress={progress} hovered={hover === option.key} />) : null}

            <View
                {...responder.panHandlers}
                collapsable={false}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Add a transaction"
                accessibilityHint="Hold and slide to earn, spend or lend"
                accessibilityActions={[
                    { name: 'activate', label: 'Add a transaction' },
                    { name: 'earn', label: 'Earn' },
                    { name: 'spend', label: 'Spend' },
                    { name: 'lend', label: 'Lend' },
                ]}
                onAccessibilityAction={(event) => {
                    const action = event.nativeEvent.actionName;
                    const option = OPTIONS.find((o) => o.key === action);
                    router.push((option ? option.href : '/add') as never);
                }}
                style={[styles.add, open && styles.addActive]}
            >
                {/* Keeps the touch target on the button itself, so the touch position is relative to it. */}
                <View pointerEvents="none">
                    <Plus size={26} color={colors.ink} strokeWidth={2.8} />
                </View>
            </View>
        </View>
    );
}

// The pill from the reference design: a floating glass capsule where the active tab gets an ink disc,
// with a larger "add" disc in the middle.
export function FloatingTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const progress = useRef(new Animated.Value(0)).current;
    const [menuOpen, setMenuOpen] = useState(false);

    const tap = () => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    };

    const items = state.routes.map((route, index) => ({ route, index, ...ICONS[route.name] })).filter((item) => item.Icon);
    const left = items.slice(0, 2);
    const right = items.slice(2);

    const { t } = useTranslation();
    const renderTab = ({ route, index, Icon, label }: (typeof items)[number]) => {
        const tabKey = ('tab_' + route.name) as any;
        const localizedLabel = t(tabKey) || label;
        const focused = state.index === index;
        return (
            <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={localizedLabel}
                accessibilityState={{ selected: focused }}
                onPress={() => {
                    tap();
                    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) navigateToTab(route.key);
                }}
                style={[styles.tab, focused && styles.tabActive]}
            >
                <Icon size={22} color={focused ? colors.white : colors.inkSoft} strokeWidth={focused ? 2.4 : 2} />
            </Pressable>
        );
    };

    return (
        <View pointerEvents="box-none" style={styles.root}>
            {menuOpen ? <Animated.View pointerEvents="none" style={[styles.dim, { height, opacity: progress }]} /> : null}

            <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 6 }]}>
                <View style={styles.bar}>
                    {left.map(renderTab)}
                    <AddButton progress={progress} onOpenChange={setMenuOpen} />
                    {right.map(renderTab)}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    // Tall enough to cover the whole screen above the bar; it never takes touches.
    dim: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,18,14,0.42)' },
    wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 9,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderWidth: 1,
        borderColor: colors.glassLine,
        ...shadow.float,
    },
    tab: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
    tabActive: { backgroundColor: colors.ink },
    addSlot: { width: BUTTON, height: BUTTON, marginHorizontal: 4 },
    add: {
        width: BUTTON,
        height: BUTTON,
        borderRadius: BUTTON / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.lemon,
        borderWidth: 2,
        borderColor: colors.white,
    },
    addActive: { backgroundColor: colors.lemonDeep, transform: [{ scale: 1.08 }] },
    intro: { position: 'absolute', left: 0, top: 0, width: BUTTON, height: BUTTON },
    introRing: { position: 'absolute', left: BUTTON / 2 - RING_SIZE / 2, top: BUTTON / 2 - RING_SIZE / 2, width: RING_SIZE, height: RING_SIZE },
    rayPivotRoot: { position: 'absolute', left: BUTTON / 2, top: BUTTON / 2, width: 0, height: 0 },
    rayPivot: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
    ray: {
        position: 'absolute',
        left: -RAY_WIDTH / 2,
        top: -(RAY_START + RAY_LENGTH),
        width: RAY_WIDTH,
        height: RAY_LENGTH,
        borderRadius: RAY_WIDTH / 2,
        backgroundColor: '#FFB800',
        shadowColor: '#FFB800',
        shadowOpacity: 0.8,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
    },
    option: { position: 'absolute', width: OPTION_SIZE, height: OPTION_SIZE, alignItems: 'center' },
    optionDisc: {
        width: OPTION_SIZE,
        height: OPTION_SIZE,
        borderRadius: OPTION_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.white,
        ...shadow.float,
    },
    optionDiscActive: { backgroundColor: colors.ink },
    // Above the circle rather than below, so a label can never land on the tab bar.
    optionLabel: { position: 'absolute', top: -30, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(14,16,15,0.78)' },
    optionLabelText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
});
