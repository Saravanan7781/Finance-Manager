import { ArrowUp, Check, RotateCcw, Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
    type ScrollViewInstance,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/Header';
import { ErrorBanner, Loading, Screen, Skeleton, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import {
    askFinancialAi,
    executeAiAction,
    undoAiAction,
    SUGGESTIONS,
    SUGGESTIONS_TA,
    type ExecutedActionInfo,
} from '@/lib/ask';
import { monthKey, tzOffset } from '@/lib/format';
import { useTranslation } from '@/lib/i18n';
import { isAiApiConfigured } from '@/lib/aiSmsParser';

interface Message {
    id: number;
    from: 'me' | 'bot';
    text: string;
    executedAction?: ExecutedActionInfo | null;
    undone?: boolean;
}

function Orb({ size = 28 }: { size?: number }) {
    return (
        <Svg width={size} height={size}>
            <Defs>
                <RadialGradient id="orb" cx="35%" cy="30%" rx="75%" ry="75%">
                    <Stop offset="0" stopColor="#FFD9B0" />
                    <Stop offset="0.45" stopColor="#FF7A2A" />
                    <Stop offset="1" stopColor="#8A2B05" />
                </RadialGradient>
            </Defs>
            <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#orb)" />
        </Svg>
    );
}

export default function Ask() {
    const { t, lang } = useTranslation();
    const familyId = useFamilyId();
    const insets = useSafeAreaInsets();
    const scroller = useRef<ScrollViewInstance>(null);

    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const sub1 = Keyboard.addListener(showEvent, () => {
            setKeyboardOpen(true);
            setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 100);
        });
        const sub2 = Keyboard.addListener(hideEvent, () => {
            setKeyboardOpen(false);
        });
        return () => {
            sub1.remove();
            sub2.remove();
        };
    }, []);

    const { data, loading, error, reload } = useAsync(async () => {
        const [summary, loans, goals, budgets] = await Promise.all([
            api.summary(familyId, monthKey(), tzOffset()),
            api.loans(familyId),
            api.goals(familyId),
            api.budgets(familyId),
        ]);
        return { summary, loans, goals, budgets };
    }, [familyId]);

    const handleUndo = async (messageId: number, undoTarget: { entityId: string; type: string }) => {
        try {
            await undoAiAction(undoTarget);
            setMessages((prev) =>
                prev.map((msg) => (msg.id === messageId ? { ...msg, undone: true } : msg))
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            reload();
        } catch (e) {
            console.warn('Undo failed:', e);
        }
    };

    const send = async (text: string) => {
        const question = text.trim();
        if (!question || !data || isTyping) return;

        const nextId = messages.length;
        const updatedMessages: Message[] = [...messages, { id: nextId, from: 'me', text: question }];
        setMessages(updatedMessages);
        setDraft('');
        setIsTyping(true);

        setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);

        try {
            const result = await askFinancialAi(question, data, updatedMessages);
            let executed: ExecutedActionInfo | null = null;

            if (result.action && familyId) {
                try {
                    executed = await executeAiAction(result.action, familyId, data);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    reload();
                } catch (actionErr: any) {
                    console.warn('Action execution error:', actionErr);
                }
            }

            setMessages((m) => [
                ...m,
                {
                    id: nextId + 1,
                    from: 'bot',
                    text: result.reply,
                    executedAction: executed,
                },
            ]);
        } catch {
            setMessages((m) => [
                ...m,
                { id: nextId + 1, from: 'bot', text: 'Sorry, I ran into an error. Please check your network or AI key.' },
            ]);
        } finally {
            setIsTyping(false);
            setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 100);
        }
    };

    const suggestions = lang === 'ta' ? SUGGESTIONS_TA : SUGGESTIONS;
    const aiActive = isAiApiConfigured();

    return (
        <Screen variant="ember" scroll={false} contentStyle={{ paddingBottom: 0 }} keyboard={false}>
            <View style={{ paddingHorizontal: space.lg }}>
                <Header
                    close
                    dark
                    title={t('ask_title') || 'Ask AI'}
                />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    ref={scroller}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                >
                    <ErrorBanner message={error} onRetry={reload} />
                    {loading && !data ? (
                        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: space.xl, gap: 12 }}>
                            <Skeleton width={110} height={24} radius={12} dark />
                            <Skeleton width="65%" height={32} dark />
                            <Skeleton width="85%" height={16} dark />
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: space.sm }}>
                                <Skeleton width={150} height={85} radius={radius.lg} dark />
                                <Skeleton width={150} height={85} radius={radius.lg} dark />
                            </View>
                        </View>
                    ) : null}

                    {messages.length === 0 && data ? (
                        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: space.xl }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Sparkles size={20} color={colors.ember3} />
                                <View style={styles.aiBadge}>
                                    <T variant="tiny" style={{ color: colors.lemon, fontFamily: fonts.bold }}>
                                        AI ASSISTANT
                                    </T>
                                </View>
                            </View>
                            <T variant="display" color={colors.white} style={{ marginTop: space.md, marginBottom: space.sm }}>
                                {t('what_to_know') || 'What do you want to do?'}
                            </T>
                            <T variant="small" color="rgba(255,255,255,0.62)" style={{ marginBottom: space.xl }}>
                                {t('ask_subtitle') || 'Ask questions about your money or tell me to record transactions, loans, and goals in English or Tamil.'}
                            </T>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={{ flexGrow: 0, marginHorizontal: -space.lg }}
                                contentContainerStyle={{ gap: 10, alignItems: 'flex-start', paddingRight: space.lg }}
                            >
                                <View style={{ width: space.lg - 10 }} />
                                {suggestions.map((s) => (
                                    <Pressable key={s} accessibilityRole="button" onPress={() => send(s)} style={styles.suggestion}>
                                        <Sparkles size={15} color={colors.ember3} />
                                        <T variant="small" color={colors.white} style={{ marginTop: 8, fontFamily: fonts.semibold }}>
                                            {s}
                                        </T>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        </View>
                    ) : null}

                    {messages.map((m) =>
                        m.from === 'me' ? (
                            <LinearGradient
                                key={m.id}
                                colors={[colors.ember2, '#C2410C']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.bubble, styles.mine]}
                            >
                                <T variant="body" color={colors.white}>
                                    {m.text}
                                </T>
                            </LinearGradient>
                        ) : (
                            <View key={m.id} style={styles.botRow}>
                                <Orb />
                                <View style={{ flex: 1, maxWidth: '86%' }}>
                                    <View style={[styles.bubble, styles.theirs]}>
                                        <T variant="body" color="rgba(255,255,255,0.92)">
                                            {m.text}
                                        </T>
                                    </View>

                                    {m.executedAction && (
                                        <View style={[styles.actionCard, m.undone && styles.actionCardUndone]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                <View
                                                    style={[
                                                        styles.actionIconCircle,
                                                        m.undone && { backgroundColor: 'rgba(255,255,255,0.1)' },
                                                    ]}
                                                >
                                                    {m.undone ? (
                                                        <RotateCcw size={12} color="rgba(255,255,255,0.5)" />
                                                    ) : (
                                                        <Check size={14} color="#10B981" strokeWidth={2.8} />
                                                    )}
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <T
                                                        variant="small"
                                                        style={{
                                                            color: m.undone ? 'rgba(255,255,255,0.45)' : colors.white,
                                                            fontFamily: fonts.semibold,
                                                            textDecorationLine: m.undone ? 'line-through' : 'none',
                                                        }}
                                                    >
                                                        {m.undone ? `Undone: ${m.executedAction.label}` : m.executedAction.label}
                                                    </T>
                                                    {m.executedAction.details && !m.undone ? (
                                                        <T variant="tiny" style={{ color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                                                            {m.executedAction.details}
                                                        </T>
                                                    ) : null}
                                                </View>
                                            </View>

                                            {m.executedAction.undoTarget && !m.undone ? (
                                                <Pressable
                                                    accessibilityRole="button"
                                                    onPress={() => handleUndo(m.id, m.executedAction!.undoTarget!)}
                                                    style={styles.undoBtn}
                                                >
                                                    <RotateCcw size={12} color={colors.ember3} />
                                                    <T variant="tiny" style={{ color: colors.ember3, fontFamily: fonts.semibold }}>
                                                        Undo
                                                    </T>
                                                </Pressable>
                                            ) : null}
                                        </View>
                                    )}
                                </View>
                            </View>
                        )
                    )}

                    {/* Typing indicator */}
                    {isTyping && (
                        <View style={styles.botRow}>
                            <Orb />
                            <View style={[styles.bubble, styles.theirs, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }]}>
                                <ActivityIndicator size="small" color={colors.ember3} />
                                <T variant="small" color="rgba(255,255,255,0.7)">
                                    {t('thinking') || 'Thinking...'}
                                </T>
                            </View>
                        </View>
                    )}
                </ScrollView>

                <View style={[styles.inputBar, { paddingBottom: keyboardOpen ? 12 : Math.max(insets.bottom, 12) }]}>
                    <TextInput
                        accessibilityLabel="Ask a question"
                        value={draft}
                        onChangeText={setDraft}
                        onSubmitEditing={() => send(draft)}
                        placeholder={t('ask_money_hint') || 'Ask or tell: "Spent ₹250 on lunch"'}
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        returnKeyType="send"
                        style={styles.input}
                    />
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Send"
                        onPress={() => send(draft)}
                        disabled={!draft.trim() || !data || isTyping}
                        style={[styles.send, (!draft.trim() || !data || isTyping) && { opacity: 0.45 }]}
                    >
                        <ArrowUp size={20} color={colors.white} strokeWidth={2.8} />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    aiBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(254, 240, 138, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(254, 240, 138, 0.4)',
    },
    suggestion: {
        width: 172,
        minHeight: 104,
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: 'rgba(10,6,4,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    bubble: {
        paddingVertical: 12,
        paddingHorizontal: space.lg,
        borderRadius: 22,
        marginBottom: 12,
        maxWidth: '86%',
    },
    mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
    theirs: {
        backgroundColor: 'rgba(10,6,4,0.62)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderBottomLeftRadius: 6,
        marginBottom: 0,
        maxWidth: '100%',
    },
    botRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
    actionCard: {
        marginTop: 6,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 14,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    actionCardUndone: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.08)',
    },
    actionIconCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    undoBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(255, 122, 42, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255, 122, 42, 0.3)',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: space.lg,
        paddingTop: 10,
    },
    input: {
        flex: 1,
        minHeight: 52,
        borderRadius: 26,
        paddingHorizontal: space.xl,
        backgroundColor: 'rgba(10,6,4,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        color: colors.white,
        fontFamily: fonts.medium,
        fontSize: 15,
    },
    send: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: colors.ember2,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
