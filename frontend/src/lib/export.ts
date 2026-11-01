import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';
import type { Tx } from './types';

const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '""';
    const s = String(str);
    return `"${s.replace(/"/g, '""')}"`;
};

export const generateTransactionsCsv = (txs: Tx[]): string => {
    const headers = [
        'ID',
        'Date',
        'Time',
        'Type',
        'Category',
        'Amount',
        'Description',
        'Payment Method',
        'Logged By',
        'Source',
    ];

    const rows = txs.map((tx) => {
        const d = new Date(tx.date);
        const dateStr = isNaN(d.getTime()) ? tx.date : d.toISOString().slice(0, 10);
        const timeStr = isNaN(d.getTime()) ? '' : d.toISOString().slice(11, 16);

        return [
            escapeCsv(tx.id),
            escapeCsv(dateStr),
            escapeCsv(timeStr),
            escapeCsv(tx.type),
            escapeCsv(tx.category),
            tx.amount,
            escapeCsv(tx.description || ''),
            escapeCsv(tx.paymentMethod || ''),
            escapeCsv(tx.createdByName || ''),
            escapeCsv(tx.source || 'manual'),
        ].join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
};

export const exportTransactionsCsv = async (
    txs: Tx[],
    familyName: string = 'Family'
): Promise<{ success: boolean; method: 'download' | 'share' | 'copy'; error?: string }> => {
    try {
        const csv = generateTransactionsCsv(txs);
        const safeName = familyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const today = new Date().toISOString().slice(0, 10);
        const filename = `${safeName}-transactions-${today}.csv`;

        if (Platform.OS === 'web') {
            if (typeof document !== 'undefined') {
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                return { success: true, method: 'download' };
            }
        }

        // On mobile, native Share
        try {
            await Share.share({
                title: `${familyName} Transactions`,
                message: csv,
            });
            return { success: true, method: 'share' };
        } catch {
            // Fallback to clipboard
            await Clipboard.setStringAsync(csv);
            return { success: true, method: 'copy' };
        }
    } catch (e) {
        return { success: false, method: 'copy', error: (e as Error).message };
    }
};
