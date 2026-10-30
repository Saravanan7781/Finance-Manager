import { Clock, Home, KeyRound, LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { ErrorBanner, Field, Glass, IconButton, PillButton, Screen, Segmented, T } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { api } from '@/lib/api';

// Shown to anyone who is signed in but not yet in a family: start one, or ask to join one.
export default function Onboarding() {
    const { me, refresh, signOut } = useAuth();
    const [mode, setMode] = useState<'create' | 'join'>('create');
    const [familyName, setFamilyName] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const run = async (task: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await task();
            await refresh();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (me?.pendingRequest) {
        return (
            <Screen contentStyle={{ justifyContent: 'center' }}>
                <Glass strong style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
                    <Clock size={38} color={colors.ink} strokeWidth={1.8} />
                    <T variant="title" style={{ textAlign: 'center' }}>Waiting for approval</T>
                    <T variant="body" color={colors.inkSoft} style={{ textAlign: 'center' }}>
                        The admin of {me.pendingRequest.familyName ?? 'the family'} has your request. You will land on the dashboard as soon as they approve it.
                    </T>
                    <ErrorBanner message={error} />
                    <PillButton label="Check again" onPress={() => run(async () => {})} loading={busy} style={{ alignSelf: 'stretch', marginTop: space.md }} />
                    <PillButton label="Sign out" variant="glass" onPress={signOut} style={{ alignSelf: 'stretch' }} />
                </Glass>
            </Screen>
        );
    }

    return (
        <Screen keyboard contentStyle={{ justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: space.lg }}>
                <IconButton Icon={LogOut} label="Sign out" onPress={signOut} />
            </View>

            <T variant="display">Hi, {me?.displayName?.split(' ')[0] ?? 'there'}.</T>
            <T variant="body" color={colors.inkSoft} style={{ marginTop: space.sm, marginBottom: space.xl }}>
                Family Finance works best when tracking together. Choose how to start.
            </T>

            <Segmented
                value={mode}
                onChange={setMode}
                options={[
                    { value: 'create', label: 'Start a family' },
                    { value: 'join', label: 'Join with a code' },
                ]}
            />

            <Glass strong style={{ marginTop: space.lg, gap: space.lg }}>
                <ErrorBanner message={error} />
                {mode === 'create' ? (
                    <>
                        <Home size={28} color={colors.ink} strokeWidth={1.8} />
                        <Field label="Family name" value={familyName} onChangeText={setFamilyName} placeholder="The Sharma Family" autoCapitalize="words" />
                        <PillButton
                            label="Create family"
                            loading={busy}
                            onPress={() => {
                                if (familyName.trim().length < 2) return setError('Give your family a name (2 to 50 characters).');
                                run(() => api.createFamily(familyName.trim()));
                            }}
                        />
                    </>
                ) : (
                    <>
                        <KeyRound size={28} color={colors.ink} strokeWidth={1.8} />
                        <Field label="Invite code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="A1B2C3D4" autoCapitalize="characters" autoCorrect={false} />
                        <PillButton
                            label="Send join request"
                            loading={busy}
                            onPress={() => {
                                if (code.trim().length < 4) return setError('Enter the invite code you were given.');
                                run(() => api.requestJoin(code.trim()));
                            }}
                        />
                        <T variant="small" color={colors.muted}>An admin approves requests, so it can take a moment.</T>
                    </>
                )}
            </Glass>
        </Screen>
    );
}
