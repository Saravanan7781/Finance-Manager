import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { money } from './format';
import type { Goal, Loan } from './types';

const KEY = 'reminders-enabled';
const REMIND_HOUR = 9;

const supported = Platform.OS !== 'web';

if (supported) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    });
}

export const remindersSupported = supported;

export const remindersEnabled = async () => {
    try {
        return (await AsyncStorage.getItem(KEY)) === '1';
    } catch {
        return false;
    }
};

// Asks for permission the first time; returns whether reminders are now on.
export const setRemindersEnabled = async (on: boolean) => {
    if (!supported) return false;
    if (on) {
        const current = await Notifications.getPermissionsAsync();
        const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
        if (!granted) return false;
    } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
    }
    await AsyncStorage.setItem(KEY, on ? '1' : '0');
    return on;
};

const at = (iso: string, daysBefore: number) => {
    const date = new Date(iso);
    date.setDate(date.getDate() - daysBefore);
    date.setHours(REMIND_HOUR, 0, 0, 0);
    return date;
};

// Rebuilds every reminder from scratch, so the schedule always matches the latest loans and goals.
export const syncReminders = async (loans: Loan[], goals: Goal[]) => {
    if (!supported || !(await remindersEnabled())) return;

    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = Date.now();
    const schedule = (date: Date, title: string, body: string) => {
        if (date.getTime() <= now) return Promise.resolve();
        return Notifications.scheduleNotificationAsync({
            content: { title, body },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
        }).then(() => undefined);
    };

    const jobs: Promise<void>[] = [];
    loans
        .filter((l) => l.status === 'open' && l.dueDate)
        .forEach((loan) => {
            const owed = money(loan.amount - loan.repaidAmount);
            const who = loan.direction === 'lent' ? `${loan.person} owes you ${owed}` : `You owe ${loan.person} ${owed}`;
            jobs.push(schedule(at(loan.dueDate!, 1), 'Due tomorrow', who));
            jobs.push(schedule(at(loan.dueDate!, 0), 'Due today', who));
        });

    goals
        .filter((g) => g.deadline && g.currentAmount < g.targetAmount)
        .forEach((goal) => {
            const left = money(goal.targetAmount - goal.currentAmount);
            jobs.push(schedule(at(goal.deadline!, 3), `${goal.title} is 3 days away`, `${left} still to save.`));
        });

    await Promise.all(jobs);
};
