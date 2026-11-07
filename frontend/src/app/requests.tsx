import { Check, UserCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Header } from '@/components/Header';
import { Avatar, Empty, ErrorBanner, Glass, IconButton, Loading, Reveal, Screen, Skeleton, T } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useAuth, useFamilyId } from '@/context/auth';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

export default function Requests() {
    const familyId = useFamilyId();
    const { refresh } = useAuth();
    const { data, loading, error, reload, refreshing, pullToRefresh } = useAsync(() => api.joinRequests(familyId), [familyId]);
    const [actionError, setActionError] = useState<string | null>(null);

    const decide = async (id: string, approve: boolean) => {
        setActionError(null);
        try {
            await (approve ? api.approveRequest(id) : api.rejectRequest(id));
            await Promise.all([reload(), refresh()]);
        } catch (e) {
            setActionError((e as Error).message);
            reload();
        }
    };

    return (
        <Screen refreshing={refreshing} onRefresh={pullToRefresh}>
            <Header title="Join requests" />
            <ErrorBanner message={error ?? actionError} onRetry={reload} />
            {loading && !data ? (
                <View style={{ gap: 12 }}>
                    {[0, 1].map((i) => (
                        <Glass key={i} strong style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                            <Skeleton width={42} height={42} radius={21} />
                            <View style={{ flex: 1, gap: 6 }}>
                                <Skeleton width="50%" height={16} />
                                <Skeleton width="70%" height={12} />
                            </View>
                            <Skeleton width={42} height={42} radius={21} />
                            <Skeleton width={42} height={42} radius={21} />
                        </Glass>
                    ))}
                </View>
            ) : null}
            {data && data.length === 0 ? <Empty Icon={UserCheck} title="No one is waiting" hint="Share your invite code and requests show up here." /> : null}

            <View style={{ gap: 12 }}>
                {(data ?? []).map((request, i) => (
                    <Reveal key={request.id} index={i}>
                        <Glass strong style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                            <Avatar name={request.displayName} />
                            <View style={{ flex: 1 }}>
                                <T variant="heading" numberOfLines={1}>{request.displayName}</T>
                                <T variant="small" color={colors.muted} numberOfLines={1}>{request.email} · {timeAgo(request.createdAt)}</T>
                            </View>
                            <IconButton Icon={X} size={42} label={`Reject ${request.displayName}`} onPress={() => decide(request.id, false)} />
                            <IconButton Icon={Check} size={42} tone="ink" label={`Approve ${request.displayName}`} onPress={() => decide(request.id, true)} />
                        </Glass>
                    </Reveal>
                ))}
            </View>
        </Screen>
    );
}
