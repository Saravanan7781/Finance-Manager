import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Calendar, MessageSquare, Plus, Sparkles, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, TextInput, View } from 'react-native';
import { DatePickerSheet } from '@/components/DatePickerSheet';
import { Header } from '@/components/Header';
import { Chip, ErrorBanner, Field, Glass, IconButton, PillButton, Screen, Segmented, SuccessBanner, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { api } from '@/lib/api';
import { categoriesFor, normalizeCategory, PAYMENT_METHODS } from '@/lib/categories';
import { confirmAction } from '@/lib/dialog';
import { CURRENCY } from '@/lib/config';
import { formatAmountInput, fromDateInput, parseAmountInput, toDateInput } from '@/lib/format';
import { parseBankSms } from '@/lib/sms';
import type { CustomCategory, TxType } from '@/lib/types';

export default function AddTransaction() {
    const params = useLocalSearchParams<{
        type?: string;
        id?: string;
        amount?: string;
        category?: string;
        description?: string;
        paymentMethod?: string;
        date?: string;
        countForNextMonth?: string;
    }>();
    const familyId = useFamilyId();
    const editing = params.id;

    const [type, setType] = useState<TxType>(params.type === 'income' ? 'income' : 'expense');
    const [amount, setAmount] = useState(params.amount ? formatAmountInput(String(params.amount)) : '');
    const [category, setCategory] = useState(params.category ? normalizeCategory(params.category) : '');
    const [description, setDescription] = useState(params.description ?? '');
    const [method, setMethod] = useState<string | null>(params.paymentMethod || null);
    const [dateText, setDateText] = useState(
        params.date ? toDateInput(new Date(params.date)) : toDateInput(new Date())
    );
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [addAnother, setAddAnother] = useState(false);
    const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
    const [dedupeKey, setDedupeKey] = useState<string | null>(null);
    const [source, setSource] = useState<'manual' | 'sms'>('manual');
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [countForNextMonth, setCountForNextMonth] = useState(
        params.countForNextMonth === '1' || params.countForNextMonth === 'true'
    );

    // Fetch custom categories
    useEffect(() => {
        if (!familyId) return;
        api.family(familyId)
            .then((f) => setCustomCategories(f.customCategories || []))
            .catch(() => {});
    }, [familyId]);

    const pasteFromSms = async () => {
        try {
            const text = await Clipboard.getStringAsync();
            if (!text || text.trim().length < 5) {
                return setError('Clipboard is empty. Copy a bank or UPI SMS alert first.');
            }

            const parsed = parseBankSms(text);
            if (!parsed) {
                return setError("Couldn't read transaction details from clipboard. Ensure you copied a bank/UPI SMS.");
            }

            setType(parsed.type);
            setAmount(formatAmountInput(String(parsed.amount)));
            if (parsed.merchant) setDescription(parsed.merchant);
            if (parsed.countForNextMonth !== undefined) {
                setCountForNextMonth(Boolean(parsed.countForNextMonth));
            } else if (parsed.category === 'Salary') {
                const parsedDate = fromDateInput(dateText);
                if (parsedDate && parsedDate.getDate() >= 23) setCountForNextMonth(true);
            }
            if (parsed.paymentMethod) setMethod(parsed.paymentMethod);
            setDedupeKey(parsed.dedupeKey);
            setSource('sms');
            setError(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setSuccess(`Parsed ${parsed.type === 'expense' ? 'debit' : 'credit'} of ${CURRENCY}${parsed.amount}`);
            setTimeout(() => setSuccess(null), 3500);
        } catch {
            setError('Could not access clipboard.');
        }
    };

    // Sync from params whenever they are available
    useEffect(() => {
        if (params.type) setType(params.type === 'income' ? 'income' : 'expense');
        if (params.amount) setAmount(formatAmountInput(String(params.amount)));
        if (params.category) setCategory(normalizeCategory(params.category));
        if (params.description !== undefined) setDescription(params.description);
        if (params.paymentMethod !== undefined) setMethod(params.paymentMethod || null);
        if (params.date) setDateText(toDateInput(new Date(params.date)));
    }, [params.id, params.type, params.amount, params.category, params.description, params.paymentMethod, params.date]);

    // Fallback: If editing and details were not passed via params, fetch from recent transactions
    useEffect(() => {
        if (!editing || params.amount || !familyId) return;
        api.transactions(familyId, { limit: 200 })
            .then((list) => {
                const tx = list.find((t) => t.id === editing);
                if (!tx) return setError('That transaction no longer exists.');
                setType(tx.type);
                setAmount(formatAmountInput(String(tx.amount)));
                setCategory(normalizeCategory(tx.category));
                setDescription(tx.description);
                setMethod(tx.paymentMethod);
                setDateText(toDateInput(new Date(tx.date)));
                if (tx.countForNextMonth !== undefined) {
                    setCountForNextMonth(Boolean(tx.countForNextMonth));
                }
            })
            .catch((e) => setError((e as Error).message));
    }, [editing, familyId, params.amount]);

    const changeType = (next: TxType) => {
        setType(next);
        if (!categoriesFor(next, customCategories).some((c) => c.name === category)) setCategory('');
    };

    const save = async (keepOpen = false) => {
        const value = parseAmountInput(amount);
        const parsedDate = fromDateInput(dateText);
        if (!(value > 0)) return setError('Enter an amount greater than zero.');
        if (!category) return setError('Pick a category.');
        if (!parsedDate) return setError('Use the date format YYYY-MM-DD, for example 2026-10-29.');

        const now = new Date();
        let finalDate = parsedDate;
        if (dateText === toDateInput(now)) {
            finalDate = now;
        } else {
            finalDate = new Date(
                parsedDate.getFullYear(),
                parsedDate.getMonth(),
                parsedDate.getDate(),
                now.getHours(),
                now.getMinutes(),
                now.getSeconds()
            );
        }

        setBusy(true);
        setAddAnother(keepOpen);
        setError(null);
        setSuccess(null);
        try {
            const flagCountNext = (category === 'Salary' || type === 'income') ? countForNextMonth : false;
            if (editing) {
                if (params.date && toDateInput(new Date(params.date)) === dateText) {
                    const orig = new Date(params.date);
                    if (!isNaN(orig.getTime())) finalDate = orig;
                }
                await api.updateTransaction(editing, {
                    amount: value,
                    type,
                    category,
                    description: description.trim(),
                    paymentMethod: method,
                    date: finalDate.toISOString(),
                    countForNextMonth: flagCountNext,
                });
                router.back();
            } else {
                await api.addTransaction({
                    familyId,
                    amount: value,
                    type,
                    category,
                    description: description.trim(),
                    paymentMethod: method,
                    date: finalDate.toISOString(),
                    source,
                    dedupeKey,
                    countForNextMonth: flagCountNext,
                });
                if (keepOpen) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    setAmount('');
                    setDescription('');
                    setDedupeKey(null);
                    setSource('manual');
                    setSuccess(`Added ${category} (${CURRENCY}${value.toFixed(2)})`);
                    setTimeout(() => setSuccess(null), 3500);
                } else {
                    router.back();
                }
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!editing || !(await confirmAction('Delete this transaction?', 'This cannot be undone.', 'Delete', true))) return;
        setBusy(true);
        try {
            await api.deleteTransaction(editing);
            router.back();
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
    };

    return (
        <Screen keyboard>
            <Header
                close
                title={editing ? 'Edit transaction' : 'New transaction'}
                right={editing ? <IconButton Icon={Trash2} label="Delete transaction" onPress={remove} /> : undefined}
            />

            <Segmented
                value={type}
                onChange={changeType}
                options={[
                    { value: 'expense', label: 'Spent' },
                    { value: 'income', label: 'Received' },
                ]}
            />

            {!editing && (
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: space.md, flexWrap: 'wrap' }}>
                    <PillButton
                        label="Paste SMS alert"
                        Icon={Sparkles}
                        variant="glass"
                        onPress={pasteFromSms}
                        style={{ minHeight: 36, paddingHorizontal: 14 }}
                    />
                    {(Platform.OS === 'android' || __DEV__) && (
                        <PillButton
                            label="Extract from SMS"
                            Icon={MessageSquare}
                            variant="glass"
                            onPress={() => router.push('/sms-import')}
                            style={{ minHeight: 36, paddingHorizontal: 14 }}
                        />
                    )}
                </View>
            )}

            <View style={{ alignItems: 'center', marginVertical: space.xl }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <T variant="display" color={colors.faint}>{CURRENCY}</T>
                    <TextInput
                        accessibilityLabel="Amount"
                        value={amount}
                        onChangeText={(t) => setAmount((prev) => formatAmountInput(t, prev))}
                        placeholder="0"
                        placeholderTextColor={colors.faint}
                        keyboardType="decimal-pad"
                        autoFocus={!editing}
                        style={{ fontFamily: fonts.extrabold, fontSize: 52, color: type === 'income' ? colors.income : colors.ink, minWidth: 90, textAlign: 'left', padding: 0 }}
                    />
                </View>
            </View>

            <SuccessBanner message={success} />
            <ErrorBanner message={error} />

            <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>CATEGORY</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.lg }}>
                {categoriesFor(type, customCategories).map((c) => (
                    <Chip key={c.name} label={c.name} Icon={c.Icon} active={category === c.name} onPress={() => {
                        setCategory(c.name);
                        if (c.name === 'Salary') {
                            const parsedD = fromDateInput(dateText);
                            if (parsedD && parsedD.getDate() >= 23) setCountForNextMonth(true);
                        }
                    }} />
                ))}
            </View>

            <Glass strong style={{ gap: space.lg }}>
                <Field label="Note" value={description} onChangeText={setDescription} placeholder={type === 'income' ? 'Where did it come from?' : 'What was it for?'} maxLength={500} />

                <View>
                    <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>PAID VIA</T>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {PAYMENT_METHODS.map((m) => (
                            <Chip key={m} label={m} active={method === m} onPress={() => setMethod(method === m ? null : m)} />
                        ))}
                    </View>
                </View>

                <View>
                    <Field
                        label="Date"
                        value={dateText}
                        onChangeText={setDateText}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                        right={
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Open calendar"
                                hitSlop={8}
                                onPress={() => setCalendarOpen(true)}
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: radius.sm,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: colors.mint1,
                                }}
                            >
                                <Calendar size={18} color={colors.ink} strokeWidth={2.2} />
                            </Pressable>
                        }
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Chip
                            label="Today"
                            active={dateText === toDateInput(new Date())}
                            onPress={() => setDateText(toDateInput(new Date()))}
                        />
                        <Chip
                            label="Yesterday"
                            active={dateText === toDateInput(new Date(Date.now() - 86400000))}
                            onPress={() => setDateText(toDateInput(new Date(Date.now() - 86400000)))}
                        />
                    </View>
                </View>

                {(category === 'Salary' || type === 'income') && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <View style={{ flex: 1, paddingRight: space.md }}>
                            <T variant="heading" style={{ fontSize: 15 }}>Count as next month</T>
                            <T variant="tiny" color={colors.inkSoft}>
                                Count this salary towards next month's received income while keeping the original date
                            </T>
                        </View>
                        <Switch
                            value={countForNextMonth}
                            onValueChange={setCountForNextMonth}
                            trackColor={{ false: colors.mint2, true: colors.ink }}
                            thumbColor={Platform.OS === 'android' ? colors.white : undefined}
                        />
                    </View>
                )}
            </Glass>

            <View style={{ marginTop: space.xl, gap: 10 }}>
                <PillButton
                    label={editing ? 'Save changes' : 'Add transaction'}
                    onPress={() => save(false)}
                    loading={busy && !addAnother}
                />
                {!editing ? (
                    <PillButton
                        label="Save & add another"
                        variant="glass"
                        Icon={Plus}
                        onPress={() => save(true)}
                        loading={busy && addAnother}
                    />
                ) : null}
            </View>

            <DatePickerSheet
                visible={calendarOpen}
                onClose={() => setCalendarOpen(false)}
                value={dateText}
                onChange={setDateText}
            />
        </Screen>
    );
}
