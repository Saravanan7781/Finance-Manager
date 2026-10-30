import { Alert, Platform } from 'react-native';

// Alert.alert has no buttons on web, so fall back to the browser's own confirm there.
export const confirmAction = (title: string, message: string, confirmLabel = 'Confirm', destructive = false) => {
    if (Platform.OS === 'web') {
        return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
    }
    return new Promise<boolean>((resolve) => {
        Alert.alert(
            title,
            message,
            [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
        );
    });
};
