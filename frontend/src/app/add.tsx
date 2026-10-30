import { router, useLocalSearchParams } from 'expo-router';
import { MessageSquareText, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Header } from '@/components/Header';
import { Chip, ErrorBanner, Field, Glass, IconButton, PillButton, Screen, Segmented, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { api } from '@/lib/api';
import { categoriesFor, PAYMENT_METHODS } from '@/lib/categories';
import { confirmAction } from '@/lib/dialog';
import { CURRENCY } from '@/lib/config';
import { fromDateInput, toDateInput } from '@/lib/format';
import { parseBankSms } from '@/lib/sms';
import type { TxType } from '@/lib/types';

export default function AddTransaction() {
    const params = useLocalSearchParams<{ type?: string; id?: string }>();
    const familyId = useFamilyId();
    const editing = params.id;

    const [type, setType] = useState<TxType>(params.type === 'income' ? 'income' : 'expense');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [method, setMethod] = useState<string | null>(null);
    const [dateText, setDateText] = useState(toDateInput(new Date()));
    const [dedupeKey, setDedupeKey] = useState<string | null>(null);
    const [smsOpen, setSmsOpen] = useState(false);
    const [sms, setSms] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Editing: the API has no single-transaction read, so find it in the family's recent list.
    useEffect(() => {
        if (!editing) return;
        api.transactions(familyId, { limit: 200 })
            .then((list) => {
                const tx = list.find((t) => t.id === editing);
                if (!tx) return setError('That transaction no longer exists.');
                setType(tx.type);
                setAmount(String(tx.amount));
                setCategory(tx.category);
                setDescription(tx.description);
                setMethod(tx.paymentMethod);
                setDateText(toDateInput(new Date(tx.date)));
            })
            .catch((e) => setError((e as Error).message));
    }, [editing, familyId]);

    const changeType = (next: TxType) => {
        setType(next);
        if (!categoriesFor(next).some((c) => c.name === category)) setCategory('');
    };

    const fillFromSms = () => {
        const parsed = parseBankSms(sms);
        if (!parsed) return setError("Couldn't find an amount and a debit or credit in that message.");
        setError(null);
        setType(parsed.type);
        setAmount(String(parsed.amount));
        setMethod(parsed.paymentMethod);
        if (parsed.merchant) setDescription(parsed.merchant);
        setCategory((c) => (categoriesFor(parsed.type).some((x) => x.name === c) ? c : ''));
        setDedupeKey(parsed.dedupeKey);
        setSmsOpen(false);
    };

    const save = async () => {
        const value = parseFloat(amount.replace(/,/g, ''));
        const date = fromDateInput(dateText);
        if (!(value > 0)) return setError('Enter an amount greater than zero.');
        if (!category) return setError('Pick a category.');
        if (!date) return setError('Use the date format YYYY-MM-DD, for example 2026-10-29.');

        setBusy(true);
        setError(null);
        try {
            if (editing) {
                await api.updateTransaction(editing, { amount: value, type, category, description: description.trim(), paymentMethod: method, date: date.toISOString() });
            } else {
                await api.addTransaction({
                    familyId,
                    amount: value,
                    type,
                    category,
                    description: description.trim(),
                    paymentMethod: method,
                    date: date.toISOString(),
                    ...(dedupeKey ? { source: 'sms' as const, dedupeKey } : {}),
                });
            }
            router.back();
        } catch (e) {
            const message = (e as Error).message;
            setError(message === 'Duplicate transaction' ? 'You already added this message.' : message);
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

            <View style={{ alignItems: 'center', marginVertical: space.xl }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <T variant="display" color={colors.faint}>{CURRENCY}</T>
                    <TextInput
                        accessibilityLabel="Amount"
                        value={amount}
                        onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                        placeholder="0"
                        placeholderTextColor={colors.faint}
                        keyboardType="decimal-pad"
                        autoFocus={!editing}
                        style={{ fontFamily: fonts.extrabold, fontSize: 52, color: type === 'income' ? colors.income : colors.ink, minWidth: 90, textAlign: 'left', padding: 0 }}
                    />
                </View>
            </View>

            <ErrorBanner message={error} />

            <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>CATEGORY</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.lg }}>
                {categoriesFor(type).map((c) => (
                    <Chip key={c.name} label={c.name} Icon={c.Icon} active={category === c.name} onPress={() => setCategory(c.name)} />
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
                    <Field label="Date" value={dateText} onChangeText={setDateText} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Chip label="Today" onPress={() => setDateText(toDateInput(new Date()))} />
                        <Chip label="Yesterday" onPress={() => setDateText(toDateInput(new Date(Date.now() - 86400000)))} />
                    </View>
                </View>
            </Glass>

            {!editing ? (
                <View style={{ marginTop: space.lg }}>
                    <Pressable accessibilityRole="button" onPress={() => setSmsOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6 }}>
                        <MessageSquareText size={18} color={colors.inkSoft} />
                        <T variant="small" color={colors.inkSoft} style={{ fontFamily: fonts.semibold }}>
                            {dedupeKey ? 'Filled from a bank SMS' : 'Fill from a bank SMS'}
                        </T>
                    </Pressable>
                    {smsOpen ? (
                        <Glass style={{ marginTop: 6, gap: space.md, borderRadius: radius.md }}>
                            <Field label="Paste the message" value={sms} onChangeText={setSms} multiline placeholder="Rs.450.00 debited from a/c XX1234 to SWIGGY on 29-10-26…" />
                            <PillButton label="Read message" variant="light" onPress={fillFromSms} style={{ minHeight: 46 }} />
                        </Glass>
                    ) : null}
                </View>
            ) : null}

            <PillButton label={editing ? 'Save changes' : 'Add transaction'} onPress={save} loading={busy} style={{ marginTop: space.xl }} />
        </Screen>
    );
}
