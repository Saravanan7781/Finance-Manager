import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ErrorBanner, Field, Glass, PillButton, Screen, T } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { authMessage } from '@/lib/firebase';

export default function SignIn() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!email.trim() || !password) {
            setError('Enter your email and password.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await signIn(email, password);
        } catch (e) {
            setError(authMessage(e));
            setBusy(false);
        }
    };

    return (
        <Screen keyboard contentStyle={{ justifyContent: 'center' }}>
            <View style={{ marginBottom: space.xl }}>
                <T variant="display">Welcome{'\n'}back.</T>
                <T variant="body" color={colors.inkSoft} style={{ marginTop: space.sm }}>
                    Sign in to see how your family is doing.
                </T>
            </View>

            <Glass strong style={{ gap: space.lg }}>
                <ErrorBanner message={error} />
                <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="Your password" onSubmitEditing={submit} />
                <PillButton label="Sign in" onPress={submit} loading={busy} />
            </Glass>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: space.xl, gap: 6 }}>
                <T variant="body" color={colors.inkSoft}>New here?</T>
                <Link href="/sign-up" replace>
                    <T variant="body" style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>Create an account</T>
                </Link>
            </View>
        </Screen>
    );
}
