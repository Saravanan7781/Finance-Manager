import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ErrorBanner, Field, Glass, PillButton, Screen, T } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { authMessage } from '@/lib/firebase';

export default function SignUp() {
    const { register } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (name.trim().length < 2) return setError('Tell us your name (at least 2 letters).');
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
        if (password.length < 6) return setError('Pick a password with at least 6 characters.');

        setBusy(true);
        setError(null);
        try {
            await register(name, email, password);
        } catch (e) {
            setError((e as { code?: string }).code ? authMessage(e) : (e as Error).message);
            setBusy(false);
        }
    };

    return (
        <Screen keyboard contentStyle={{ justifyContent: 'center' }}>
            <View style={{ marginBottom: space.xl }}>
                <T variant="display">Let's get{'\n'}started.</T>
                <T variant="body" color={colors.inkSoft} style={{ marginTop: space.sm }}>
                    Money is easier when the whole family sees it.
                </T>
            </View>

            <Glass strong style={{ gap: space.lg }}>
                <ErrorBanner message={error} />
                <Field label="Your name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Asha" />
                <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" onSubmitEditing={submit} />
                <PillButton label="Create account" onPress={submit} loading={busy} />
            </Glass>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: space.xl, gap: 6 }}>
                <T variant="body" color={colors.inkSoft}>Already have an account?</T>
                <Link href="/sign-in" replace>
                    <T variant="body" style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>Sign in</T>
                </Link>
            </View>
        </Screen>
    );
}
