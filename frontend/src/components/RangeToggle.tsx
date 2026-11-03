import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius } from '@/constants/theme';
import type { TrendRange } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import { T } from './ui';

// The Day / Week / Month / Year switch used by the charts.
export function RangeToggle({ value, onChange }: { value: TrendRange; onChange: (range: TrendRange) => void }) {
    const { t } = useTranslation();
    const options: { value: TrendRange; label: string }[] = [
        { value: 'day', label: t('range_day') },
        { value: 'week', label: t('range_week') },
        { value: 'month', label: t('range_month') },
        { value: 'year', label: t('range_year') },
    ];

    return (
        <View style={styles.track}>
            {options.map((option) => {
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
    track: {
        flexDirection: 'row',
        alignSelf: 'flex-start',
        padding: 3,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(14,16,15,0.08)',
    },
    option: {
        minWidth: 54,
        minHeight: 30,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    active: {
        backgroundColor: colors.ink,
    },
});
