import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Calendar, Check, Clock, Pencil, Plus, RefreshCw, Repeat, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { DatePickerSheet } from '@/components/DatePickerSheet';
import { Header } from '@/components/Header';
import { Chip, Empty, ErrorBanner, Field, Glass, IconButton, Loading, PillButton, Reveal, Screen, Segmented, Sheet, SuccessBanner, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { categoriesFor, getCategory, PAYMENT_METHODS } from '@/lib/categories';
import { confirmAction } from '@/lib/dialog';
import { daysUntil, formatAmountInput, fromDateInput, money, parseAmountInput, shortDate, toDateInput } from '@/lib/format';
import type { RecurringFrequency, RecurringTx, TxType } from '@/lib/types';

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'daily', label: 'Daily' },
];

export default function Recurring() {
    const familyId = useFamilyId();
    const params = useLocalSearchParams<{ new?: string }>();

    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(
        () => (familyId ? api.recurring(familyId) : Promise.resolve([])),
        [familyId]
    );

    // New recurring form
    const [creating, setCreating] = useState(false);
    const [type, setType] = useState<TxType>('expense');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Bills');
    const [description, setDescription] = useState('');
    const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
    const [startDate, setStartDate] = useState(toDateInput(new Date()));
    const [paymentMethod, setPaymentMethod] = useState<string | null>('UPI');
    const [autoRecord, setAutoRecord] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Edit recurring form
    const [editing, setEditing] = useState<RecurringTx | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editFrequency, setEditFrequency] = useState<RecurringFrequency>('monthly');
    const [editNextDate, setEditNextDate] = useState('');
    const [editAutoRecord, setEditAutoRecord] = useState(false);
    const [editCalendarOpen, setEditCalendarOpen] = useState(false);
    const [editBusy, setEditBusy] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    useEffect(() => {
        if (params.new === '1') setCreating(true);
    }, [params.new]);

    const run = async (task: () => Promise<unknown>) => {
        setBusy(true);
        setFormError(null);
        try {
            await task();
            await reload();
            return true;
        } catch (e) {
            setFormError((e as Error).message);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const create = async () => {
        const value = parseAmountInput(amount);
        const date = fromDateInput(startDate);
        if (!(value > 0)) return setFormError('Enter an amount greater than zero.');
        if (!category) return setFormError('Pick a category.');
        if (!date) return setFormError('Use the date format YYYY-MM-DD.');

        const ok = await run(() =>
            api.addRecurring({
                familyId,
                amount: value,
                type,
                category,
                description: description.trim(),
                frequency,
                startDate: date.toISOString(),
                paymentMethod,
                autoRecord,
            })
        );

        if (ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setCreating(false);
            setAmount('');
            setDescription('');
            setSuccessMessage(`Added recurring ${category}`);
            setTimeout(() => setSuccessMessage(null), 3500);
        }
    };

    const openEdit = (rec: RecurringTx) => {
        setEditing(rec);
        setEditAmount(formatAmountInput(String(rec.amount)));
        setEditDescription(rec.description || '');
        setEditCategory(rec.category);
        setEditFrequency(rec.frequency);
        setEditNextDate(toDateInput(new Date(rec.nextRunDate)));
        setEditAutoRecord(rec.autoRecord);
        setEditError(null);
    };

    const saveEdit = async () => {
        if (!editing) return;
        const value = parseAmountInput(editAmount);
        const date = fromDateInput(editNextDate);
        if (!(value > 0)) return setEditError('Enter an amount greater than zero.');
        if (!date) return setEditError('Use date format YYYY-MM-DD.');

        setEditBusy(true);
        setEditError(null);
        try {
            await api.updateRecurring(editing.id, {
                amount: value,
                description: editDescription.trim(),
                category: editCategory,
                frequency: editFrequency,
                nextRunDate: date.toISOString(),
                autoRecord: editAutoRecord,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            await reload();
            setEditing(null);
        } catch (e) {
            setEditError((e as Error).message);
        } finally {
            setEditBusy(false);
        }
    };

    const recordNow = async (rec: RecurringTx) => {
        if (
            !(await confirmAction(
                'Record this payment now?',
                `A transaction of ${money(rec.amount)} for "${rec.description || rec.category}" will be added to your activity feed.`,
                'Record'
            ))
        )
            return;

        const ok = await run(() => api.recordRecurring(rec.id, rec.paymentMethod));
        if (ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setSuccessMessage(`Recorded ${money(rec.amount)} for ${rec.description || rec.category}`);
            setTimeout(() => setSuccessMessage(null), 3500);
        }
    };

    const recurringList = data ?? [];
    const monthlyExpenses = recurringList
        .filter((r) => r.type === 'expense' && r.status === 'active')
        .reduce((sum, r) => {
            const mult = r.frequency === 'daily' ? 30 : r.frequency === 'weekly' ? 4.33 : r.frequency === 'yearly' ? 1 / 12 : 1;
            return sum + (Number(r.amount) || 0) * mult;
        }, 0);

    const monthlyIncome = recurringList
        .filter((r) => r.type === 'income' && r.status === 'active')
        .reduce((sum, r) => {
            const mult = r.frequency === 'daily' ? 30 : r.frequency === 'weekly' ? 4.33 : r.frequency === 'yearly' ? 1 / 12 : 1;
            return sum + (Number(r.amount) || 0) * mult;
        }, 0);

    return (
        <Screen refreshing={refreshing} onRefresh={pullToRefresh}>
            <Header
                close
                title="Recurring Bills"
                right={
                    <IconButton
                        Icon={Plus}
                        tone="ink"
                        label="New recurring"
                        onPress={() => {
                            setFormError(null);
                            setCreating(true);
                        }}
                    />
                }
            />

            <SuccessBanner message={successMessage} />
            <ErrorBanner message={error ?? (!creating && !editing ? formError : null)} onRetry={reload} />

            {/* Overview cards */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.lg }}>
                <Glass strong style={{ flex: 1, padding: space.lg }}>
                    <T variant="tiny" color={colors.muted}>EST. MONTHLY SPEND</T>
                    <T variant="title" color={colors.expense} style={{ fontSize: 22, marginTop: 2 }}>
                        {money(monthlyExpenses)}
                    </T>
                </Glass>
                <Glass strong style={{ flex: 1, padding: space.lg }}>
                    <T variant="tiny" color={colors.muted}>EST. MONTHLY INCOME</T>
                    <T variant="title" color={colors.income} style={{ fontSize: 22, marginTop: 2 }}>
                        {money(monthlyIncome)}
                    </T>
                </Glass>
            </View>

            {loading && !data ? <Loading /> : null}

            {data && recurringList.length === 0 ? (
                <Empty
                    Icon={Repeat}
                    title="No recurring transactions"
                    hint="Set up rent, utility bills, subscriptions, or salaries to manage them in one place."
                />
            ) : null}

            <View style={{ gap: 12 }}>
                {recurringList.map((rec, i) => {
                    const cat = getCategory(rec.category);
                    const days = daysUntil(rec.nextRunDate);
                    const isDue = days <= 0;
                    const isExpense = rec.type === 'expense';

                    return (
                        <Reveal key={rec.id} index={i}>
                            <Glass strong>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                                    <View
                                        style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 22,
                                            backgroundColor: `${cat.tint}22`,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <cat.Icon size={20} color={cat.tint} />
                                    </View>

                                    <View style={{ flex: 1 }}>
                                        <T variant="heading" numberOfLines={1}>
                                            {rec.description || rec.category}
                                        </T>
                                        <T variant="small" color={colors.muted} numberOfLines={1}>
                                            {(rec.frequency || 'monthly').toUpperCase()}
                                            {rec.paymentMethod ? ` · via ${rec.paymentMethod}` : ''}
                                            {rec.autoRecord ? ' · Auto' : ''}
                                        </T>
                                    </View>

                                    <T variant="title" style={{ fontSize: 20, color: isExpense ? colors.expense : colors.income }}>
                                        {isExpense ? '-' : '+'}{money(rec.amount)}
                                    </T>
                                </View>

                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginTop: space.md,
                                        paddingTop: space.sm,
                                        borderTopWidth: 1,
                                        borderTopColor: colors.mint1,
                                    }}
                                >
                                    <View
                                        style={{
                                            backgroundColor: isDue ? 'rgba(179,38,30,0.12)' : 'rgba(14,16,15,0.07)',
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: radius.pill,
                                        }}
                                    >
                                        <T variant="tiny" color={isDue ? colors.expense : colors.inkSoft}>
                                            {days === 0
                                                ? 'DUE TODAY'
                                                : days < 0
                                                ? `OVERDUE ${Math.abs(days)}D`
                                                : `NEXT: ${shortDate(rec.nextRunDate).toUpperCase()}`}
                                        </T>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <IconButton
                                            Icon={Pencil}
                                            size={38}
                                            label="Edit recurring"
                                            onPress={() => openEdit(rec)}
                                        />
                                        <IconButton
                                            Icon={Trash2}
                                            size={38}
                                            label="Delete recurring"
                                            onPress={async () => {
                                                if (
                                                    await confirmAction(
                                                        'Delete recurring transaction?',
                                                        `"${rec.description || rec.category}" will no longer repeat.`,
                                                        'Delete',
                                                        true
                                                    )
                                                ) {
                                                    run(() => api.deleteRecurring(rec.id));
                                                }
                                            }}
                                        />
                                        <PillButton
                                            label="Record"
                                            Icon={Check}
                                            style={{ minHeight: 38, paddingHorizontal: 14 }}
                                            onPress={() => recordNow(rec)}
                                        />
                                    </View>
                                </View>
                            </Glass>
                        </Reveal>
                    );
                })}
            </View>

            {/* ── New Recurring Sheet ── */}
            <Sheet visible={creating} onClose={() => setCreating(false)} title="New recurring item">
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={formError} />

                    <Segmented
                        value={type}
                        onChange={(t) => {
                            setType(t);
                            if (t === 'income') setCategory('Salary');
                            else setCategory('Bills');
                        }}
                        options={[
                            { value: 'expense', label: 'Expense' },
                            { value: 'income', label: 'Income' },
                        ]}
                    />

                    <Field
                        label="Amount"
                        value={amount}
                        onChangeText={(t) => setAmount((prev) => formatAmountInput(t, prev))}
                        placeholder="799"
                        keyboardType="decimal-pad"
                    />

                    <Field
                        label="Description"
                        value={description}
                        onChangeText={setDescription}
                        placeholder={type === 'expense' ? 'Netflix, Rent, Wi-Fi...' : 'Salary, Retainer...'}
                        autoCapitalize="sentences"
                    />

                    <View>
                        <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
                            FREQUENCY
                        </T>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {FREQUENCIES.map((f) => (
                                <Chip
                                    key={f.value}
                                    label={f.label}
                                    active={frequency === f.value}
                                    onPress={() => setFrequency(f.value)}
                                />
                            ))}
                        </View>
                    </View>

                    <View>
                        <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
                            CATEGORY
                        </T>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {categoriesFor(type).map((c) => (
                                <Chip
                                    key={c.name}
                                    label={c.name}
                                    Icon={c.Icon}
                                    active={category === c.name}
                                    onPress={() => setCategory(c.name)}
                                />
                            ))}
                        </View>
                    </View>

                    <Field
                        label="Start / Next Date"
                        value={startDate}
                        onChangeText={setStartDate}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                        right={
                            <IconButton
                                Icon={Calendar}
                                size={36}
                                label="Pick date"
                                onPress={() => setCalendarOpen(true)}
                            />
                        }
                    />

                    <View>
                        <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
                            PAID VIA
                        </T>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {PAYMENT_METHODS.map((m) => (
                                <Chip
                                    key={m}
                                    label={m}
                                    active={paymentMethod === m}
                                    onPress={() => setPaymentMethod(paymentMethod === m ? null : m)}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <View style={{ flex: 1, paddingRight: space.md }}>
                            <T variant="heading" style={{ fontSize: 15 }}>Auto-record</T>
                            <T variant="tiny" color={colors.inkSoft}>
                                Automatically post transaction when due date arrives
                            </T>
                        </View>
                        <Switch
                            value={autoRecord}
                            onValueChange={setAutoRecord}
                            trackColor={{ false: colors.mint2, true: colors.ink }}
                        />
                    </View>

                    <PillButton label="Save recurring item" onPress={create} loading={busy} />
                </View>
            </Sheet>

            <DatePickerSheet
                visible={calendarOpen}
                onClose={() => setCalendarOpen(false)}
                value={startDate}
                onChange={(d) => setStartDate(d)}
            />

            {/* ── Edit Recurring Sheet ── */}
            <Sheet visible={!!editing} onClose={() => setEditing(null)} title="Edit recurring item">
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={editError} />

                    <Field
                        label="Amount"
                        value={editAmount}
                        onChangeText={(t) => setEditAmount((prev) => formatAmountInput(t, prev))}
                        placeholder="799"
                        keyboardType="decimal-pad"
                    />

                    <Field
                        label="Description"
                        value={editDescription}
                        onChangeText={setEditDescription}
                        placeholder="Description"
                    />

                    <View>
                        <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
                            FREQUENCY
                        </T>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {FREQUENCIES.map((f) => (
                                <Chip
                                    key={f.value}
                                    label={f.label}
                                    active={editFrequency === f.value}
                                    onPress={() => setEditFrequency(f.value)}
                                />
                            ))}
                        </View>
                    </View>

                    <Field
                        label="Next due date"
                        value={editNextDate}
                        onChangeText={setEditNextDate}
                        placeholder="YYYY-MM-DD"
                        right={
                            <IconButton
                                Icon={Calendar}
                                size={36}
                                label="Pick date"
                                onPress={() => setEditCalendarOpen(true)}
                            />
                        }
                    />

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <View style={{ flex: 1, paddingRight: space.md }}>
                            <T variant="heading" style={{ fontSize: 15 }}>Auto-record</T>
                            <T variant="tiny" color={colors.inkSoft}>
                                Automatically post transaction when due date arrives
                            </T>
                        </View>
                        <Switch
                            value={editAutoRecord}
                            onValueChange={setEditAutoRecord}
                            trackColor={{ false: colors.mint2, true: colors.ink }}
                        />
                    </View>

                    <PillButton label="Save changes" onPress={saveEdit} loading={editBusy} />
                </View>
            </Sheet>

            <DatePickerSheet
                visible={editCalendarOpen}
                onClose={() => setEditCalendarOpen(false)}
                value={editNextDate}
                onChange={(d) => setEditNextDate(d)}
            />
        </Screen>
    );
}
