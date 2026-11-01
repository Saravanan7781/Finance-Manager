import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { BellRing, Check, ChevronRight, Copy, Download, HandCoins, LogOut, MessageSquare, Palette, PiggyBank, Plus, RefreshCw, Repeat, Share2, Tag, Target, Trash2, UserCheck, UserMinus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Avatar, Chip, ErrorBanner, Field, Glass, IconButton, PillButton, Screen, SectionHeader, Segmented, Sheet, SuccessBanner, T } from '@/components/ui';
import { activePalette, colors, fonts, PALETTE_LIST, paletteName, radius, savePalette, space, type PaletteId } from '@/constants/theme';
import { useAuth, useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/dialog';
import { exportTransactionsCsv } from '@/lib/export';
import { restartApp } from '@/lib/restart';
import { remindersEnabled, remindersSupported, setRemindersEnabled } from '@/lib/notifications';
import type { TxType } from '@/lib/types';

const CATEGORY_TINTS = [
    '#2B8A5F', // Emerald
    '#2B66E0', // Blue
    '#E8590C', // Orange
    '#D6336C', // Pink
    '#7048E8', // Purple
    '#0C8599', // Cyan
    '#B5651D', // Brown
    '#495057', // Charcoal
];

export default function Family() {
    const { me, refresh, signOut } = useAuth();
    const familyId = useFamilyId();
    const isAdmin = me?.family?.admin === me?.uid;

    const [copied, setCopied] = useState(false);
    const [reminders, setReminders] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [renaming, setRenaming] = useState(false);
    const [picking, setPicking] = useState(false);
    const [applying, setApplying] = useState(false);
    const [needsReload, setNeedsReload] = useState(false);
    const [renamingFamily, setRenamingFamily] = useState(false);
    const [familyDraft, setFamilyDraft] = useState('');
    const [name, setName] = useState(me?.displayName ?? '');

    // Custom categories
    const [categorySheet, setCategorySheet] = useState(false);
    const [catName, setCatName] = useState('');
    const [catType, setCatType] = useState<TxType>('expense');
    const [catTint, setCatTint] = useState(CATEGORY_TINTS[0]);
    const [catBusy, setCatBusy] = useState(false);
    const [catError, setCatError] = useState<string | null>(null);

    // Export CSV
    const [exportSheet, setExportSheet] = useState(false);
    const [exportRange, setExportRange] = useState<'all' | 'year' | 'month'>('all');
    const [exportType, setExportType] = useState<'all' | TxType>('all');
    const [exportBusy, setExportBusy] = useState(false);
    const [exportSuccess, setExportSuccess] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    // Every colour is read once at start-up, so a new palette is saved and the app restarts to wear it.
    const choosePalette = async (id: PaletteId) => {
        if (id === activePalette) return setPicking(false);
        setApplying(true);
        setNeedsReload(false);
        savePalette(id);
        await restartApp('Color theme changed');
        // Still here means the app did not restart by itself. The theme is saved either way.
        setApplying(false);
        setNeedsReload(true);
    };

    const { data, error: loadError, reload, refreshing, pullToRefresh } = useAsync(async () => {
        const family = await api.family(familyId);
        const requests = family.admin === me?.uid ? await api.joinRequests(familyId) : [];
        return { family, requests };
    }, [familyId, me?.uid]);

    useEffect(() => {
        remindersEnabled().then(setReminders);
    }, []);

    const family = data?.family;
    const code = family?.inviteCode ?? me?.family?.inviteCode ?? '';

    const handleAddCategory = async () => {
        const trimmed = catName.trim();
        if (trimmed.length < 2) return setCatError('Name must be at least 2 characters');
        setCatBusy(true);
        setCatError(null);
        try {
            await api.addCustomCategory(familyId, { name: trimmed, type: catType, tint: catTint });
            setCatName('');
            await reload();
        } catch (e) {
            setCatError((e as Error).message);
        } finally {
            setCatBusy(false);
        }
    };

    const handleDeleteCategory = async (catId: string, catItemName: string) => {
        if (!(await confirmAction('Delete category?', `Category "${catItemName}" will be removed.`, 'Delete', true))) return;
        try {
            await api.deleteCustomCategory(familyId, catId);
            await reload();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const handleExport = async () => {
        setExportBusy(true);
        setExportError(null);
        setExportSuccess(null);
        try {
            const now = new Date();
            let from: string | undefined;
            if (exportRange === 'month') {
                from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
            } else if (exportRange === 'year') {
                from = new Date(Date.UTC(now.getFullYear(), 0, 1)).toISOString();
            }

            const queryType = exportType === 'all' ? undefined : exportType;
            const txs = await api.transactions(familyId, { from, type: queryType, limit: 1000 });

            if (txs.length === 0) {
                setExportError('No transactions found for the selected range.');
                return;
            }

            const result = await exportTransactionsCsv(txs, family?.name || 'Family');
            if (result.success) {
                const actionLabel = result.method === 'download' ? 'Downloaded' : result.method === 'share' ? 'Shared' : 'Copied to clipboard';
                setExportSuccess(`${actionLabel} ${txs.length} transactions.`);
            } else {
                setExportError(result.error || 'Failed to export CSV.');
            }
        } catch (e) {
            setExportError((e as Error).message);
        } finally {
            setExportBusy(false);
        }
    };

    const guard = async (task: () => Promise<unknown>) => {
        setError(null);
        try {
            await task();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const copy = async () => {
        await Clipboard.setStringAsync(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    const share = () =>
        Share.share({ message: `Join our family group on Family Finance! Use invite code: ${code}` }).catch(() => {});

    const toggleReminders = async (on: boolean) => {
        const result = await setRemindersEnabled(on);
        setReminders(result);
        if (on && !result) setError('Notifications are blocked. Turn them on in your phone settings to get reminders.');
    };

    return (
        <Screen bottomInset={96} refreshing={refreshing} onRefresh={pullToRefresh}>
            <T variant="title" style={{ textAlign: 'center' }}>{me?.family?.name}</T>
            <T variant="small" color={colors.inkSoft} style={{ textAlign: 'center', marginBottom: space.lg }}>
                {family?.members.length ?? me?.family?.memberCount ?? 1} members
            </T>

            <ErrorBanner message={error ?? loadError} onRetry={reload} />

            <Glass strong>
                <T variant="tiny" color={colors.muted}>INVITE CODE</T>
                <T variant="display" style={{ fontSize: 34, letterSpacing: 4, marginVertical: space.sm }} selectable>{code}</T>
                <View style={styles.rowGap}>
                    <PillButton label={copied ? 'Copied' : 'Copy'} Icon={Copy} variant="ink" onPress={copy} style={{ flex: 1, minHeight: 46 }} />
                    <PillButton label="Share" Icon={Share2} variant="glass" onPress={share} style={{ flex: 1, minHeight: 46 }} />
                </View>
                {isAdmin ? (
                    <Pressable
                        accessibilityRole="button"
                        style={styles.regen}
                        onPress={async () => {
                            if (await confirmAction('New invite code?', 'The old code stops working.', 'Generate')) {
                                guard(async () => {
                                    await api.regenerateInvite(familyId);
                                    await Promise.all([refresh(), reload()]);
                                });
                            }
                        }}
                    >
                        <RefreshCw size={14} color={colors.muted} />
                        <T variant="small" color={colors.muted}>Generate a new code</T>
                    </Pressable>
                ) : null}
            </Glass>

            {isAdmin && (data?.requests.length ?? 0) > 0 ? (
                <Pressable accessibilityRole="button" onPress={() => router.push('/requests')} style={styles.requests}>
                    <UserCheck size={20} color={colors.ink} />
                    <T variant="body" style={{ flex: 1, fontFamily: fonts.bold }}>
                        {data!.requests.length} join request{data!.requests.length > 1 ? 's' : ''} waiting
                    </T>
                    <ChevronRight size={18} color={colors.ink} />
                </Pressable>
            ) : null}

            <SectionHeader title="Plan together" />
            <Glass style={{ paddingVertical: 4 }}>
                <NavRow Icon={Target} label="Goals" hint="Save for what matters" onPress={() => router.push('/goals')} />
                <NavRow Icon={HandCoins} label="Loans" hint="Money lent and borrowed" onPress={() => router.push('/loans')} />
                <NavRow Icon={PiggyBank} label="Budgets" hint="Monthly limits by category" onPress={() => router.push('/budgets')} />
                <NavRow Icon={Repeat} label="Recurring Bills" hint="Rent, bills, subscriptions" onPress={() => router.push('/recurring')} />
                <NavRow Icon={Tag} label="Custom Categories" hint="Personalize transaction categories" onPress={() => setCategorySheet(true)} />
                <NavRow
                    Icon={Download}
                    label="Export to CSV"
                    hint="Download backup & spreadsheet"
                    onPress={() => { setExportSuccess(null); setExportError(null); setExportSheet(true); }}
                    last={Platform.OS !== 'android' && !__DEV__}
                />
                {(Platform.OS === 'android' || __DEV__) && (
                    <NavRow
                        Icon={MessageSquare}
                        label="Extract from SMS"
                        hint="Scan messages & import bank transactions"
                        onPress={() => router.push('/sms-import')}
                        last
                    />
                )}
            </Glass>

            <SectionHeader title="Members" />
            <Glass style={{ paddingVertical: 8 }}>
                {(family?.members ?? []).map((member, i, all) => (
                    <View key={member.uid} style={[styles.member, i < all.length - 1 && styles.memberLine]}>
                        <Avatar name={member.displayName} size={42} />
                        <View style={{ flex: 1 }}>
                            <T variant="body" style={{ fontFamily: fonts.bold }}>
                                {member.displayName}{member.uid === me?.uid ? ' (you)' : ''}
                            </T>
                            <T variant="small" color={colors.muted}>{member.role === 'admin' ? 'Admin' : 'Member'}</T>
                        </View>
                        {isAdmin && member.uid !== me?.uid ? (
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Make ${member.displayName} admin`}
                                    style={styles.mini}
                                    onPress={async () => {
                                        if (await confirmAction('Make admin?', `${member.displayName} will manage the family and you become a member.`, 'Make admin')) {
                                            guard(async () => {
                                                await api.transferAdmin(familyId, member.uid);
                                                await Promise.all([refresh(), reload()]);
                                            });
                                        }
                                    }}
                                >
                                    <UserCheck size={17} color={colors.ink} />
                                </Pressable>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${member.displayName}`}
                                    style={styles.mini}
                                    onPress={async () => {
                                        if (await confirmAction('Remove member?', `${member.displayName} will lose access to this family.`, 'Remove', true)) {
                                            guard(async () => {
                                                await api.removeMember(familyId, member.uid);
                                                await Promise.all([refresh(), reload()]);
                                            });
                                        }
                                    }}
                                >
                                    <UserMinus size={17} color={colors.expense} />
                                </Pressable>
                            </View>
                        ) : null}
                    </View>
                ))}
            </Glass>

            <SectionHeader title="You" />
            <Glass style={{ paddingVertical: 4 }}>
                <NavRow Icon={Target} label="Your name" hint={me?.displayName} onPress={() => { setName(me?.displayName ?? ''); setRenaming(true); }} />
                {isAdmin ? (
                    <NavRow
                        Icon={Users}
                        label="Family name"
                        hint={me?.family?.name}
                        onPress={() => {
                            setFamilyDraft(me?.family?.name ?? '');
                            setRenamingFamily(true);
                        }}
                    />
                ) : null}
                <NavRow Icon={Palette} label="Color theme" hint={paletteName} onPress={() => setPicking(true)} />
                {remindersSupported ? (
                    <View style={styles.navRow}>
                        <BellRing size={20} color={colors.ink} />
                        <View style={{ flex: 1 }}>
                            <T variant="body" style={{ fontFamily: fonts.bold }}>Smart reminders</T>
                            <T variant="small" color={colors.muted}>Loan due dates and goal deadlines</T>
                        </View>
                        <Switch value={reminders} onValueChange={toggleReminders} trackColor={{ true: colors.ink, false: '#D5DBD8' }} thumbColor={Platform.OS === 'android' ? colors.white : undefined} />
                    </View>
                ) : null}
            </Glass>

            <View style={{ gap: 10, marginTop: space.xl }}>
                <PillButton
                    label={isAdmin && (family?.members.length ?? 1) > 1 ? 'Leave (hand over admin first)' : 'Leave family'}
                    Icon={LogOut}
                    variant="danger"
                    onPress={async () => {
                        if (await confirmAction('Leave this family?', 'You will lose access to its transactions, goals and loans.', 'Leave', true)) {
                            guard(async () => {
                                await api.leaveFamily();
                                await refresh();
                            });
                        }
                    }}
                />
                <PillButton label="Sign out" variant="glass" onPress={signOut} />
            </View>

            <Sheet visible={renamingFamily} onClose={() => setRenamingFamily(false)} title="Family name">
                <View style={{ gap: space.lg }}>
                    <Field label="Name" value={familyDraft} onChangeText={setFamilyDraft} autoCapitalize="words" maxLength={50} autoFocus />
                    <T variant="small" color={colors.muted}>Everyone in the family sees the new name.</T>
                    <PillButton
                        label="Save"
                        onPress={() => {
                            const next = familyDraft.trim();
                            if (next.length < 2) return setError('A family name needs at least 2 characters.');
                            guard(async () => {
                                await api.renameFamily(familyId, next);
                                await Promise.all([refresh(), reload()]);
                                setRenamingFamily(false);
                            });
                        }}
                    />
                </View>
            </Sheet>

            <Sheet visible={picking} onClose={() => !applying && setPicking(false)} title="Color theme">
                <View style={{ gap: 10 }}>
                    {PALETTE_LIST.map((palette) => {
                        const active = palette.id === activePalette;
                        return (
                            <Pressable
                                key={palette.id}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${palette.name}${active ? ', current' : ''}`}
                                disabled={applying}
                                onPress={() => choosePalette(palette.id)}
                                style={[styles.paletteRow, active && styles.paletteRowActive]}
                            >
                                <View style={styles.swatches}>
                                    {palette.swatches.map((color, i) => (
                                        <View key={i} style={[styles.swatch, { backgroundColor: color, marginLeft: i === 0 ? 0 : -10 }]} />
                                    ))}
                                </View>
                                <T variant="body" style={{ flex: 1, fontFamily: fonts.bold }}>{palette.name}</T>
                                {active ? <Check size={20} color={colors.ink} strokeWidth={2.8} /> : null}
                            </Pressable>
                        );
                    })}
                    <T variant="small" color={needsReload ? colors.ink : colors.muted} style={{ textAlign: 'center', marginTop: 4, fontFamily: needsReload ? fonts.bold : fonts.medium }}>
                        {applying
                            ? 'Applying…'
                            : needsReload
                              ? 'Saved! Now shake your phone and tap Reload (or close and reopen the app) to see it.'
                              : 'The app restarts for a moment to apply a new theme.'}
                    </T>
                </View>
            </Sheet>

            <Sheet visible={renaming} onClose={() => setRenaming(false)} title="Your name">
                <View style={{ gap: space.lg }}>
                    <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
                    <PillButton
                        label="Save"
                        onPress={() => {
                            if (name.trim().length < 2) return setError('Names need at least 2 letters.');
                            guard(async () => {
                                await api.updateMe(name.trim());
                                await Promise.all([refresh(), reload()]);
                                setRenaming(false);
                            });
                        }}
                    />
                </View>
            </Sheet>

            {/* ── Custom Categories Sheet ── */}
            <Sheet visible={categorySheet} onClose={() => setCategorySheet(false)} title="Custom Categories">
                <View style={{ gap: space.lg }}>
                    <ErrorBanner message={catError} />

                    <View>
                        <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
                            FAMILY CATEGORIES
                        </T>
                        {(family?.customCategories ?? []).length === 0 ? (
                            <T variant="small" color={colors.inkSoft} style={{ fontStyle: 'italic', marginBottom: 8 }}>
                                No custom categories yet. Add one below to use it across transactions, budgets, and insights.
                            </T>
                        ) : (
                            <View style={{ gap: 8, marginBottom: 8 }}>
                                {(family?.customCategories ?? []).map((cat) => (
                                    <View
                                        key={cat.id}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            paddingVertical: 10,
                                            paddingHorizontal: 12,
                                            borderRadius: radius.md,
                                            backgroundColor: colors.white,
                                            borderWidth: 1,
                                            borderColor: colors.hairline,
                                        }}
                                    >
                                        <View
                                            style={{
                                                width: 14,
                                                height: 14,
                                                borderRadius: 7,
                                                backgroundColor: cat.tint || colors.ink,
                                                marginRight: 10,
                                            }}
                                        />
                                        <View style={{ flex: 1 }}>
                                            <T variant="body" style={{ fontFamily: fonts.bold }}>{cat.name}</T>
                                            <T variant="tiny" color={colors.muted}>{cat.type.toUpperCase()}</T>
                                        </View>
                                        <IconButton
                                            Icon={Trash2}
                                            size={36}
                                            label={`Delete ${cat.name}`}
                                            onPress={() => handleDeleteCategory(cat.id, cat.name)}
                                        />
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: space.md, gap: space.md }}>
                        <T variant="heading" style={{ fontSize: 16 }}>Add New Category</T>
                        <Segmented
                            value={catType}
                            onChange={setCatType}
                            options={[
                                { value: 'expense', label: 'Expense' },
                                { value: 'income', label: 'Income' },
                            ]}
                        />
                        <Field
                            label="Category Name"
                            value={catName}
                            onChangeText={setCatName}
                            placeholder="e.g. Pet Care, SIP, Freelance"
                            maxLength={30}
                        />

                        <View>
                            <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
                                COLOR ACCENT
                            </T>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                {CATEGORY_TINTS.map((tint) => (
                                    <Pressable
                                        key={tint}
                                        accessibilityRole="button"
                                        onPress={() => setCatTint(tint)}
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 16,
                                            backgroundColor: tint,
                                            borderWidth: catTint === tint ? 3 : 1,
                                            borderColor: catTint === tint ? colors.ink : 'transparent',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {catTint === tint && <Check size={16} color={colors.white} strokeWidth={3} />}
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        <PillButton label="Add Category" onPress={handleAddCategory} loading={catBusy} />
                    </View>
                </View>
            </Sheet>

            {/* ── Export CSV Sheet ── */}
            <Sheet visible={exportSheet} onClose={() => setExportSheet(false)} title="Export to CSV">
                <View style={{ gap: space.lg }}>
                    <SuccessBanner message={exportSuccess} />
                    <ErrorBanner message={exportError} />

                    <T variant="small" color={colors.inkSoft}>
                        Export your family's transactions as a standard CSV spreadsheet file for Excel, Google Sheets, or personal backup.
                    </T>

                    <View>
                        <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
                            TIME RANGE
                        </T>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Chip label="All time" active={exportRange === 'all'} onPress={() => setExportRange('all')} />
                            <Chip label="This year" active={exportRange === 'year'} onPress={() => setExportRange('year')} />
                            <Chip label="This month" active={exportRange === 'month'} onPress={() => setExportRange('month')} />
                        </View>
                    </View>

                    <View>
                        <T variant="tiny" color={colors.muted} style={{ marginBottom: 8, marginLeft: 4 }}>
                            TRANSACTION TYPE
                        </T>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Chip label="All" active={exportType === 'all'} onPress={() => setExportType('all')} />
                            <Chip label="Expenses only" active={exportType === 'expense'} onPress={() => setExportType('expense')} />
                            <Chip label="Income only" active={exportType === 'income'} onPress={() => setExportType('income')} />
                        </View>
                    </View>

                    <PillButton
                        label="Download CSV"
                        Icon={Download}
                        onPress={handleExport}
                        loading={exportBusy}
                        style={{ marginTop: space.sm }}
                    />
                </View>
            </Sheet>
        </Screen>
    );
}

function NavRow({ Icon, label, hint, onPress, last }: { Icon: typeof Target; label: string; hint?: string; onPress: () => void; last?: boolean }) {
    return (
        <Pressable accessibilityRole="button" onPress={onPress} style={[styles.navRow, !last && styles.memberLine]}>
            <Icon size={20} color={colors.ink} />
            <View style={{ flex: 1 }}>
                <T variant="body" style={{ fontFamily: fonts.bold }}>{label}</T>
                {hint ? <T variant="small" color={colors.muted}>{hint}</T> : null}
            </View>
            <ChevronRight size={18} color={colors.faint} />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    rowGap: { flexDirection: 'row', gap: 10 },
    regen: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: space.md, padding: 6 },
    requests: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.lemon },
    member: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12 },
    memberLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
    mini: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(14,16,15,0.06)', alignItems: 'center', justifyContent: 'center' },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
    paletteRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 2, borderColor: 'transparent', backgroundColor: 'rgba(14,16,15,0.04)' },
    paletteRowActive: { borderColor: colors.ink, backgroundColor: colors.white },
    swatches: { flexDirection: 'row', alignItems: 'center' },
    swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.white },
});
