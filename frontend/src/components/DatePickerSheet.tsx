import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius, space } from '@/constants/theme';
import { toDateInput } from '@/lib/format';
import { Chip, IconButton, PillButton, Sheet, T } from './ui';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DayCell {
    date: Date;
    dateStr: string;
    dayNum: number;
    isCurrentMonth: boolean;
    isSelected: boolean;
    isToday: boolean;
}

export function DatePickerSheet({
    visible,
    onClose,
    value,
    onChange,
}: {
    visible: boolean;
    onClose: () => void;
    value: string;
    onChange: (dateStr: string) => void;
}) {
    const [viewDate, setViewDate] = useState(() => {
        const parts = value.split('-').map(Number);
        if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }
        return new Date();
    });

    const [selectedDateStr, setSelectedDateStr] = useState(value);

    // Sync when sheet becomes visible or value changes
    useEffect(() => {
        if (visible) {
            setSelectedDateStr(value);
            const parts = value.split('-').map(Number);
            if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                setViewDate(new Date(parts[0], parts[1] - 1, parts[2]));
            }
        }
    }, [visible, value]);

    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth();

    const prevMonth = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setViewDate(new Date(viewYear, viewMonth - 1, 1));
    };

    const nextMonth = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setViewDate(new Date(viewYear, viewMonth + 1, 1));
    };

    const todayStr = toDateInput(new Date());

    const days = useMemo(() => {
        const result: DayCell[] = [];
        const daysInCurrent = new Date(viewYear, viewMonth + 1, 0).getDate();
        const startDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

        // Previous month filler days
        const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const dayNum = daysInPrev - i;
            const date = new Date(viewYear, viewMonth - 1, dayNum);
            const dateStr = toDateInput(date);
            result.push({
                date,
                dateStr,
                dayNum,
                isCurrentMonth: false,
                isSelected: dateStr === selectedDateStr,
                isToday: dateStr === todayStr,
            });
        }

        // Current month days
        for (let d = 1; d <= daysInCurrent; d++) {
            const date = new Date(viewYear, viewMonth, d);
            const dateStr = toDateInput(date);
            result.push({
                date,
                dateStr,
                dayNum: d,
                isCurrentMonth: true,
                isSelected: dateStr === selectedDateStr,
                isToday: dateStr === todayStr,
            });
        }

        // Next month filler days (fill out remaining week)
        const total = result.length;
        const remainder = total % 7;
        if (remainder !== 0) {
            const needed = 7 - remainder;
            for (let d = 1; d <= needed; d++) {
                const date = new Date(viewYear, viewMonth + 1, d);
                const dateStr = toDateInput(date);
                result.push({
                    date,
                    dateStr,
                    dayNum: d,
                    isCurrentMonth: false,
                    isSelected: dateStr === selectedDateStr,
                    isToday: dateStr === todayStr,
                });
            }
        }

        return result;
    }, [viewYear, viewMonth, selectedDateStr, todayStr]);

    const handleSelect = (dateStr: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setSelectedDateStr(dateStr);
        onChange(dateStr);
    };

    const selectPreset = (d: Date) => {
        const str = toDateInput(d);
        setViewDate(d);
        handleSelect(str);
    };

    return (
        <Sheet visible={visible} onClose={onClose} title="Choose date">
            {/* Month & Year Navigation */}
            <View style={styles.monthRow}>
                <IconButton Icon={ChevronLeft} label="Previous month" size={38} onPress={prevMonth} />
                <T variant="heading" style={{ fontSize: 18, fontFamily: fonts.bold }}>
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </T>
                <IconButton Icon={ChevronRight} label="Next month" size={38} onPress={nextMonth} />
            </View>

            {/* Weekday Header Labels */}
            <View style={styles.weekRow}>
                {WEEKDAYS.map((wd) => (
                    <View key={wd} style={styles.weekCol}>
                        <T variant="tiny" color={colors.muted} style={styles.weekText}>
                            {wd}
                        </T>
                    </View>
                ))}
            </View>

            {/* Calendar Days Grid */}
            <View style={styles.grid}>
                {days.map((cell) => (
                    <View key={cell.dateStr} style={styles.dayCol}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={cell.dateStr}
                            onPress={() => handleSelect(cell.dateStr)}
                            style={[
                                styles.dayCell,
                                cell.isSelected && styles.daySelected,
                                !cell.isSelected && cell.isToday && styles.dayToday,
                            ]}
                        >
                            <T
                                variant="small"
                                color={
                                    cell.isSelected
                                        ? colors.white
                                        : !cell.isCurrentMonth
                                        ? colors.faint
                                        : colors.ink
                                }
                                style={{
                                    fontFamily: cell.isSelected || cell.isToday ? fonts.bold : fonts.medium,
                                    fontSize: 14,
                                }}
                            >
                                {cell.dayNum}
                            </T>
                        </Pressable>
                    </View>
                ))}
            </View>

            {/* Quick shortcuts */}
            <View style={styles.presetRow}>
                <Chip
                    label="Today"
                    active={selectedDateStr === todayStr}
                    onPress={() => selectPreset(new Date())}
                />
                <Chip
                    label="Yesterday"
                    active={selectedDateStr === toDateInput(new Date(Date.now() - 86400000))}
                    onPress={() => selectPreset(new Date(Date.now() - 86400000))}
                />
            </View>

            {/* Done Button */}
            <PillButton label="Done" onPress={onClose} style={{ marginTop: space.lg }} />
        </Sheet>
    );
}

const styles = StyleSheet.create({
    monthRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: space.md,
        paddingHorizontal: space.xs,
    },
    weekRow: {
        flexDirection: 'row',
        marginBottom: space.sm,
    },
    weekCol: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekText: {
        fontFamily: fonts.bold,
        fontSize: 12,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCol: {
        width: '14.28%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 3,
    },
    dayCell: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    daySelected: {
        backgroundColor: colors.ink,
    },
    dayToday: {
        borderWidth: 1.5,
        borderColor: colors.inkSoft,
        backgroundColor: colors.mint0,
    },
    presetRow: {
        flexDirection: 'row',
        gap: space.sm,
        marginTop: space.md,
        justifyContent: 'center',
    },
});

