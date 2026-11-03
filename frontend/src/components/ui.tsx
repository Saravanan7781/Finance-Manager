import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    AccessibilityInfo,
    ActivityIndicator,
    Animated,
    Dimensions,
    Easing,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    type DimensionValue,
    type StyleProp,
    type TextInputProps,
    type TextProps,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, gradients, radius, shadow, space } from '@/constants/theme';
import { splitMoney } from '@/lib/format';

const tap = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/* ------------------------------------------------------------------ Text */

type Variant = 'display' | 'title' | 'heading' | 'body' | 'small' | 'tiny';

const textStyles: Record<Variant, TextStyle> = {
    display: { fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 46, letterSpacing: -1 },
    title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
    heading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
    body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
    small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
    tiny: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
};

export function T({ variant = 'body', color = colors.ink, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
    return <Text {...rest} style={[textStyles[variant], { color }, style]} />;
}

// Keys that have already counted up since the app launched. It lives outside React on purpose, so
// moving between tabs or reloading data never replays the animation; the next launch starts it fresh.
const countedUp = new Set<string>();

// Counts from 0 to `value` the first time `key` shows a non-zero figure in this launch. After that,
// and for anything without a key, it simply follows `value`. Skipped when reduced motion is on.
export function useCountUp(value: number, key?: string, duration = 1200) {
    const fresh = (v: number) => !!key && !countedUp.has(key) && v !== 0;
    const [shown, setShown] = useState(() => (fresh(value) ? 0 : value));
    const running = useRef(false);
    const mounted = useRef(true);
    const target = useRef(value);
    target.current = value;

    useEffect(() => () => { mounted.current = false; }, []);

    useEffect(() => {
        if (running.current) return;
        if (!fresh(value)) {
            setShown(value);
            return;
        }

        countedUp.add(key!);
        running.current = true;
        const progress = new Animated.Value(0);

        AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
            if (reduce) {
                running.current = false;
                if (mounted.current) setShown(target.current);
                return;
            }
            progress.addListener(({ value: p }) => {
                if (mounted.current) setShown(target.current * p);
            });
            Animated.timing(progress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
                progress.removeAllListeners();
                running.current = false;
                if (mounted.current) setShown(target.current);
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return shown;
}

// A money figure whose cents sit muted beside the whole part, as in the expense sheet reference.
// Give it an `animateKey` to have it count up once per launch.
export function Amount({
    value,
    size = 44,
    color = colors.ink,
    mutedColor = colors.faint,
    hidden = false,
    animateKey,
    style,
}: {
    value: number;
    size?: number;
    color?: string;
    mutedColor?: string;
    hidden?: boolean;
    animateKey?: string;
    style?: StyleProp<TextStyle>;
}) {
    const shown = useCountUp(value, animateKey);
    const { sign, whole, cents } = splitMoney(shown);
    const base: TextStyle = { fontFamily: fonts.extrabold, fontSize: size, lineHeight: size * 1.12, letterSpacing: -size / 28 };
    if (hidden) return <Text style={[base, { color }, style]}>••••••</Text>;
    return (
        <Text style={[base, { color }, style]} numberOfLines={1} adjustsFontSizeToFit>
            {sign}
            {whole}
            <Text style={{ color: mutedColor }}>{cents}</Text>
        </Text>
    );
}

/* ---------------------------------------------------------------- Screen */

interface ScreenProps {
    children: ReactNode;
    variant?: 'mint' | 'blue' | 'ember' | 'plain';
    scroll?: boolean;
    refreshing?: boolean;
    onRefresh?: () => void;
    bottomInset?: number;
    contentStyle?: StyleProp<ViewStyle>;
    keyboard?: boolean;
}

export function Screen({
    children,
    variant = 'mint',
    scroll = true,
    refreshing = false,
    onRefresh,
    bottomInset = 0,
    contentStyle,
    keyboard = false,
}: ScreenProps) {
    const insets = useSafeAreaInsets();
    const padding = { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl + bottomInset };

    const body = scroll ? (
        <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, padding, contentStyle]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
                onRefresh ? (
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={variant === 'mint' ? colors.ink : colors.white}
                    />
                ) : undefined
            }
        >
            {children}
        </ScrollView>
    ) : (
        <View style={[styles.flex, padding, contentStyle]}>{children}</View>
    );

    const content = keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {body}
        </KeyboardAvoidingView>
    ) : (
        body
    );

    return (
        <View style={styles.flex}>
            {variant === 'plain' ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.mint0 }]} />
            ) : (
                <LinearGradient
                    colors={gradients[variant]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            )}
            {variant === 'mint' && (
                <>
                    <View style={[styles.blob, { top: -120, right: -90, width: 300, height: 300 }]} />
                    <View style={[styles.blob, { bottom: 140, left: -140, width: 320, height: 320, opacity: 0.35 }]} />
                </>
            )}
            {content}
        </View>
    );
}

