import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

interface AsyncState<T> {
    data: T | null;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    reload: () => Promise<void>;
    pullToRefresh: () => Promise<void>;
}

// Loads when the screen comes into focus and again whenever `deps` change, so data is fresh after
// adding something on another screen. `deps` must include everything `fetcher` closes over.
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const latest = useRef(0);

    const run = useCallback(async () => {
        const ticket = ++latest.current;
        try {
            const result = await fetcher();
            if (ticket !== latest.current) return;
            setData(result);
            setError(null);
        } catch (e) {
            if (ticket !== latest.current) return;
            setError((e as Error).message);
        } finally {
            if (ticket === latest.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useFocusEffect(
        useCallback(() => {
            run();
        }, [run])
    );

    const pullToRefresh = useCallback(async () => {
        setRefreshing(true);
        await run();
    }, [run]);

    return { data, loading, refreshing, error, reload: run, pullToRefresh };
}
