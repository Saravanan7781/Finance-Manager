import { useLocalSearchParams } from 'expo-router';
import { PiggyBank, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Header } from '@/components/Header';
import { Chip, Empty, ErrorBanner, Field, Glass, IconButton, Loading, PillButton, Progress, Reveal, Screen, Segmented, Sheet, Skeleton, T } from '@/components/ui';
import { colors, fonts, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { PAYMENT_METHODS } from '@/lib/categories';
import { confirmAction } from '@/lib/dialog';
import { daysUntil, formatAmountInput, fromDateInput, money, parseAmountInput, shortDate } from '@/lib/format';
import type { Goal } from '@/lib/types';

export default function Goals() {
    const familyId = useFamilyId();
    const params = useLocalSearchParams<{ new?: string }>();
    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(() => api.goals(familyId), [familyId]);

    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [target, setTarget] = useState('');
    const [deadline, setDeadline] = useState('');
    const [funding, setFunding] = useState<Goal | null>(null);
    const [mode, setMode] = useState<'add' | 'take'>('add');
    const [amount, setAmount] = useState('');
    const [recordTx, setRecordTx] = useState(true);
    const [method, setMethod] = useState<string | null>('UPI');
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
        const value = parseAmountInput(target);
        const due = deadline.trim() ? fromDateInput(deadline) : null;
        if (title.trim().length < 2) return setFormError('Name the goal (at least 2 letters).');
        if (!(value > 0)) return setFormError('Enter the amount you want to reach.');
        if (deadline.trim() && !due) return setFormError('Use the date format YYYY-MM-DD, or leave it empty.');

        const ok = await run(() => api.addGoal({ familyId, title: title.trim(), targetAmount: value, ...(due ? { deadline: due.toISOString() } : {}) }));
        if (ok) {
            setCreating(false);
            setTitle('');
            setTarget('');
            setDeadline('');
        }
    };

    const fund = async () => {
        const value = parseAmountInput(amount);
        if (!funding || !(value > 0)) return setFormError('Enter an amount greater than zero.');
        const ok = await run(() => api.contributeToGoal(funding.id, mode === 'add' ? value : -value, recordTx, recordTx ? method : null));
        if (ok) {
            setFunding(null);
            setAmount('');
        }
    };

    return (
        <Screen refreshing={refreshing} onRefresh={pullToRefresh}>
            <Header title="Goals" right={<IconButton Icon={Plus} tone="ink" label="New goal" onPress={() => { setFormError(null); setCreating(true); }} />} />
            <ErrorBanner message={error} onRetry={reload} />
            {loading && !data ? (
                <View style={{ gap: 12 }}>
                    {[0, 1].map((i) => (
                        <Glass key={i} strong style={{ gap: 12, padding: space.lg }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ gap: 6, flex: 1 }}>
                                    <Skeleton width="50%" height={18} />
                                    <Skeleton width="35%" height={12} />
                                </View>
                                <Skeleton width={48} height={24} />
                            </View>
                            <Skeleton height={10} radius={5} />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Skeleton width={130} height={14} />
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Skeleton width={36} height={36} radius={18} />
                                    <Skeleton width={36} height={36} radius={18} />
                                </View>
                            </View>
                        </Glass>
                    ))}
                </View>
            ) : null}
            {data && data.length === 0 ? <Empty Icon={PiggyBank} title="No goals yet" hint="Pick something to save for together, like a trip or an emergency fund." /> : null}

            <View style={{ gap: 12 }}>
                {(data ?? []).map((goal, i) => {
                    const pct = goal.targetAmount ? goal.currentAmount / goal.targetAmount : 0;
                    const done = pct >= 1;
                    const left = goal.deadline ? daysUntil(goal.deadline) : null;
                    return (
                        <Reveal key={goal.id} index={i}>
                            <Glass strong>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                        <T variant="heading" numberOfLines={1}>{goal.title}</T>
                                        <T variant="small" color={done ? colors.income : colors.muted}>
                                            {done ? 'Goal reached' : left === null ? 'No deadline' : left < 0 ? `Deadline passed ${shortDate(goal.deadline!)}` : `${left} day${left === 1 ? '' : 's'} left · ${shortDate(goal.deadline!)}`}
                                        </T>
                                    </View>
                                    <T variant="title" style={{ fontSize: 24, color: done ? colors.income : colors.ink }}>{Math.round(Math.min(pct, 1) * 100)}%</T>
                                </View>
                                <View style={{ marginVertical: space.md }}>
                                    <Progress value={pct} tint={done ? colors.income : colors.ink} height={10} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <T variant="small" color={colors.inkSoft}>
                                        <T variant="small" style={{ fontFamily: fonts.bold }}>{money(goal.currentAmount)}</T> of {money(goal.targetAmount)}
                                    </T>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <IconButton
                                            Icon={Trash2}
                                            size={40}
                                            label={`Delete ${goal.title}`}
                                            onPress={async () => {
                                                if (await confirmAction('Delete this goal?', `"${goal.title}" and its progress will be removed.`, 'Delete', true)) {
                                                    run(() => api.deleteGoal(goal.id));
                                                }
                                            }}
                                        />
                                        <PillButton label="Add money" style={{ minHeight: 40, paddingHorizontal: 18 }} onPress={() => { setFormError(null); setMode('add'); setFunding(goal); }} />
                                    </View>
                                </View>
                            </Glass>
                        </Reveal>
                    );
                })}
            </View>

            <Sheet visible={creating} onClose={() => setCreating(false)} title="New goal">
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={formError} />
                    <Field label="Goal" value={title} onChangeText={setTitle} placeholder="Goa trip" autoCapitalize="sentences" />
                    <Field label="Target amount" value={target} onChangeText={(t) => setTarget((prev) => formatAmountInput(t, prev))} placeholder="60,000" keyboardType="decimal-pad" />
                    <Field label="Deadline (optional)" value={deadline} onChangeText={setDeadline} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                    <PillButton label="Create goal" onPress={create} loading={busy} />
                </View>
            </Sheet>

            <Sheet visible={!!funding} onClose={() => setFunding(null)} title={funding?.title ?? ''}>
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={formError} />
                    <Segmented value={mode} onChange={setMode} options={[{ value: 'add', label: 'Add money' }, { value: 'take', label: 'Take out' }]} />
                    <Field label="Amount" value={amount} onChangeText={(t) => setAmount((prev) => formatAmountInput(t, prev))} placeholder="1,000" keyboardType="decimal-pad" autoFocus />

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <View style={{ flex: 1, paddingRight: space.md }}>
                            <T variant="heading" style={{ fontSize: 15 }}>Record in Activity</T>
                            <T variant="tiny" color={colors.inkSoft}>
                                {mode === 'add' ? 'Log as savings expense' : 'Log as savings withdrawal'}
                            </T>
                        </View>
                        <Switch value={recordTx} onValueChange={setRecordTx} trackColor={{ false: colors.mint2, true: colors.ink }} />
                    </View>

                    {recordTx && (
                        <View>
                            <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>PAID VIA</T>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {PAYMENT_METHODS.map((m) => (
                                    <Chip key={m} label={m} active={method === m} onPress={() => setMethod(method === m ? null : m)} />
                                ))}
                            </View>
                        </View>
                    )}

                    <PillButton label={mode === 'add' ? 'Add to goal' : 'Take out'} onPress={fund} loading={busy} />
                </View>
            </Sheet>
        </Screen>
    );
}
