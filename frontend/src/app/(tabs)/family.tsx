import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { BellRing, Check, ChevronRight, Copy, HandCoins, LogOut, Palette, PiggyBank, RefreshCw, Share2, Target, UserCheck, UserMinus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';
import { Avatar, ErrorBanner, Field, Glass, PillButton, Screen, SectionHeader, Sheet, T } from '@/components/ui';
import { activePalette, colors, fonts, PALETTE_LIST, paletteName, radius, savePalette, space, type PaletteId } from '@/constants/theme';
import { useAuth, useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/dialog';
import { restartApp } from '@/lib/restart';
import { remindersEnabled, remindersSupported, setRemindersEnabled } from '@/lib/notifications';

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
                <NavRow Icon={PiggyBank} label="Budgets" hint="Monthly limits by category" onPress={() => router.push('/budgets')} last />
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
