import { ArrowUp, Sparkles } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/Header';
import { ErrorBanner, Loading, Screen, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { answer, SUGGESTIONS } from '@/lib/ask';
import { monthKey, tzOffset } from '@/lib/format';

interface Message {
    id: number;
    from: 'me' | 'bot';
    text: string;
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
    const familyId = useFamilyId();
    const insets = useSafeAreaInsets();
    const scroller = useRef<ScrollViewInstance>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState('');

    const { data, loading, error, reload } = useAsync(async () => {
        const [summary, loans, goals, budgets] = await Promise.all([
            api.summary(familyId, monthKey(), tzOffset()),
            api.loans(familyId),
            api.goals(familyId),
            api.budgets(familyId),
        ]);
        return { summary, loans, goals, budgets };
    }, [familyId]);

    const send = (text: string) => {
        const question = text.trim();
        if (!question || !data) return;
        const next = messages.length;
        setMessages((m) => [...m, { id: next, from: 'me', text: question }, { id: next + 1, from: 'bot', text: answer(question, data) }]);
        setDraft('');
        setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    };

    return (
        <Screen variant="ember" scroll={false} contentStyle={{ paddingBottom: 0 }}>
            <View style={{ paddingHorizontal: space.lg }}>
                <Header close dark title="Ask" />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    ref={scroller}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <ErrorBanner message={error} onRetry={reload} />
                    {loading && !data ? <Loading dark /> : null}

                    {messages.length === 0 && data ? (
                        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: space.xl }}>
                            <Sparkles size={22} color={colors.ember3} />
                            <T variant="display" color={colors.white} style={{ marginTop: space.md, marginBottom: space.sm }}>What do you want to know?</T>
                            <T variant="small" color="rgba(255,255,255,0.62)" style={{ marginBottom: space.xl }}>
                                Answers come from your family's own numbers. It understands common questions and nothing more.
                            </T>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                // A ScrollView grows to fill spare height by default, which stretched the cards into tall slabs.
                                style={{ flexGrow: 0, marginHorizontal: -space.lg }}
                                contentContainerStyle={{ gap: 10, alignItems: 'flex-start', paddingRight: space.lg }}
                            >
                                <View style={{ width: space.lg - 10 }} />
                                {SUGGESTIONS.map((s) => (
                                    <Pressable key={s} accessibilityRole="button" onPress={() => send(s)} style={styles.suggestion}>
                                        <Sparkles size={15} color={colors.ember3} />
                                        <T variant="small" color={colors.white} style={{ marginTop: 8, fontFamily: fonts.semibold }}>{s}</T>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        </View>
                    ) : null}

                    {messages.map((m) =>
                        m.from === 'me' ? (
                            <LinearGradient key={m.id} colors={[colors.ember2, '#C2410C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.mine]}>
                                <T variant="body" color={colors.white}>{m.text}</T>
                            </LinearGradient>
                        ) : (
                            <View key={m.id} style={styles.botRow}>
                                <Orb />
                                <View style={[styles.bubble, styles.theirs]}>
                                    <T variant="body" color="rgba(255,255,255,0.92)">{m.text}</T>
                                </View>
                            </View>
                        )
                    )}
                </ScrollView>

                <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    <TextInput
                        accessibilityLabel="Ask a question"
                        value={draft}
                        onChangeText={setDraft}
                        onSubmitEditing={() => send(draft)}
                        placeholder="Ask about your money"
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        returnKeyType="send"
                        style={styles.input}
                    />
                    <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => send(draft)} disabled={!draft.trim() || !data} style={[styles.send, (!draft.trim() || !data) && { opacity: 0.45 }]}>
                        <ArrowUp size={20} color={colors.white} strokeWidth={2.8} />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    suggestion: {
        width: 168,
        minHeight: 104,
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: 'rgba(10,6,4,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    bubble: { paddingVertical: 12, paddingHorizontal: space.lg, borderRadius: 22, marginBottom: 12, maxWidth: '86%' },
    mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
    theirs: { backgroundColor: 'rgba(10,6,4,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 6, marginBottom: 0 },
    botRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
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
    send: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.ember2, alignItems: 'center', justifyContent: 'center' },
});
