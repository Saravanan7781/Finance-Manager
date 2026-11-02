import { PermissionsAndroid, Platform } from 'react-native';
import { getInboxSms, isSmsReaderAvailable, RawSms } from '../../modules/sms-reader/src';
import { extractTransactionsFromSmsList, ParsedSms, SAMPLE_INDIAN_BANK_SMS } from './sms';

export interface ScanResult {
    transactions: ParsedSms[];
    totalScanned: number;
    permissionDenied: boolean;
    isNative: boolean;
    error?: string;
}

export async function requestSmsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
        const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_SMS
        );
        if (hasPermission) return true;

        const status = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_SMS,
            {
                title: 'SMS Permission Required',
                message:
                    'Family Finance reads bank and UPI transaction alerts directly from your messages to save you time. Your messages remain private and are only processed locally on your phone.',
                buttonNeutral: 'Ask Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'Allow Access',
            }
        );

        return status === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
        console.warn('Failed to request SMS permission:', err);
        return false;
    }
}

export async function checkSmsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
        return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    } catch {
        return false;
    }
}

export async function scanSmsInbox(options?: {
    limit?: number;
    since?: number;
    useSampleIfUnavailable?: boolean;
}): Promise<ScanResult> {
    const isNative = isSmsReaderAvailable();

    // On non-android or if native module not compiled into runtime (e.g. web or Expo Go)
    if (!isNative) {
        if (options?.useSampleIfUnavailable) {
            const rawSamples = options?.since
                ? SAMPLE_INDIAN_BANK_SMS.filter((s) => s.date >= options.since!)
                : SAMPLE_INDIAN_BANK_SMS;
            const parsed = extractTransactionsFromSmsList(rawSamples);
            return {
                transactions: parsed,
                totalScanned: rawSamples.length,
                permissionDenied: false,
                isNative: false,
            };
        }
        return {
            transactions: [],
            totalScanned: 0,
            permissionDenied: false,
            isNative: false,
            error: 'Native SMS reader is only available on Android native builds (APK).',
        };
    }

    const granted = await requestSmsPermission();
    if (!granted) {
        return {
            transactions: [],
            totalScanned: 0,
            permissionDenied: true,
            isNative: true,
            error: 'SMS read permission was not granted.',
        };
    }

    try {
        const rawList: RawSms[] = await getInboxSms({
            limit: options?.limit ?? 300,
            since: options?.since,
        });

        const parsed = extractTransactionsFromSmsList(rawList);

        return {
            transactions: parsed,
            totalScanned: rawList.length,
            permissionDenied: false,
            isNative: true,
        };
    } catch (err) {
        return {
            transactions: [],
            totalScanned: 0,
            permissionDenied: false,
            isNative: true,
            error: (err as Error).message || 'Failed to read SMS messages.',
        };
    }
}
