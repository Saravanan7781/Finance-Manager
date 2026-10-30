import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { DEMO } from '@/lib/config';
import { getFirebaseAuth } from '@/lib/firebase';
import type { Me } from '@/lib/types';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
    status: Status;
    me: Me | null;
    loadError: string | null;
    signIn: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    refresh: () => Promise<Me | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<Status>('loading');
    const [me, setMe] = useState<Me | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const profile = await api.me();
            setMe(profile);
            setLoadError(null);
            return profile;
        } catch (error) {
            setLoadError((error as Error).message);
            return null;
        }
    }, []);

    useEffect(() => {
        if (DEMO) {
            refresh().then(() => setStatus('signedIn'));
            return;
        }

        return onAuthStateChanged(getFirebaseAuth(), async (user) => {
            if (!user) {
                setMe(null);
                setStatus('signedOut');
                return;
            }
            await refresh();
            setStatus('signedIn');
        });
    }, [refresh]);

    const signIn = useCallback(async (email: string, password: string) => {
        await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    }, []);

    const register = useCallback(
        async (name: string, email: string, password: string) => {
            await api.register(email.trim(), password, name.trim());
            await signIn(email, password);
        },
        [signIn]
    );

    const signOut = useCallback(async () => {
        if (DEMO) return;
        await firebaseSignOut(getFirebaseAuth());
    }, []);

    const value = useMemo(
        () => ({ status, me, loadError, signIn, register, signOut, refresh }),
        [status, me, loadError, signIn, register, signOut, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const value = useContext(AuthContext);
    if (!value) throw new Error('useAuth must be used inside AuthProvider');
    return value;
}

// The family id is guaranteed once the router has sent the user past onboarding.
export function useFamilyId() {
    const { me } = useAuth();
    return me?.familyId ?? '';
}
