import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface RawSms {
    _id: string;
    address: string;
    body: string;
    date: number;
}

export interface SmsOptions {
    limit?: number;
    since?: number;
}

const SmsReaderNative = Platform.OS === 'android' ? requireOptionalNativeModule('SmsReader') : null;

export const isSmsReaderAvailable = (): boolean => {
    return Platform.OS === 'android' && !!SmsReaderNative;
};

export const getInboxSms = async (options?: SmsOptions): Promise<RawSms[]> => {
    if (!SmsReaderNative) {
        return [];
    }
    return await SmsReaderNative.getSms(options || {});
};
