import { reloadAppAsync } from 'expo';
import { DevSettings, Platform } from 'react-native';

// Restarts the app so every colour is read afresh. A successful restart destroys this code, so the
// function only ever *returns* when nothing happened, and the caller can tell the person what to do.
export const restartApp = async (reason: string) => {
    try {
        if (Platform.OS === 'web') {
            window.location.reload();
        } else if (__DEV__) {
            // Expo's own reloadAppAsync silently does nothing in Expo Go, so use React Native's reload there.
            DevSettings.reload(reason);
        } else {
            await reloadAppAsync(reason);
        }
    } catch {
        // Fall through to the "did not restart" path below.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
};