/* ----------------------------------------------------------------- Cards */

export function Glass({ children, style, strong = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; strong?: boolean }) {
    return <View style={[styles.glass, strong && styles.glassStrong, style]}>{children}</View>;
}

/* --------------------------------------------------------------- Buttons */

export function PillButton({
    label,
    onPress,
    variant = 'ink',
    loading = false,
    disabled = false,
    Icon,
    style,
}: {
    label: string;
    onPress: () => void;
    variant?: 'ink' | 'lemon' | 'glass' | 'danger' | 'light';
    loading?: boolean;
    disabled?: boolean;
    Icon?: LucideIcon;
    style?: StyleProp<ViewStyle>;
}) {
    const palette = {
        ink: { bg: colors.ink, fg: colors.white },
        lemon: { bg: colors.lemon, fg: colors.ink },
        glass: { bg: colors.glass, fg: colors.ink },
        light: { bg: colors.white, fg: colors.ink },
        danger: { bg: 'rgba(179,38,30,0.12)', fg: colors.expense },
    }[variant];

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled || loading}
            onPress={() => {
                tap();
                onPress();
            }}
            style={({ pressed }) => [
                styles.pill,
                { backgroundColor: palette.bg, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={palette.fg} />
            ) : (
                <>
                    {Icon ? <Icon size={18} color={palette.fg} strokeWidth={2.4} /> : null}
                    <Text style={[textStyles.heading, { color: palette.fg, fontSize: 15 }]}>{label}</Text>
                </>
            )}
        </Pressable>
    );
}

export function IconButton({
    Icon,
    onPress,
    label,
    tone = 'glass',
    size = 44,
    badge = false,
    disabled = false,
}: {
    Icon: LucideIcon;
    onPress: () => void;
    label: string;
    tone?: 'glass' | 'ink' | 'onDark';
    size?: number;
    badge?: boolean;
    disabled?: boolean;
}) {
    const bg = tone === 'ink' ? colors.ink : tone === 'onDark' ? 'rgba(255,255,255,0.16)' : colors.glassStrong;
    const fg = tone === 'glass' ? colors.ink : colors.white;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => {
                tap();
                onPress();
            }}
            style={({ pressed }) => [
                styles.iconButton,
                // A disabled button stays visible but clearly frozen.
                { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, opacity: disabled ? 0.3 : pressed ? 0.75 : 1 },
            ]}
        >
            <Icon size={size * 0.46} color={fg} strokeWidth={2.2} />
            {badge ? <View style={styles.badge} /> : null}
        </Pressable>
    );
}

export function Chip({
    label,
    active,
    onPress,
    Icon,
    dark = false,
}: {
    label: string;
    active?: boolean;
    onPress?: () => void;
    Icon?: LucideIcon;
    dark?: boolean;
}) {
    const bg = active ? (dark ? colors.white : colors.ink) : dark ? 'rgba(255,255,255,0.14)' : colors.glass;
    const fg = active ? (dark ? colors.ink : colors.white) : dark ? colors.white : colors.ink;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !!active }}
            onPress={() => {
                tap();
                onPress?.();
            }}
            style={[styles.chip, { backgroundColor: bg }]}
        >
            {Icon ? <Icon size={15} color={fg} strokeWidth={2.4} /> : null}
            <Text style={[textStyles.small, { color: fg, fontFamily: fonts.semibold }]}>{label}</Text>
        </Pressable>
    );
}

export function Segmented<V extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: V; label: string }[];
    value: V;
    onChange: (value: V) => void;
}) {
    return (
        <View style={styles.segmented}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                            tap();
                            onChange(option.value);
                        }}
                        style={[styles.segment, active && styles.segmentActive]}
                    >
                        <Text style={[textStyles.small, { fontFamily: fonts.bold, color: active ? colors.white : colors.inkSoft }]}>
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/* ----------------------------------------------------------------- Forms */

