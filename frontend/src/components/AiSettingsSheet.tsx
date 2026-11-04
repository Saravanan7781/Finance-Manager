import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Check, Eye, EyeOff, Sparkles, Trash2, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Chip, ErrorBanner, Field, Glass, PillButton, Sheet, SuccessBanner, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import {
    AiProvider,
    AiSmsConfig,
    clearStoredAiConfig,
    detectProviderFromKey,
    getAiConfig,
    loadStoredAiConfig,
    PROVIDER_DEFAULTS,
    saveStoredAiConfig,
    testAiConnection,
} from '@/lib/aiSmsParser';

interface Props {
    visible: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

export function AiSettingsSheet({ visible, onClose, onSaved }: Props) {
    const [provider, setProvider] = useState<AiProvider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('');
    const [apiUrl, setApiUrl] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (visible) {
            loadStoredAiConfig().then((cfg) => {
                setProvider(cfg.provider);
                setApiKey(cfg.apiKey);
                setModel(cfg.model);
                setApiUrl(cfg.apiUrl);
                setStatusMsg(null);
            });
        }
    }, [visible]);

    const handleSelectProvider = (next: AiProvider) => {
        setProvider(next);
        const def = PROVIDER_DEFAULTS[next];
        setModel(def.model);
        setApiUrl(def.apiUrl);
        setStatusMsg(null);
    };

    const handleKeyChange = (text: string) => {
        setApiKey(text);
        setStatusMsg(null);
        const detected = detectProviderFromKey(text);
        if (detected && detected !== provider) {
            handleSelectProvider(detected);
        }
    };

    const handlePaste = async () => {
        try {
            const pasted = await Clipboard.getStringAsync();
            if (pasted && pasted.trim()) {
                Haptics.selectionAsync().catch(() => {});
                handleKeyChange(pasted.trim());
            }
        } catch {}
    };

    const handleTest = async () => {
        const trimmed = apiKey.trim();
        if (!trimmed) {
            setStatusMsg({ type: 'error', text: 'Please enter or paste an API key first' });
            return;
        }

        setTesting(true);
        setStatusMsg(null);
        try {
            const cfg: AiSmsConfig = {
                provider,
                apiKey: trimmed,
                model: model.trim() || PROVIDER_DEFAULTS[provider].model,
                apiUrl: apiUrl.trim() || PROVIDER_DEFAULTS[provider].apiUrl,
                temperature: 0.1,
            };
            const result = await testAiConnection(cfg);
            if (result.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                setStatusMsg({ type: 'success', text: result.message });
            } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                setStatusMsg({ type: 'error', text: result.message });
            }
        } catch (e) {
            setStatusMsg({ type: 'error', text: (e as Error).message || 'Connection test failed' });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveStoredAiConfig({
                provider,
                apiKey: apiKey.trim(),
                model: model.trim() || PROVIDER_DEFAULTS[provider].model,
                apiUrl: apiUrl.trim() || PROVIDER_DEFAULTS[provider].apiUrl,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onSaved?.();
            onClose();
        } catch (e) {
            setStatusMsg({ type: 'error', text: (e as Error).message || 'Failed to save configuration' });
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        try {
            await clearStoredAiConfig();
            setApiKey('');
            setModel(PROVIDER_DEFAULTS.gemini.model);
            setApiUrl(PROVIDER_DEFAULTS.gemini.apiUrl);
            setProvider('gemini');
            setStatusMsg({ type: 'success', text: 'AI key removed. Using local smart parser.' });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onSaved?.();
        } catch {}
    };

    const currentDefaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.gemini;

    return (
        <Sheet visible={visible} onClose={onClose} title="AI Assistant / API Key">
            <View style={{ gap: space.md }}>
                {/* Intro Card */}
                <Glass strong style={{ padding: space.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Sparkles size={18} color={colors.ink} />
                        <T variant="heading" style={{ fontSize: 15 }}>
                            Smart AI SMS Parsing
                        </T>
                    </View>
                    <T variant="small" color={colors.inkSoft}>
                        Paste your API key to enable high-accuracy merchant extraction and categorization for bulk SMS alerts without rebuilding the app.
                    </T>
                </Glass>

                {/* Status Banners */}
                {statusMsg?.type === 'success' && <SuccessBanner message={statusMsg.text} />}
                {statusMsg?.type === 'error' && <ErrorBanner message={statusMsg.text} />}

                {/* Provider Picker */}
                <View>
                    <T variant="tiny" color={colors.muted} style={{ marginBottom: 6 }}>
                        AI PROVIDER
                    </T>
                    <View style={styles.providerRow}>
                        {(['gemini', 'openai', 'groq', 'custom'] as AiProvider[]).map((p) => {
                            const isSelected = provider === p;
                            return (
                                <Pressable
                                    key={p}
                                    accessibilityRole="button"
                                    onPress={() => handleSelectProvider(p)}
                                    style={[styles.providerPill, isSelected && styles.providerPillActive]}
                                >
                                    <T
                                        variant="small"
                                        style={[
                                            styles.providerText,
                                            isSelected && styles.providerTextActive,
                                        ]}
                                    >
                                        {p === 'gemini' ? 'Gemini (Free)' : p === 'openai' ? 'OpenAI' : p === 'groq' ? 'Groq' : 'Custom'}
                                    </T>
                                </Pressable>
                            );
                        })}
                    </View>
                    <T variant="tiny" color={colors.inkSoft} style={{ marginTop: 4 }}>
                        {currentDefaults.hint}
                    </T>
                </View>

                {/* API Key Field */}
                <Field
                    label="API Key"
                    placeholder={provider === 'gemini' ? 'AIzaSy...' : provider === 'openai' ? 'sk-...' : 'gsk_...'}
                    value={apiKey}
                    onChangeText={handleKeyChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showKey}
                    right={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Pressable
                                onPress={() => setShowKey(!showKey)}
                                accessibilityLabel={showKey ? 'Hide key' : 'Show key'}
                                hitSlop={8}
                                style={styles.iconBtn}
                            >
                                {showKey ? <EyeOff size={16} color={colors.inkSoft} /> : <Eye size={16} color={colors.inkSoft} />}
                            </Pressable>
                            <Pressable
                                onPress={handlePaste}
                                accessibilityLabel="Paste from clipboard"
                                hitSlop={8}
                                style={styles.pasteBtn}
                            >
                                <T variant="tiny" style={{ fontFamily: fonts.bold, color: colors.ink }}>
                                    PASTE
                                </T>
                            </Pressable>
                        </View>
                    }
                />

                {/* Model Presets */}
                <View>
                    <T variant="tiny" color={colors.muted} style={{ marginBottom: 6 }}>
                        MODEL
                    </T>
                    <View style={styles.modelChips}>
                        {provider === 'gemini' && (
                            <>
                                <Chip label="gemini-1.5-flash" active={model === 'gemini-1.5-flash'} onPress={() => setModel('gemini-1.5-flash')} />
                                <Chip label="gemini-2.0-flash" active={model === 'gemini-2.0-flash'} onPress={() => setModel('gemini-2.0-flash')} />
                            </>
                        )}
                        {provider === 'openai' && (
                            <>
                                <Chip label="gpt-4o-mini" active={model === 'gpt-4o-mini'} onPress={() => setModel('gpt-4o-mini')} />
                                <Chip label="gpt-4o" active={model === 'gpt-4o'} onPress={() => setModel('gpt-4o')} />
                            </>
                        )}
                        {provider === 'groq' && (
                            <>
                                <Chip label="llama-3.1-8b-instant" active={model === 'llama-3.1-8b-instant'} onPress={() => setModel('llama-3.1-8b-instant')} />
                            </>
                        )}
                    </View>
                </View>

                {/* Custom URL (only if Custom selected) */}
                {provider === 'custom' && (
                    <Field
                        label="Completions Endpoint URL"
                        placeholder="https://your-custom-endpoint/v1/chat/completions"
                        value={apiUrl}
                        onChangeText={setApiUrl}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                )}

                {/* Helpful Link */}
                {provider === 'gemini' && (
                    <Pressable
                        onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey').catch(() => {})}
                        style={{ alignSelf: 'flex-start', paddingVertical: 2 }}
                    >
                        <T variant="small" color={colors.income} style={{ textDecorationLine: 'underline' }}>
                            Get a free Google Gemini key →
                        </T>
                    </Pressable>
                )}

                {/* Action Buttons */}
                <View style={{ gap: space.sm, marginTop: space.sm }}>
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                        <PillButton
                            label={testing ? 'Testing...' : 'Test Key'}
                            Icon={Zap}
                            variant="glass"
                            onPress={handleTest}
                            disabled={testing || saving || !apiKey.trim()}
                            style={{ flex: 1, minHeight: 46 }}
                        />
                        <PillButton
                            label={saving ? 'Saving...' : 'Save Configuration'}
                            Icon={Check}
                            variant="ink"
                            onPress={handleSave}
                            disabled={testing || saving}
                            style={{ flex: 1.3, minHeight: 46 }}
                        />
                    </View>

                    {apiKey.trim().length > 0 && (
                        <Pressable
                            accessibilityRole="button"
                            onPress={handleClear}
                            style={styles.clearBtn}
                        >
                            <Trash2 size={14} color={colors.expense} />
                            <T variant="small" color={colors.expense} style={{ fontFamily: fonts.semibold }}>
                                Clear API Key & use offline parser
                            </T>
                        </Pressable>
                    )}
                </View>
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    providerRow: {
        flexDirection: 'row',
        gap: 6,
    },
    providerPill: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(0,0,0,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    providerPillActive: {
        backgroundColor: colors.ink,
    },
    providerText: {
        fontSize: 12,
        fontFamily: fonts.medium,
        color: colors.inkSoft,
    },
    providerTextActive: {
        color: colors.white,
        fontFamily: fonts.bold,
    },
    iconBtn: {
        padding: 6,
    },
    pasteBtn: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.sm,
        backgroundColor: 'rgba(0,0,0,0.06)',
    },
    modelChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    clearBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
    },
});
