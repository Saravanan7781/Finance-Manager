import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { Platform } from 'react-native';
import { firebaseConfig } from './config';

let instance: Auth | null = null;

// Created on first use so demo mode, which has no Firebase config, never touches it.
export const getFirebaseAuth = (): Auth => {
    if (instance) return instance;

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

    if (Platform.OS === 'web') {
        instance = FirebaseAuth.getAuth(app);
    } else {
        // Exported only from the React Native build of the SDK, hence the loose access.
        const getReactNativePersistence = (FirebaseAuth as any).getReactNativePersistence;
        try {
            instance = FirebaseAuth.initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
        } catch {
            instance = FirebaseAuth.getAuth(app);
        }
    }
    return instance;
};

// Maps Firebase's error codes to something a person can act on.
export const authMessage = (error: unknown) => {
    const code = (error as { code?: string })?.code ?? '';
    switch (code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
            return 'That email and password do not match.';
        case 'auth/invalid-email':
            return 'Enter a valid email address.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Wait a minute and try again.';
        case 'auth/network-request-failed':
            return 'No connection. Check your internet and try again.';
        default:
            return (error as Error)?.message || 'Something went wrong. Try again.';
    }
};
