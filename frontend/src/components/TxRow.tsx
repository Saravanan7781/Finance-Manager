import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius, shadow, space } from '@/constants/theme';
import { getCategory } from '@/lib/categories';
import { money } from '@/lib/format';
import type { Tx } from '@/lib/types';
import { Skeleton, T } from './ui';

// Placeholder with the same footprint as a row, so the list does not jump when data arrives.
export function TxRowSkeleton({ flat = false }: { flat?: boolean }) {
    return (
        <View style={[styles.row, flat && styles.flat]}>
            <Skeleton width={46} height={46} radius={23} />
            <View style={[styles.middle, { gap: 8 }]}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="38%" height={11} />
            </View>
            <Skeleton width={74} height={16} />
        </View>
    );
}

// `flat` drops the card chrome so rows can sit together inside one shared card.
export function TxRow({ tx, onPress, showTime = false, flat = false }: { tx: Tx; onPress?: () => void; showTime?: boolean; flat?: boolean }) {
    const category = getCategory(tx.category);
    const income = tx.type === 'income';
    const Direction = income ? ArrowDownLeft : ArrowUpRight;
    const title = tx.description || tx.category;
    const who = tx.createdByName ? ` · ${tx.createdByName}` : '';
    const via = tx.paymentMethod ? ` · ${tx.paymentMethod}` : '';

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${income ? 'received' : 'paid'} ${money(tx.amount)}`}
            onPress={onPress}
            style={({ pressed }) => [styles.row, flat && styles.flat, { opacity: pressed ? 0.85 : 1 }]}
        >
            <View style={[styles.icon, { backgroundColor: `${category.tint}22` }]}>
                <category.Icon size={21} color={category.tint} strokeWidth={2.2} />
            </View>

            <View style={styles.middle}>
                <T variant="body" numberOfLines={1} style={{ fontFamily: fonts.bold }}>
                    {title}
                </T>
                <View style={styles.sub}>
                    <T variant="small" color={colors.muted} numberOfLines={1}>
                        {income ? 'Received' : 'Paid'}
                        {who}
                        {via}
                        {showTime ? ` · ${new Date(tx.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                    </T>
                    <Direction size={13} color={colors.faint} strokeWidth={2.4} />
                </View>
            </View>

            <T variant="body" color={income ? colors.income : colors.expense} style={{ fontFamily: fonts.extrabold }}>
                {income ? '+' : '-'}
                {money(tx.amount)}
            </T>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        backgroundColor: colors.glassStrong,
        borderRadius: radius.lg,
        paddingVertical: 14,
        paddingHorizontal: space.lg,
        borderWidth: 1,
        borderColor: colors.glassLine,
        ...shadow.card,
        shadowOpacity: 0.07,
        shadowRadius: 14,
    },
    flat: {
        backgroundColor: 'transparent',
        borderRadius: 0,
        borderWidth: 0,
        shadowOpacity: 0,
        elevation: 0,
        paddingVertical: 13,
    },
    icon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    middle: { flex: 1, gap: 2 },
    sub: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
