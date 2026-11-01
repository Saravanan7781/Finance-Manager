import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Calendar, HandCoins, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { DatePickerSheet } from '@/components/DatePickerSheet';
import { Header } from '@/components/Header';
import { Chip, Empty, ErrorBanner, Field, Glass, IconButton, Loading, PillButton, Progress, Reveal, Screen, Segmented, Sheet, SuccessBanner, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { PAYMENT_METHODS } from '@/lib/categories';
import { confirmAction } from '@/lib/dialog';
import { daysUntil, formatAmountInput, fromDateInput, money, parseAmountInput, shortDate, toDateInput } from '@/lib/format';
import type { Loan } from '@/lib/types';

const DEFAULT_DUE_DAYS = 7;
const defaultDue = () => toDateInput(new Date(Date.now() + DEFAULT_DUE_DAYS * 86400000));

export default function Loans() {
    const familyId = useFamilyId();
    const params = useLocalSearchParams<{ new?: string }>();
    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(() => api.loans(familyId, 'open'), [familyId]);

    // ── New loan form ────────────────────────────────────────────────────────
    const [creating, setCreating] = useState(false);
    const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent');
    const [person, setPerson] = useState('');
    const [amount, setAmount] = useState('');
    const [due, setDue] = useState(defaultDue());
    const [note, setNote] = useState('');
    const [createRecordTx, setCreateRecordTx] = useState(true);
    const [createMethod, setCreateMethod] = useState<string | null>('UPI');
    const [loanCalendarOpen, setLoanCalendarOpen] = useState(false);
    const [addAnother, setAddAnother] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // ── Edit loan form ───────────────────────────────────────────────────────
    const [editing, setEditing] = useState<Loan | null>(null);
    const [editPerson, setEditPerson] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [editDue, setEditDue] = useState('');
    const [editNote, setEditNote] = useState('');
    const [editCalendarOpen, setEditCalendarOpen] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [editBusy, setEditBusy] = useState(false);

    // ── Part payment ─────────────────────────────────────────────────────────
    const [paying, setPaying] = useState<Loan | null>(null);
    const [payment, setPayment] = useState('');
    const [repayRecordTx, setRepayRecordTx] = useState(true);
    const [repayMethod, setRepayMethod] = useState<string | null>('UPI');

    // ── Filter ────────────────────────────────────────────────────────────────
    const [filter, setFilter] = useState<'all' | 'lent' | 'borrowed'>('all');

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

    const create = async (keepOpen = false) => {
        const value = parseAmountInput(amount);
        const date = fromDateInput(due);
        if (!person.trim()) return setFormError('Who is this with?');
        if (!(value > 0)) return setFormError('Enter an amount greater than zero.');
        if (!date) return setFormError('Use the date format YYYY-MM-DD.');

        setAddAnother(keepOpen);
        const savedPerson = person.trim();
        const ok = await run(() => api.addLoan({
            familyId,
            direction,
            person: savedPerson,
            amount: value,
            dueDate: date.toISOString(),
            note: note.trim(),
            recordTransaction: createRecordTx,
            paymentMethod: createRecordTx ? createMethod : null,
        }));
        if (ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setPerson('');
            setAmount('');
            setNote('');
            setDue(defaultDue());
            if (keepOpen) {
                setSuccessMessage(`Added loan for ${savedPerson}`);
                setTimeout(() => setSuccessMessage(null), 3500);
            } else {
                setCreating(false);
                setSuccessMessage(null);
            }
        }
    };

    const openEdit = (loan: Loan) => {
        setEditPerson(loan.person);
        setEditAmount(formatAmountInput(String(loan.amount)));
        setEditDue(loan.dueDate ? toDateInput(new Date(loan.dueDate)) : defaultDue());
        setEditNote(loan.note ?? '');
        setEditError(null);
        setEditing(loan);
    };

    const saveEdit = async () => {
        if (!editing) return;
        const value = parseAmountInput(editAmount);
        const date = fromDateInput(editDue);
        if (!editPerson.trim()) return setEditError('Who is this with?');
        if (!(value > 0)) return setEditError('Enter an amount greater than zero.');
        if (!date) return setEditError('Use the date format YYYY-MM-DD.');
        setEditBusy(true);
        setEditError(null);
        try {
            await api.updateLoan(editing.id, {
                person: editPerson.trim(),
                amount: value,
                dueDate: date.toISOString(),
                note: editNote.trim(),
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

    const all = data ?? [];
    const open = all.filter((l) => l.status === 'open');
    const owedToUs = open.filter((l) => l.direction === 'lent').reduce((s, l) => s + l.amount - l.repaidAmount, 0);
    const weOwe = open.filter((l) => l.direction === 'borrowed').reduce((s, l) => s + l.amount - l.repaidAmount, 0);

    // Apply direction filter
    const filtered = filter === 'all' ? open : open.filter((l) => l.direction === filter);

    const renderLoan = (loan: Loan, i: number) => {
        const outstanding = loan.amount - loan.repaidAmount;
        const days = loan.dueDate ? daysUntil(loan.dueDate) : null;
        const overdue = days !== null && days < 0;
        const lent = loan.direction === 'lent';

        // Days since this loan was created
        const daysSince = loan.createdAt
            ? Math.floor((Date.now() - new Date(loan.createdAt).getTime()) / 86400000)
            : null;

        return (
            <Reveal key={loan.id} index={i}>
                <Glass strong>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                        <View style={{ flex: 1 }}>
                            <T variant="heading" numberOfLines={1}>{loan.person}</T>
                            <T variant="small" color={colors.muted} numberOfLines={1}>
                                {lent ? 'Owes you' : 'You owe'}{loan.note ? ` · ${loan.note}` : ''}
                            </T>
                        </View>
                        <T variant="title" style={{ fontSize: 22, color: lent ? colors.income : colors.expense }}>{money(outstanding)}</T>
                    </View>

                    <View style={{ marginVertical: space.md }}>
                        <Progress value={loan.amount ? loan.repaidAmount / loan.amount : 0} tint={lent ? colors.income : colors.expense} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        {/* Due date pill + days since loaned */}
                        <View style={{ gap: 4 }}>
                            <View style={{ backgroundColor: overdue ? 'rgba(179,38,30,0.12)' : 'rgba(14,16,15,0.07)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill }}>
                                <T variant="tiny" color={overdue ? colors.expense : colors.inkSoft}>
                                    {days === null ? 'NO DUE DATE' : overdue ? `OVERDUE ${Math.abs(days)}D` : days === 0 ? 'DUE TODAY' : `DUE ${shortDate(loan.dueDate!).toUpperCase()}`}
                                </T>
                            </View>
                            {daysSince !== null && (
                                <T variant="tiny" color={colors.muted}>
                                    loaned {daysSince === 0 ? 'today' : `${daysSince} day${daysSince === 1 ? '' : 's'} ago`}
                                </T>
                            )}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <IconButton Icon={Pencil} size={40} label={`Edit loan with ${loan.person}`} onPress={() => openEdit(loan)} />
                            <IconButton Icon={Trash2} size={40} label={`Delete loan with ${loan.person}`} onPress={async () => {
                                if (await confirmAction('Delete this loan?', `The record with ${loan.person} will be removed.`, 'Delete', true)) run(() => api.deleteLoan(loan.id));
                            }} />
                            <PillButton label="Part" variant="glass" style={{ minHeight: 40, paddingHorizontal: 16 }} onPress={() => { setFormError(null); setPayment(''); setPaying(loan); }} />
                            <PillButton label="Settled" style={{ minHeight: 40, paddingHorizontal: 16 }} onPress={() => { setFormError(null); setPayment(formatAmountInput(String(outstanding))); setPaying(loan); }} />
                        </View>
                    </View>
                </Glass>
            </Reveal>
        );
    };

    return (
        <Screen refreshing={refreshing} onRefresh={pullToRefresh}>
            <Header title="Loans" right={<IconButton Icon={Plus} tone="ink" label="New loan" onPress={() => { setFormError(null); setCreating(true); }} />} />
            <ErrorBanner message={error ?? (paying || creating || editing ? null : formError)} onRetry={reload} />

            {/* Summary cards — tap to filter */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.lg }}>
                <Pressable
                    style={{ flex: 1 }}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setFilter((f) => (f === 'lent' ? 'all' : 'lent'));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Filter: Owed to you"
                >
                    <Glass strong style={[
                        { padding: space.lg },
                        filter === 'lent' && { borderWidth: 2, borderColor: colors.income },
                    ]}>
                        <T variant="tiny" color={filter === 'lent' ? colors.income : colors.muted}>OWED TO YOU</T>
                        <T variant="title" color={colors.income} style={{ fontSize: 22, marginTop: 2 }}>{money(owedToUs)}</T>
                    </Glass>
                </Pressable>
                <Pressable
                    style={{ flex: 1 }}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setFilter((f) => (f === 'borrowed' ? 'all' : 'borrowed'));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Filter: You owe"
                >
                    <Glass strong style={[
                        { padding: space.lg },
                        filter === 'borrowed' && { borderWidth: 2, borderColor: colors.expense },
                    ]}>
                        <T variant="tiny" color={filter === 'borrowed' ? colors.expense : colors.muted}>YOU OWE</T>
                        <T variant="title" color={colors.expense} style={{ fontSize: 22, marginTop: 2 }}>{money(weOwe)}</T>
                    </Glass>
                </Pressable>
            </View>

            {loading && !data ? <Loading /> : null}
            {data && open.length === 0 ? <Empty Icon={HandCoins} title="Nothing lent or borrowed" hint="Add a loan to keep track of who owes what, with a reminder when it is due." /> : null}
            {data && open.length > 0 && filtered.length === 0 ? (
                <T variant="small" color={colors.muted} style={{ textAlign: 'center', marginVertical: space.xl }}>
                    No {filter === 'lent' ? '"owed to you"' : '"you owe"'} loans. Tap the card again to clear the filter.
                </T>
            ) : null}

            <View style={{ gap: 12 }}>{filtered.map(renderLoan)}</View>

            {/* ── New loan sheet ── */}
            <Sheet visible={creating} onClose={() => { setCreating(false); setSuccessMessage(null); }} title="New loan">
                <View style={{ gap: space.lg }}>
                    <SuccessBanner message={successMessage} />
                    <ErrorBanner message={formError} />
                    <Segmented value={direction} onChange={setDirection} options={[{ value: 'lent', label: 'I lent' }, { value: 'borrowed', label: 'I borrowed' }]} />
                    <Field label={direction === 'lent' ? 'Lent to' : 'Borrowed from'} value={person} onChangeText={setPerson} placeholder="Name" autoCapitalize="words" />
                    <Field label="Amount" value={amount} onChangeText={(t) => setAmount((prev) => formatAmountInput(t, prev))} placeholder="5,000" keyboardType="decimal-pad" />
                    <Field
                        label="Due date"
                        value={due}
                        onChangeText={setDue}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                        right={
                            <IconButton
                                Icon={Calendar}
                                size={36}
                                label="Pick due date"
                                onPress={() => setLoanCalendarOpen(true)}
                            />
                        }
                    />
                    <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="What was it for?" maxLength={300} />

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <View style={{ flex: 1, paddingRight: space.md }}>
                            <T variant="heading" style={{ fontSize: 15 }}>Record in Activity</T>
                            <T variant="tiny" color={colors.inkSoft}>
                                {direction === 'lent' ? 'Log as Lent expense in activity' : 'Log as income in activity'}
                            </T>
                        </View>
                        <Switch value={createRecordTx} onValueChange={setCreateRecordTx} trackColor={{ false: colors.mint2, true: colors.ink }} />
                    </View>

                    {createRecordTx && (
                        <View>
                            <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>PAID VIA</T>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {PAYMENT_METHODS.map((m) => (
                                    <Chip key={m} label={m} active={createMethod === m} onPress={() => setCreateMethod(createMethod === m ? null : m)} />
                                ))}
                            </View>
                        </View>
                    )}

                    <View style={{ gap: 10, marginTop: space.sm }}>
                        <PillButton label="Save loan" onPress={() => create(false)} loading={busy && !addAnother} />
                        <PillButton label="Save & add another" variant="light" Icon={Plus} onPress={() => create(true)} loading={busy && addAnother} />
                    </View>
                </View>
            </Sheet>

            {/* Calendar picker for new loan due date */}
            <DatePickerSheet
                visible={loanCalendarOpen}
                onClose={() => setLoanCalendarOpen(false)}
                value={due}
                onChange={(d) => setDue(d)}
            />

            {/* ── Edit loan sheet ── */}
            <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit · ${editing.person}` : ''}>
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={editError} />
                    <Field label="Person" value={editPerson} onChangeText={setEditPerson} placeholder="Name" autoCapitalize="words" />
                    <Field label="Amount" value={editAmount} onChangeText={(t) => setEditAmount((prev) => formatAmountInput(t, prev))} placeholder="5,000" keyboardType="decimal-pad" />
                    <Field
                        label="Due date"
                        value={editDue}
                        onChangeText={setEditDue}
                        placeholder="YYYY-MM-DD"
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                        right={
                            <IconButton
                                Icon={Calendar}
                                size={36}
                                label="Pick due date"
                                onPress={() => setEditCalendarOpen(true)}
                            />
                        }
                    />
                    <Field label="Note (optional)" value={editNote} onChangeText={setEditNote} placeholder="What was it for?" maxLength={300} />
                    <PillButton label="Save changes" onPress={saveEdit} loading={editBusy} style={{ marginTop: space.sm }} />
                </View>
            </Sheet>

            {/* Calendar picker for edit loan due date */}
            <DatePickerSheet
                visible={editCalendarOpen}
                onClose={() => setEditCalendarOpen(false)}
                value={editDue}
                onChange={(d) => setEditDue(d)}
            />

            {/* ── Part payment sheet ── */}
            <Sheet visible={!!paying} onClose={() => setPaying(null)} title={paying ? `Payment · ${paying.person}` : ''}>
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={formError} />
                    <T variant="small" color={colors.muted}>Still open: {paying ? money(paying.amount - paying.repaidAmount) : ''}</T>
                    <Field label="Amount received or paid" value={payment} onChangeText={(t) => setPayment((prev) => formatAmountInput(t, prev))} placeholder="1,000" keyboardType="decimal-pad" autoFocus />

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <View style={{ flex: 1, paddingRight: space.md }}>
                            <T variant="heading" style={{ fontSize: 15 }}>Record in Activity</T>
                            <T variant="tiny" color={colors.inkSoft}>
                                {paying?.direction === 'lent' ? 'Log as Loan repayment income' : 'Log as Loan repayment expense'}
                            </T>
                        </View>
                        <Switch value={repayRecordTx} onValueChange={setRepayRecordTx} trackColor={{ false: colors.mint2, true: colors.ink }} />
                    </View>

                    {repayRecordTx && (
                        <View>
                            <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>PAID VIA</T>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {PAYMENT_METHODS.map((m) => (
                                    <Chip key={m} label={m} active={repayMethod === m} onPress={() => setRepayMethod(repayMethod === m ? null : m)} />
                                ))}
                            </View>
                        </View>
                    )}

                    <PillButton
                        label="Record payment"
                        loading={busy}
                        onPress={async () => {
                            const value = parseAmountInput(payment);
                            if (!paying || !(value > 0)) return setFormError('Enter an amount greater than zero.');
                            if (await run(() => api.repayLoan(paying.id, value, repayRecordTx, repayRecordTx ? repayMethod : null))) setPaying(null);
                        }}
                    />
                </View>
            </Sheet>
        </Screen>
    );
}
