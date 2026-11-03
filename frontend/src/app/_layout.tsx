import {
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/context/auth';
import { Loading, Screen } from '@/components/ui';

function Routes() {
    const { status, me } = useAuth();
    const signedIn = status === 'signedIn';
    const hasFamily = signedIn && !!me?.familyId;

    if (status === 'loading') {
        return (
            <Screen scroll={false}>
                <Loading />
            </Screen>
        );
    }

    return (
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Protected guard={!signedIn} redirectTo="/(tabs)">
                <Stack.Screen name="sign-in" />
                <Stack.Screen name="sign-up" />
            </Stack.Protected>

            <Stack.Protected guard={signedIn && !hasFamily} redirectTo={signedIn ? '/(tabs)' : '/sign-in'}>
                <Stack.Screen name="onboarding" />
            </Stack.Protected>

            <Stack.Protected guard={hasFamily} redirectTo={!signedIn ? '/sign-in' : '/onboarding'}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="goals" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="loans" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="budgets" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="recurring" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="sms-import" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="requests" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="ask" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack.Protected>
        </Stack>
    );
}

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        PlusJakartaSans_400Regular,
        PlusJakartaSans_500Medium,
        PlusJakartaSans_600SemiBold,
        PlusJakartaSans_700Bold,
        PlusJakartaSans_800ExtraBold,
    });

    if (!fontsLoaded) return null;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <AuthProvider>
                    <StatusBar style="dark" />
                    <Routes />
                </AuthProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
