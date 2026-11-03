import { Languages } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, space } from '@/constants/theme';
import { useTranslation, Language } from '@/lib/i18n';
import { T } from './ui';

export function LanguageToggle() {
    const { lang, setLanguage } = useTranslation();

    const toggle = () => {
        Haptics.selectionAsync().catch(() => {});
        const next: Language = lang === 'en' ? 'ta' : 'en';
        setLanguage(next);
    };

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Change language, currently ${lang === 'en' ? 'English' : 'Tamil'}`}
            onPress={toggle}
            style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
        >
            <Languages size={14} color={colors.ink} strokeWidth={2.4} />
            <T variant="tiny" style={styles.text}>
                {lang === 'en' ? 'தமிழ்' : 'English'}
            </T>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.mint1,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.mint2,
    },
    text: {
        fontFamily: fonts.bold,
        color: colors.ink,
        fontSize: 12,
    },
});
