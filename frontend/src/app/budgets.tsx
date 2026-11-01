import { PiggyBank, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Header } from '@/components/Header';
import { Chip, Empty, ErrorBanner, Field, Glass, IconButton, Loading, PillButton, Progress, Reveal, Screen, Sheet, T } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { categoriesFor, getCategory } from '@/lib/categories';
import { confirmAction } from '@/lib/dialog';
import { formatAmountInput, money, monthKey, parseAmountInput, tzOffset } from '@/lib/format';

export default function Budgets() {
    const familyId = useFamilyId();
    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(async () => {
        const [budgets, summary, family] = await Promise.all([
            api.budgets(familyId),
            api.summary(familyId, monthKey(), tzOffset()),
            api.family(familyId),
        ]);
        return { budgets, summary, family };
    }, [familyId]);

    const [editing, setEditing] = useState(false);
    const [category, setCategory] = useState('');
    const [limit, setLimit] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const spent = (name: string) => data?.summary?.byCategory?.find((c) => c.category.toLowerCase() === name.toLowerCase())?.total ?? 0;

    const openSheet = (name = '', current = '') => {
        setCategory(name);
        setLimit(current ? formatAmountInput(current) : '');
        setFormError(null);
        setEditing(true);
    };

    const save = async () => {
        const value = parseAmountInput(limit);
        if (!category) return setFormError('Pick a category.');
        if (!(value > 0)) return setFormError('Enter a monthly limit greater than zero.');
        setBusy(true);
        try {
            await api.setBudget(familyId, category, value);
            await reload();
            setEditing(false);
        } catch (e) {
            setFormError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Screen refreshing={refreshing} onRefresh={pullToRefresh}>
            <Header title="Budgets" right={<IconButton Icon={Plus} tone="ink" label="New budget" onPress={() => openSheet()} />} />
            <T variant="small" color={colors.inkSoft} style={{ marginBottom: space.lg }}>Monthly limits, measured against what the family has spent this month.</T>
            <ErrorBanner message={error} onRetry={reload} />
            {loading && !data ? <Loading /> : null}
            {data && data.budgets.length === 0 ? <Empty Icon={PiggyBank} title="No budgets yet" hint="Set a limit for groceries, travel or anything you want to keep an eye on." /> : null}

            <View style={{ gap: 12 }}>
                {(data?.budgets ?? []).map((budget, i) => {
                    const used = spent(budget.category);
                    const over = used > budget.limit;
                    const cat = getCategory(budget.category, data?.family?.customCategories);
                    return (
                        <Reveal key={budget.id} index={i}>
                            <Pressable accessibilityRole="button" onPress={() => openSheet(budget.category, String(budget.limit))}>
                                <Glass strong>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                                        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: `${cat.tint}22`, alignItems: 'center', justifyContent: 'center' }}>
                                            <cat.Icon size={20} color={cat.tint} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <T variant="heading">{budget.category}</T>
                                            <T variant="small" color={over ? colors.expense : colors.muted}>
                                                {over ? `${money(used - budget.limit)} over` : `${money(budget.limit - used)} left`}
                                            </T>
                                        </View>
                                        <IconButton Icon={Trash2} size={38} label={`Delete ${budget.category} budget`} onPress={async () => {
                                            if (await confirmAction('Delete this budget?', `The ${budget.category} limit will be removed.`, 'Delete', true)) {
                                                await api.deleteBudget(budget.id);
                                                reload();
                                            }
                                        }} />
                                    </View>
                                    <View style={{ marginVertical: space.md }}>
                                        <Progress value={budget.limit > 0 ? used / budget.limit : 0} tint={over ? colors.expense : colors.ink} height={10} />
                                    </View>
                                    <T variant="small" color={colors.inkSoft}>{money(used)} of {money(budget.limit)}</T>
                                </Glass>
                            </Pressable>
                        </Reveal>
                    );
                })}
            </View>

            <Sheet visible={editing} onClose={() => setEditing(false)} title="Monthly budget">
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={formError} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {categoriesFor('expense', data?.family?.customCategories).map((c) => (
                            <Chip key={c.name} label={c.name} Icon={c.Icon} active={category === c.name} onPress={() => setCategory(c.name)} />
                        ))}
                    </View>
                    <Field label="Limit per month" value={limit} onChangeText={(t) => setLimit((prev) => formatAmountInput(t, prev))} placeholder="6,000" keyboardType="decimal-pad" />
                    <PillButton label="Save budget" onPress={save} loading={busy} />
                </View>
            </Sheet>
        </Screen>
    );
}
