import { useLocalSearchParams } from 'expo-router';
import { HandCoins, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Header';
import { Empty, ErrorBanner, Field, Glass, IconButton, Loading, PillButton, Progress, Reveal, Screen, Segmented, Sheet, T } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/dialog';
import { daysUntil, fromDateInput, money, shortDate, toDateInput } from '@/lib/format';
import type { Loan } from '@/lib/types';

const DEFAULT_DUE_DAYS = 7;
const defaultDue = () => toDateInput(new Date(Date.now() + DEFAULT_DUE_DAYS * 86400000));

export default function Loans() {
    const familyId = useFamilyId();
    const params = useLocalSearchParams<{ new?: string }>();
    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(() => api.loans(familyId), [familyId]);

    const [creating, setCreating] = useState(false);
    const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent');
    const [person, setPerson] = useState('');
    const [amount, setAmount] = useState('');
    const [due, setDue] = useState(defaultDue());
    const [note, setNote] = useState('');
    const [paying, setPaying] = useState<Loan | null>(null);
    const [payment, setPayment] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

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
        const value = parseFloat(amount);
        const date = fromDateInput(due);
        if (!person.trim()) return setFormError('Who is this with?');
        if (!(value > 0)) return setFormError('Enter an amount greater than zero.');
        if (!date) return setFormError('Use the date format YYYY-MM-DD.');

        const ok = await run(() => api.addLoan({ familyId, direction, person: person.trim(), amount: value, dueDate: date.toISOString(), note: note.trim() }));
        if (ok) {
            setCreating(false);
            setPerson('');
            setAmount('');
            setNote('');
            setDue(defaultDue());
        }
    };

    const open = (data ?? []).filter((l) => l.status === 'open');
    const settled = (data ?? []).filter((l) => l.status === 'settled');
    const owedToUs = open.filter((l) => l.direction === 'lent').reduce((s, l) => s + l.amount - l.repaidAmount, 0);
    const weOwe = open.filter((l) => l.direction === 'borrowed').reduce((s, l) => s + l.amount - l.repaidAmount, 0);

    const renderLoan = (loan: Loan, i: number) => {
        const outstanding = loan.amount - loan.repaidAmount;
        const days = loan.dueDate ? daysUntil(loan.dueDate) : null;
        const overdue = loan.status === 'open' && days !== null && days < 0;
        const lent = loan.direction === 'lent';
        return (
            <Reveal key={loan.id} index={i}>
                <Glass strong style={loan.status === 'settled' ? { opacity: 0.6 } : undefined}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                        <View style={{ flex: 1 }}>
                            <T variant="heading" numberOfLines={1}>{loan.person}</T>
                            <T variant="small" color={colors.muted} numberOfLines={1}>
                                {lent ? 'Owes you' : 'You owe'}{loan.note ? ` · ${loan.note}` : ''}
                            </T>
                        </View>
                        <T variant="title" style={{ fontSize: 22, color: lent ? colors.income : colors.expense }}>{money(outstanding)}</T>
                    </View>

                    {loan.status === 'open' ? (
                        <>
                            <View style={{ marginVertical: space.md }}>
                                <Progress value={loan.amount ? loan.repaidAmount / loan.amount : 0} tint={lent ? colors.income : colors.expense} />
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ backgroundColor: overdue ? 'rgba(179,38,30,0.12)' : 'rgba(14,16,15,0.07)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill }}>
                                    <T variant="tiny" color={overdue ? colors.expense : colors.inkSoft}>
                                        {days === null ? 'NO DUE DATE' : overdue ? `OVERDUE ${Math.abs(days)}D` : days === 0 ? 'DUE TODAY' : `DUE ${shortDate(loan.dueDate!).toUpperCase()}`}
                                    </T>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <IconButton Icon={Trash2} size={40} label={`Delete loan with ${loan.person}`} onPress={async () => {
                                        if (await confirmAction('Delete this loan?', `The record with ${loan.person} will be removed.`, 'Delete', true)) run(() => api.deleteLoan(loan.id));
                                    }} />
                                    <PillButton label="Part" variant="glass" style={{ minHeight: 40, paddingHorizontal: 16 }} onPress={() => { setFormError(null); setPayment(''); setPaying(loan); }} />
                                    <PillButton label="Settled" style={{ minHeight: 40, paddingHorizontal: 16 }} onPress={() => run(() => api.repayLoan(loan.id))} />
                                </View>
                            </View>
                        </>
                    ) : (
                        <T variant="small" color={colors.muted} style={{ marginTop: 6 }}>Settled{loan.settledAt ? ` on ${shortDate(loan.settledAt)}` : ''}</T>
                    )}
                </Glass>
            </Reveal>
        );
    };

    return (
        <Screen refreshing={refreshing} onRefresh={pullToRefresh}>
            <Header title="Loans" right={<IconButton Icon={Plus} tone="ink" label="New loan" onPress={() => { setFormError(null); setCreating(true); }} />} />
            <ErrorBanner message={error ?? (paying || creating ? null : formError)} onRetry={reload} />

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.lg }}>
                <Glass strong style={{ flex: 1, padding: space.lg }}>
                    <T variant="tiny" color={colors.muted}>OWED TO YOU</T>
                    <T variant="title" color={colors.income} style={{ fontSize: 22, marginTop: 2 }}>{money(owedToUs)}</T>
                </Glass>
                <Glass strong style={{ flex: 1, padding: space.lg }}>
                    <T variant="tiny" color={colors.muted}>YOU OWE</T>
                    <T variant="title" color={colors.expense} style={{ fontSize: 22, marginTop: 2 }}>{money(weOwe)}</T>
                </Glass>
            </View>

            {loading && !data ? <Loading /> : null}
            {data && open.length === 0 ? <Empty Icon={HandCoins} title="Nothing lent or borrowed" hint="Add a loan to keep track of who owes what, with a reminder when it is due." /> : null}

            <View style={{ gap: 12 }}>{open.map(renderLoan)}</View>

            {settled.length > 0 ? (
                <>
                    <T variant="small" color={colors.inkSoft} style={{ marginTop: space.xl, marginBottom: space.md, fontFamily: fonts.bold }}>Settled</T>
                    <View style={{ gap: 12 }}>{settled.map((l, i) => renderLoan(l, i))}</View>
                </>
            ) : null}

            <Sheet visible={creating} onClose={() => setCreating(false)} title="New loan">
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={formError} />
                    <Segmented value={direction} onChange={setDirection} options={[{ value: 'lent', label: 'I lent' }, { value: 'borrowed', label: 'I borrowed' }]} />
                    <Field label={direction === 'lent' ? 'Lent to' : 'Borrowed from'} value={person} onChangeText={setPerson} placeholder="Name" autoCapitalize="words" />
                    <Field label="Amount" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))} placeholder="5000" keyboardType="decimal-pad" />
                    <Field label="Due date (defaults to +7 days)" value={due} onChangeText={setDue} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                    <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="What was it for?" maxLength={300} />
                    <PillButton label="Save loan" onPress={create} loading={busy} />
                </View>
            </Sheet>

            <Sheet visible={!!paying} onClose={() => setPaying(null)} title={paying ? `Part payment · ${paying.person}` : ''}>
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={formError} />
                    <T variant="small" color={colors.muted}>Still open: {paying ? money(paying.amount - paying.repaidAmount) : ''}</T>
                    <Field label="Amount received or paid" value={payment} onChangeText={(t) => setPayment(t.replace(/[^0-9.]/g, ''))} placeholder="1000" keyboardType="decimal-pad" autoFocus />
                    <PillButton
                        label="Record payment"
                        loading={busy}
                        onPress={async () => {
                            const value = parseFloat(payment);
                            if (!paying || !(value > 0)) return setFormError('Enter an amount greater than zero.');
                            if (await run(() => api.repayLoan(paying.id, value))) setPaying(null);
                        }}
                    />
                </View>
            </Sheet>
        </Screen>
    );
}
