// Design tokens. Each palette is a coordinated set: a soft base for everyday screens (the "mint" slots),
// a bright accent for the hero card and + button (the "lemon" slots), a deep canvas for Insights (the
// "blue" slots) and a glow for the Ask chat (the "ember" slots). The slot names stay the same across
// palettes so screens never need to know which palette is active.

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type PaletteId = 'mint' | 'lavender' | 'ocean' | 'rose' | 'sunset';

interface PaletteTokens {
    name: string;
    mint0: string;
    mint1: string;
    mint2: string;
    muted: string;
    faint: string;
    lemon: string;
    lemonDeep: string;
    blue0: string;
    blue1: string;
    blue2: string;
    ember0: string;
    ember1: string;
    ember2: string;
    ember3: string;
}

const PALETTES: Record<PaletteId, PaletteTokens> = {
    mint: {
        name: 'Mint & Lemon',
        mint0: '#E4F4E8', mint1: '#C9E8D6', mint2: '#9FD0BF',
        muted: '#5F6E67', faint: '#A9B6AF',
        lemon: '#F7F26B', lemonDeep: '#EDE64A',
        blue0: '#061C63', blue1: '#0B3AA8', blue2: '#2B66E0',
        ember0: '#0A0604', ember1: '#7A2A08', ember2: '#FF6A1A', ember3: '#FFA05A',
    },
    lavender: {
        name: 'Lavender & Peach',
        mint0: '#EEE9FF', mint1: '#DCD2FB', mint2: '#B9A9F0',
        muted: '#615A8A', faint: '#B0AAD0',
        lemon: '#FFC8A2', lemonDeep: '#FFB27E',
        blue0: '#1B1160', blue1: '#3C2BB0', blue2: '#5B43D8',
        ember0: '#0B0612', ember1: '#6A1B8A', ember2: '#D6458F', ember3: '#FF9CC8',
    },
    ocean: {
        name: 'Ocean & Sand',
        mint0: '#E4F5FB', mint1: '#C2E6F4', mint2: '#8FCDE6',
        muted: '#46636E', faint: '#A3B9C2',
        lemon: '#FFE08A', lemonDeep: '#F5CF5C',
        blue0: '#042F34', blue1: '#0B6E75', blue2: '#0E7C86',
        ember0: '#04141A', ember1: '#0B5563', ember2: '#12909F', ember3: '#7FE0EA',
    },
    rose: {
        name: 'Rose & Butter',
        mint0: '#FFEBF0', mint1: '#FAD2DE', mint2: '#F2A9BF',
        muted: '#745160', faint: '#C7ADB8',
        lemon: '#FFE9A3', lemonDeep: '#F7D86B',
        blue0: '#33061F', blue1: '#8C1650', blue2: '#C2255C',
        ember0: '#14060C', ember1: '#7A1230', ember2: '#D7433F', ember3: '#FF9E8F',
    },
    sunset: {
        name: 'Sunset & Mint',
        mint0: '#FFF0E0', mint1: '#FFD9B8', mint2: '#FFB88A',
        muted: '#755A43', faint: '#CDB59E',
        lemon: '#BFF0D8', lemonDeep: '#9BE2C0',
        blue0: '#1A1348', blue1: '#3B2F9E', blue2: '#5B48D6',
        ember0: '#1A0A04', ember1: '#8A3306', ember2: '#D95F0B', ember3: '#FFB36B',
    },
};

const STORAGE_KEY = 'palette';

// Read synchronously so every colour below is already the right one when the first screen draws.
const readStored = (): PaletteId | null => {
    try {
        const value =
            Platform.OS === 'web'
                ? typeof localStorage !== 'undefined'
                    ? localStorage.getItem(STORAGE_KEY)
                    : null
                : SecureStore.getItem(STORAGE_KEY);
        return value && value in PALETTES ? (value as PaletteId) : null;
    } catch {
        return null;
    }
};

export const activePalette: PaletteId = readStored() ?? 'mint';

// Saves the choice for the next start. The caller restarts the app so every style picks it up.
export const savePalette = (id: PaletteId) => {
    try {
        if (Platform.OS === 'web') localStorage.setItem(STORAGE_KEY, id);
        else SecureStore.setItem(STORAGE_KEY, id);
    } catch {
        // Without storage the choice simply does not stick.
    }
};

export const PALETTE_LIST = (Object.keys(PALETTES) as PaletteId[]).map((id) => ({
    id,
    name: PALETTES[id].name,
    swatches: [PALETTES[id].mint1, PALETTES[id].lemon, PALETTES[id].blue1, PALETTES[id].ember2],
}));

export const paletteName = PALETTES[activePalette].name;

const p = PALETTES[activePalette];

export const colors = {
    ink: '#0E100F',
    inkSoft: '#3B413E',
    muted: p.muted,
    faint: p.faint,

    mint0: p.mint0,
    mint1: p.mint1,
    mint2: p.mint2,

    lemon: p.lemon,
    lemonDeep: p.lemonDeep,

    white: '#FFFFFF',
    glass: 'rgba(255,255,255,0.72)',
    glassStrong: 'rgba(255,255,255,0.9)',
    glassLine: 'rgba(255,255,255,0.65)',
    hairline: 'rgba(14,16,15,0.08)',

    income: '#1F8F46',
    expense: '#B3261E',
    warn: '#C77700',

    blue0: p.blue0,
    blue1: p.blue1,
    blue2: p.blue2,

    ember0: p.ember0,
    ember1: p.ember1,
    ember2: p.ember2,
    ember3: p.ember3,
};

export const gradients = {
    mint: [colors.mint0, colors.mint1, colors.mint2] as const,
    blue: [colors.blue2, colors.blue1, colors.blue0] as const,
    ember: [colors.ember2, colors.ember1, colors.ember0] as const,
};

export const radius = {
    sm: 12,
    md: 18,
    lg: 26,
    xl: 34,
    pill: 999,
};

export const space = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
};

export const fonts = {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    extrabold: 'PlusJakartaSans_800ExtraBold',
};

export const shadow = {
    card: {
        shadowColor: '#0B3B2E',
        shadowOpacity: 0.12,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
    },
    float: {
        shadowColor: '#000',
        shadowOpacity: 0.22,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 14 },
        elevation: 12,
    },
};
