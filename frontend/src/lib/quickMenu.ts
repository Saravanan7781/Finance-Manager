// Geometry for the hold-and-slide menu on the + button. Offsets are in pixels from the centre of the
// button, with y negative going up, so the options fan out left, up and right above the tab bar.

export type QuickKey = 'spend' | 'earn' | 'lend';

export interface QuickOption {
    key: QuickKey;
    label: string;
    x: number;
    y: number;
    href: string;
}

export const OPTIONS: QuickOption[] = [
    // The tab bar reaches about 40px above the button centre, so the side options sit well clear of it.
    { key: 'spend', label: 'Spend', x: -96, y: -96, href: '/add?type=expense' },
    { key: 'earn', label: 'Earn', x: 0, y: -148, href: '/add?type=income' },
    { key: 'lend', label: 'Lend', x: 96, y: -96, href: '/loans?new=1' },
];

export const OPTION_SIZE = 62;
export const HOLD_MS = 280;
// Finger travel allowed during the hold before it counts as a drag instead of a press.
export const MOVE_SLOP = 12;
// How close the finger must be to an option's centre to count as on it. A little wider than the
// circle itself, so a slightly sloppy slide still lands.
export const HIT_RADIUS = 48;

// Which option, if any, the finger is on. `x` and `y` are the finger's offset from the button centre.
export const pickOption = (x: number, y: number): QuickKey | null => {
    let best: QuickKey | null = null;
    let bestDistance = HIT_RADIUS;
    OPTIONS.forEach((option) => {
        const distance = Math.hypot(x - option.x, y - option.y);
        if (distance < bestDistance) {
            best = option.key;
            bestDistance = distance;
        }
    });
    return best;
};
