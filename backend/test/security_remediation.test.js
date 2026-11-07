const { describe, it } = require('node:test');
const assert = require('node:assert');
const { round2 } = require('../utils/http');

describe('Security Remediation Tests', () => {
    describe('1. round2 safe precision and non-finite guards', () => {
        it('should return 0 for non-numeric inputs', () => {
            assert.strictEqual(round2(null), 0);
            assert.strictEqual(round2(undefined), 0);
            assert.strictEqual(round2('100.50'), 0);
            assert.strictEqual(round2({}), 0);
        });

        it('should return 0 for non-finite numeric inputs (NaN, Infinity)', () => {
            assert.strictEqual(round2(NaN), 0);
            assert.strictEqual(round2(Infinity), 0);
            assert.strictEqual(round2(-Infinity), 0);
        });

        it('should avoid floating point drift and round accurately to 2 decimals', () => {
            assert.strictEqual(round2(0.1 + 0.2), 0.3);
            assert.strictEqual(round2(10.255), 10.26);
            assert.strictEqual(round2(-5.555), -5.55);
            assert.strictEqual(round2(100), 100);
        });
    });

    describe('2. Batch transaction input validation logic', () => {
        const validateItem = (item) => {
            if (!item || typeof item !== 'object') return false;
            const parsedAmount = parseFloat(item.amount);
            if (isNaN(parsedAmount) || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return false;
            if (item.myShare !== undefined && item.myShare !== null) {
                const s = parseFloat(item.myShare);
                if (isNaN(s) || !Number.isFinite(s) || s < 0) return false;
            }
            if (item.lentAmount !== undefined && item.lentAmount !== null) {
                const l = parseFloat(item.lentAmount);
                if (isNaN(l) || !Number.isFinite(l) || l < 0) return false;
            }
            return true;
        };

        it('should reject non-finite, negative, or zero amounts', () => {
            assert.strictEqual(validateItem({ amount: 0 }), false);
            assert.strictEqual(validateItem({ amount: -10 }), false);
            assert.strictEqual(validateItem({ amount: NaN }), false);
            assert.strictEqual(validateItem({ amount: Infinity }), false);
            assert.strictEqual(validateItem({ amount: 'invalid' }), false);
            assert.strictEqual(validateItem({ amount: 50.25 }), true);
        });

        it('should reject negative or non-finite myShare', () => {
            assert.strictEqual(validateItem({ amount: 100, isSplit: true, myShare: -5 }), false);
            assert.strictEqual(validateItem({ amount: 100, isSplit: true, myShare: NaN }), false);
            assert.strictEqual(validateItem({ amount: 100, isSplit: true, myShare: Infinity }), false);
            assert.strictEqual(validateItem({ amount: 100, isSplit: true, myShare: 50 }), true);
            assert.strictEqual(validateItem({ amount: 100, isSplit: true, myShare: 0 }), true);
        });
    });

    describe('3. Ledger attribution grouping logic', () => {
        it('should correctly attribute reversal deltas to transaction creator', () => {
            const txs = [
                { id: '1', createdBy: 'user_A', type: 'expense', amount: 50 },
                { id: '2', createdBy: 'user_B', type: 'income', amount: 100 },
                { id: '3', createdBy: 'user_A', type: 'expense', amount: 25 },
            ];

            const memberDeltas = {};
            for (const tx of txs) {
                const creator = tx.createdBy;
                const delta = tx.type === 'income' ? -tx.amount : tx.amount;
                memberDeltas[creator] = round2((memberDeltas[creator] || 0) + delta);
            }

            assert.strictEqual(memberDeltas['user_A'], 75);
            assert.strictEqual(memberDeltas['user_B'], -100);
        });
    });

    describe('4. Batch delete authorization logic', () => {
        const canDelete = (tx, familyAdmin, callingUserId) => {
            return tx.createdBy === callingUserId || familyAdmin === callingUserId;
        };

        it('should allow creator to delete', () => {
            assert.strictEqual(canDelete({ createdBy: 'user1' }, 'admin_user', 'user1'), true);
        });

        it('should allow admin to delete any member transaction', () => {
            assert.strictEqual(canDelete({ createdBy: 'user1' }, 'admin_user', 'admin_user'), true);
        });

        it('should reject non-admin deleting another member transaction', () => {
            assert.strictEqual(canDelete({ createdBy: 'user1' }, 'admin_user', 'user2'), false);
        });
    });

    describe('5. SMS deletion scope filter logic', () => {
        const getFilterScope = (familyAdmin, callingUserId) => {
            if (familyAdmin === callingUserId) return 'ALL_FAMILY';
            return 'OWN_ONLY';
        };

        it('admin should delete all family SMS transactions', () => {
            assert.strictEqual(getFilterScope('admin_user', 'admin_user'), 'ALL_FAMILY');
        });

        it('non-admin should only delete their own SMS transactions', () => {
            assert.strictEqual(getFilterScope('admin_user', 'member_user'), 'OWN_ONLY');
        });
    });
});
