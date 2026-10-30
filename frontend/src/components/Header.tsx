import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { colors, space } from '@/constants/theme';
import { IconButton, T } from './ui';

export function Header({
    title,
    right,
    dark = false,
    close = false,
}: {
    title: string;
    right?: React.ReactNode;
    dark?: boolean;
    close?: boolean;
}) {
    return (
        <View style={styles.row}>
            <IconButton
                Icon={close ? X : ChevronLeft}
                label={close ? 'Close' : 'Back'}
                tone={dark ? 'onDark' : 'glass'}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
            <T variant="heading" color={dark ? colors.white : colors.ink} style={styles.title}>
                {title}
            </T>
            <View style={styles.right}>{right}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
    title: { flex: 1, textAlign: 'center' },
    right: { minWidth: 44, alignItems: 'flex-end' },
});