export function Field({
    label,
    error,
    style,
    dark = false,
    right,
    ...input
}: TextInputProps & {
    label: string;
    error?: string | null;
    dark?: boolean;
    style?: StyleProp<ViewStyle>;
    right?: ReactNode;
}) {
    return (
        <View style={style}>
            <T variant="tiny" color={dark ? 'rgba(255,255,255,0.7)' : colors.muted} style={styles.fieldLabel}>
                {label.toUpperCase()}
            </T>
            <View style={{ position: 'relative', justifyContent: 'center' }}>
                <TextInput
                    placeholderTextColor={colors.faint}
                    {...input}
                    accessibilityLabel={label}
                    style={[
                        styles.input,
                        input.multiline && { minHeight: 76, textAlignVertical: 'top', paddingTop: 14 },
                        error ? { borderColor: colors.expense } : null,
                        right ? { paddingRight: 50 } : null,
                    ]}
                />
                {right ? (
                    <View style={{ position: 'absolute', right: 10 }}>
                        {right}
                    </View>
                ) : null}
            </View>
            {error ? (
                <T variant="small" color={colors.expense} style={{ marginTop: 4 }}>
                    {error}
                </T>
            ) : null}
        </View>
    );
}

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
    if (!message) return null;
    return (
        <View style={styles.errorBanner} accessibilityRole="alert">
            <T variant="small" color={colors.expense} style={{ flex: 1 }}>
                {message}
            </T>
            {onRetry ? (
                <Pressable onPress={onRetry} accessibilityRole="button">
                    <T variant="small" color={colors.expense} style={{ fontFamily: fonts.bold }}>
                        Retry
                    </T>
                </Pressable>
            ) : null}
        </View>
    );
}

export function SuccessBanner({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <View style={styles.successBanner} accessibilityLiveRegion="polite">
            <T variant="small" color={colors.income} style={{ flex: 1, fontFamily: fonts.semibold }}>
                {message}
            </T>
        </View>
    );
}

/* ---------------------------------------------------------------- Avatar */

const AVATAR_TINTS = ['#FFD7A8', '#BFD9FF', '#D5F0C8', '#F6C9E0', '#E3D2FF', '#FFF0A8'];

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
    const tint = AVATAR_TINTS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_TINTS.length];
    const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
    return (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[textStyles.heading, { color: colors.ink, fontSize: size * 0.38 }]}>{letters}</Text>
        </View>
    );
}

/* ------------------------------------------------------------- Progress */

export function Progress({ value, tint = colors.ink, track = 'rgba(14,16,15,0.1)', height = 8 }: { value: number; tint?: string; track?: string; height?: number }) {
    const pct = Math.max(0, Math.min(1, value));
    return (
        <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
            <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height, backgroundColor: tint }} />
        </View>
    );
}

/* ----------------------------------------------------------- Empty / load */

// A softly pulsing placeholder shaped like the content it stands in for while data loads.
export function Skeleton({
    width,
    height,
    radius: corner = 10,
    dark = false,
    style,
}: {
    width?: DimensionValue;
    height: number;
    radius?: number;
    dark?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const pulse = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.5, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulse]);

    return (
        <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[{ width, height, borderRadius: corner, backgroundColor: dark ? 'rgba(255,255,255,0.2)' : 'rgba(14,16,15,0.09)', opacity: pulse }, style]}
        />
    );
}

export function Empty({ title, hint, Icon }: { title: string; hint?: string; Icon?: LucideIcon }) {
    return (
        <View style={styles.empty}>
            {Icon ? <Icon size={30} color={colors.muted} strokeWidth={1.8} /> : null}
            <T variant="heading" style={{ marginTop: space.md, textAlign: 'center' }}>
                {title}
            </T>
            {hint ? (
                <T variant="small" color={colors.muted} style={{ marginTop: 4, textAlign: 'center' }}>
                    {hint}
                </T>
            ) : null}
        </View>
    );
}

export function Loading({ dark = false, hint }: { dark?: boolean; hint?: string }) {
    const rotate = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const spinAnim = Animated.loop(
            Animated.timing(rotate, {
                toValue: 1,
                duration: 1200,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        const pulseAnim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 850,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0,
                    duration: 850,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );

        spinAnim.start();
        pulseAnim.start();

        return () => {
            spinAnim.stop();
            pulseAnim.stop();
        };
    }, [rotate, pulse]);

    const spin = rotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const scale = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.9, 1.1],
    });

    const glowOpacity = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.35, 0.75],
    });

    const ringColor = dark ? colors.white : colors.ink;
    const accentColor = colors.lemon;

    return (
        <View style={styles.loadingContainer}>
            <View style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
                {/* Outer breathing aura */}
                <Animated.View
                    style={[
                        styles.loadingGlow,
                        {
                            opacity: glowOpacity,
                            transform: [{ scale }],
                            backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(247, 242, 107, 0.45)',
                        },
                    ]}
                />

                {/* Rotating dual-orbital arcs */}
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <Svg width={72} height={72} viewBox="0 0 72 72">
                        <Circle
                            cx={36}
                            cy={36}
                            r={30}
                            stroke={dark ? 'rgba(255,255,255,0.18)' : 'rgba(14,16,15,0.1)'}
                            strokeWidth={3.5}
                            fill="none"
                        />
                        <Circle
                            cx={36}
                            cy={36}
                            r={30}
                            stroke={ringColor}
                            strokeWidth={4}
                            strokeLinecap="round"
                            strokeDasharray="45 145"
                            fill="none"
                        />
                        <Circle
                            cx={36}
                            cy={36}
                            r={30}
                            stroke={accentColor}
                            strokeWidth={4}
                            strokeLinecap="round"
                            strokeDasharray="25 165"
                            strokeDashoffset={-95}
                            fill="none"
                        />
                    </Svg>
                </Animated.View>

                {/* Center breathing gem */}
                <Animated.View
                    style={[
                        styles.loadingCore,
                        {
                            transform: [{ scale }],
                            backgroundColor: dark ? colors.white : colors.ink,
                        },
                    ]}
                >
                    <View style={[styles.loadingCoreDot, { backgroundColor: accentColor }]} />
                </Animated.View>
            </View>

            {hint ? (
                <T variant="small" color={dark ? colors.faint : colors.muted} style={{ marginTop: space.md, textAlign: 'center' }}>
                    {hint}
                </T>
            ) : null}
        </View>
    );
}

