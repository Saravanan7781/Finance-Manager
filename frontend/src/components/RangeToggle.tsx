import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius } from '@/constants/theme';
import type { TrendRange } from '@/lib/types';
import { T } from './ui';

const OPTIONS: { value: TrendRange; label: string }[] = [
    { value: 'day', label: 'DAYS' },
    { value: 'week', label: 'WEEKS' },
    { value: 'month', label: 'MONTHS' },
];

// The small Days / Weeks / Months switch used by the charts.
export function RangeToggle({ value, onChange }: { value: TrendRange; onChange: (range: TrendRange) => void }) {
    return (
        <View style={styles.track}>
            {OPTIONS.map((option) => {
                const active = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => !active && onChange(option.value)}
                        style={[styles.option, active && styles.active]}
                    >
                        <T variant="tiny" color={active ? colors.white : colors.inkSoft} style={{ fontFamily: fonts.bold }}>
                            {option.label}
                        </T>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    track: { flexDirection: 'row', alignSelf: 'flex-start', padding: 3, borderRadius: radius.pill, backgroundColor: 'rgba(14,16,15,0.08)' },
    option: { minWidth: 64, minHeight: 30, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    active: { backgroundColor: colors.ink },
});