// Rows fade and rise in one after another so a list feels like it is settling into place.
export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
    const progress = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(progress, {
            toValue: 1,
            duration: 420,
            delay: Math.min(index, 8) * 55,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [index, progress]);

    return (
        <Animated.View
            style={[
                style,
                { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
            ]}
        >
            {children}
        </Animated.View>
    );
}

/* ----------------------------------------------------------------- Sheet */

export function Sheet({
    visible,
    onClose,
    title,
    children,
}: {
    visible: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}) {
    const insets = useSafeAreaInsets();
    const windowHeight = Dimensions.get('window').height;
    const maxSheetHeight = Math.min(windowHeight * 0.88, 720);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.sheetRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close" />
                <View style={[styles.sheet, { maxHeight: maxSheetHeight, paddingBottom: insets.bottom + space.md }]}>
                    <View style={styles.sheetHandle} />
                    <T variant="title" style={{ marginBottom: space.md }}>
                        {title}
                    </T>
                    <ScrollView
                        style={{ flexShrink: 1 }}
                        showsVerticalScrollIndicator={true}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: space.xl }}
                        bounces={false}
                        nestedScrollEnabled
                    >
                        {children}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

export function SectionHeader({ title, action, onAction, dark = false }: { title: string; action?: string; onAction?: () => void; dark?: boolean }) {
    return (
        <View style={styles.sectionHeader}>
            <T variant="heading" color={dark ? colors.white : colors.ink}>
                {title}
            </T>
            {action ? (
                <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
                    <T variant="small" color={dark ? 'rgba(255,255,255,0.7)' : colors.muted} style={{ fontFamily: fonts.semibold }}>
                        {action}
                    </T>
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    scrollContent: { paddingHorizontal: space.lg, flexGrow: 1 },
    blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.5)' },
    glass: {
        backgroundColor: colors.glass,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.glassLine,
        padding: space.lg,
        ...shadow.card,
    },
    glassStrong: { backgroundColor: colors.glassStrong },
    pill: {
        minHeight: 52,
        borderRadius: radius.pill,
        paddingHorizontal: space.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
    },
    iconButton: { alignItems: 'center', justifyContent: 'center' },
    badge: {
        position: 'absolute',
        top: 9,
        right: 10,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#FF4D2E',
        borderWidth: 1.5,
        borderColor: colors.white,
    },
    chip: {
        minHeight: 38,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    segmented: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(14,16,15,0.08)',
    },
    segment: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    segmentActive: { backgroundColor: colors.ink },
    fieldLabel: { marginBottom: 6, marginLeft: 4 },
    input: {
        minHeight: 52,
        borderRadius: radius.md,
        paddingHorizontal: space.lg,
        backgroundColor: colors.glassStrong,
        borderWidth: 1,
        borderColor: colors.hairline,
        fontFamily: fonts.medium,
        fontSize: 16,
        color: colors.ink,
    },
    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(179,38,30,0.1)',
        marginBottom: space.md,
    },
    successBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(31,143,70,0.12)',
        marginBottom: space.md,
    },
    empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl * 1.5, paddingHorizontal: space.xl },
    loadingContainer: {
        flex: 1,
        minHeight: 280,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: space.xxl,
    },
    loadingGlow: {
        position: 'absolute',
        width: 78,
        height: 78,
        borderRadius: 39,
    },
    loadingCore: {
        position: 'absolute',
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.card,
    },
    loadingCoreDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    sheetRoot: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,12,10,0.45)' },
    sheet: {
        backgroundColor: colors.white,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingHorizontal: space.xl,
        paddingTop: space.md,
        flexShrink: 1,
    },
    sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.hairline, marginBottom: space.lg },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md, marginTop: space.xl },
});
