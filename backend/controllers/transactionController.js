const { db } = require('../config/firebase');
const {
    HttpError,
    serializeDoc,
    getFamilyForMember,
    getOwnedDoc,
    parseLimit,
    updateFamilyBalance,
    buildKeywords,
} = require('../utils/http');

const round2 = (n) => Math.round(n * 100) / 100;
const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : new Date(v));
const getEffectiveExpense = (t) => {
    if (t.type === 'expense' && t.isSplit && typeof t.myShare === 'number' && t.myShare >= 0) {
        return t.myShare;
    }
    return t.amount;
};

exports.addTransaction = async (req, res, next) => {
    try {
        const { familyId, amount, type, category, description, date, paymentMethod, source, dedupeKey } = req.body;
        const userId = req.user.uid;

        await getFamilyForMember(familyId, userId);

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new HttpError(400, 'Amount must be a positive number');
        }

        // Auto-captured transactions (SMS) carry a key so the same message never lands twice.
        if (dedupeKey) {
            const duplicate = await db.collection('transactions')
                .where('familyId', '==', familyId)
                .where('dedupeKey', '==', dedupeKey)
                .get();
            if (!duplicate.empty) throw new HttpError(409, 'Duplicate transaction');
        }

        const userDoc = await db.collection('users').doc(userId).get();
        const userName = userDoc.exists ? userDoc.data().displayName : null;
        const finalAmount = round2(parsedAmount);
        const keywords = buildKeywords(description, category, paymentMethod, userName);

        let txDate = new Date();
        if (date) {
            const parsedD = new Date(date);
            if (!isNaN(parsedD.getTime())) txDate = parsedD;
        }

        const transactionRef = await db.collection('transactions').add({
            familyId,
            createdBy: userId,
            createdByName: userName,
            amount: finalAmount,
            type,
            category,
            description: description || '',
            paymentMethod: paymentMethod || null,
            source: source || 'manual',
            dedupeKey: dedupeKey || null,
            countForNextMonth: Boolean(req.body.countForNextMonth),
            isSplit: Boolean(req.body.isSplit),
            myShare: req.body.myShare !== undefined && req.body.myShare !== null ? round2(parseFloat(req.body.myShare)) : null,
            lentAmount: req.body.lentAmount !== undefined && req.body.lentAmount !== null ? round2(parseFloat(req.body.lentAmount)) : null,
            splitWith: req.body.splitWith ? String(req.body.splitWith).trim() : null,
            keywords,
            date: txDate,
            createdAt: new Date(),
        });

        // When expense is marked as split, only myShare is considered as expense
        const effectiveExpense = (type === 'expense' && Boolean(req.body.isSplit) && typeof req.body.myShare === 'number')
            ? round2(parseFloat(req.body.myShare))
            : finalAmount;
        const delta = type === 'income' ? finalAmount : -effectiveExpense;
        await updateFamilyBalance(familyId, userId, delta);

        // Note split share in loans as lent
        const isSplit = Boolean(req.body.isSplit);
        const myShare = req.body.myShare !== undefined && req.body.myShare !== null ? round2(parseFloat(req.body.myShare)) : null;
        const lentAmount = req.body.lentAmount !== undefined && req.body.lentAmount !== null ? round2(parseFloat(req.body.lentAmount)) : null;
        const splitWith = req.body.splitWith ? String(req.body.splitWith).trim() : null;

        if (type === 'expense' && isSplit && lentAmount && lentAmount > 0) {
            const person = splitWith || 'Friends';
            const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const splitNote = description ? `${description} (Split expense)` : 'Split expense';
            const loanRef = await db.collection('loans').add({
                familyId,
                direction: 'lent',
                person,
                amount: lentAmount,
                repaidAmount: 0,
                dueDate: due,
                note: splitNote,
                status: 'open',
                isSplitLoan: true,
                sourceTxId: transactionRef.id,
                createdBy: userId,
                createdAt: new Date(),
                settledAt: null,
            });
            await transactionRef.update({ linkedLoanId: loanRef.id });
        }

        res.status(201).json({ id: transactionRef.id });
    } catch (error) {
        next(error);
    }
};

exports.addBatchTransactions = async (req, res, next) => {
    try {
        const { familyId, items } = req.body;
        const userId = req.user.uid;

        if (!Array.isArray(items) || items.length === 0) {
            throw new HttpError(400, 'items must be a non-empty array');
        }

        await getFamilyForMember(familyId, userId);

        const userDoc = await db.collection('users').doc(userId).get();
        const userName = userDoc.exists ? userDoc.data().displayName : null;

        // Fetch existing dedupe keys to avoid duplicates
        const dedupeKeys = items.map((it) => it.dedupeKey).filter(Boolean);
        const existingKeys = new Set();

        if (dedupeKeys.length > 0) {
            for (let i = 0; i < dedupeKeys.length; i += 30) {
                const chunk = dedupeKeys.slice(i, i + 30);
                const snap = await db.collection('transactions')
                    .where('familyId', '==', familyId)
                    .where('dedupeKey', 'in', chunk)
                    .get();
                snap.forEach((doc) => existingKeys.add(doc.data().dedupeKey));
            }
        }

        const batch = db.batch();
        let totalDelta = 0;
        let addedCount = 0;
        let skippedCount = 0;
        const createdIds = [];

        for (const item of items) {
            if (item.dedupeKey && existingKeys.has(item.dedupeKey)) {
                skippedCount++;
                continue;
            }

            const parsedAmount = parseFloat(item.amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                skippedCount++;
                continue;
            }

            const finalAmount = round2(parsedAmount);
            const isSplitItem = Boolean(item.isSplit);
            const myShareItem = item.myShare !== undefined && item.myShare !== null ? round2(parseFloat(item.myShare)) : null;
            const effExpense = (item.type === 'expense' && isSplitItem && typeof myShareItem === 'number') ? myShareItem : finalAmount;
            const delta = item.type === 'income' ? finalAmount : -effExpense;
            totalDelta += delta;

            let txDate = new Date();
            if (item.date) {
                const parsedD = new Date(item.date);
                if (!isNaN(parsedD.getTime())) txDate = parsedD;
            }

            const keywords = buildKeywords(item.description, item.category, item.paymentMethod, userName);
            const ref = db.collection('transactions').doc();

            batch.set(ref, {
                familyId,
                createdBy: userId,
                createdByName: userName,
                amount: finalAmount,
                type: item.type === 'income' ? 'income' : 'expense',
                category: item.category || 'Other',
                description: (item.description || '').trim(),
                paymentMethod: item.paymentMethod || null,
                source: item.source || 'sms',
                dedupeKey: item.dedupeKey || null,
                countForNextMonth: Boolean(item.countForNextMonth),
                isSplit: Boolean(item.isSplit),
                myShare: item.myShare !== undefined && item.myShare !== null ? round2(parseFloat(item.myShare)) : null,
                lentAmount: item.lentAmount !== undefined && item.lentAmount !== null ? round2(parseFloat(item.lentAmount)) : null,
                splitWith: item.splitWith ? String(item.splitWith).trim() : null,
                keywords,
                date: txDate,
                createdAt: new Date(),
            });

            createdIds.push(ref.id);
            addedCount++;
            if (item.dedupeKey) existingKeys.add(item.dedupeKey);
        }

        if (addedCount > 0) {
            await batch.commit();
            await updateFamilyBalance(familyId, userId, round2(totalDelta));
        }

        res.status(201).json({ added: addedCount, skipped: skippedCount, ids: createdIds });
    } catch (error) {
        next(error);
    }
};

exports.deleteBatchTransactions = async (req, res, next) => {
    try {
        const { familyId, ids } = req.body;
        const userId = req.user.uid;

        if (!Array.isArray(ids) || ids.length === 0) {
            throw new HttpError(400, 'ids must be a non-empty array');
        }

        await getFamilyForMember(familyId, userId);

        let totalDelta = 0;
        let deletedCount = 0;
        const batch = db.batch();

        for (const id of ids) {
            const docRef = db.collection('transactions').doc(id);
            const docSnap = await docRef.get();
            if (!docSnap.exists) continue;

            const data = docSnap.data();
            if (data.familyId !== familyId) continue;

            const effExpense = getEffectiveExpense(data);
            const delta = data.type === 'income' ? -data.amount : effExpense;
            totalDelta += delta;
            deletedCount++;
            batch.delete(docRef);
        }

        if (deletedCount > 0) {
            await batch.commit();
            await updateFamilyBalance(familyId, userId, round2(totalDelta));
        }

        res.status(200).json({ message: `Reverted ${deletedCount} transaction${deletedCount === 1 ? '' : 's'}`, deleted: deletedCount });
    } catch (error) {
        next(error);
    }
};

exports.deleteAllSmsTransactions = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        const userId = req.user.uid;

        await getFamilyForMember(familyId, userId);

        const snap = await db.collection('transactions')
            .where('familyId', '==', familyId)
            .where('source', '==', 'sms')
            .get();

        if (snap.empty) {
            return res.status(200).json({ message: 'No SMS transactions found', deleted: 0 });
        }

        let totalDelta = 0;
        let deletedCount = 0;
        const docs = snap.docs;

        for (let i = 0; i < docs.length; i += 400) {
            const chunk = docs.slice(i, i + 400);
            const batch = db.batch();
            for (const doc of chunk) {
                const data = doc.data();
                const effExpense = getEffectiveExpense(data);
            const delta = data.type === 'income' ? -data.amount : effExpense;
                totalDelta += delta;
                deletedCount++;
                batch.delete(doc.ref);
            }
            await batch.commit();
        }

        if (deletedCount > 0) {
            await updateFamilyBalance(familyId, userId, round2(totalDelta));
        }

        res.status(200).json({ message: `Deleted ${deletedCount} SMS transaction${deletedCount === 1 ? '' : 's'}`, deleted: deletedCount });
    } catch (error) {
        next(error);
    }
};

exports.getTransactions = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        const { startAfter, from, to, type, category, search, q, month } = req.query;
        const searchTerm = (search || q || '').trim();
        const limit = parseLimit(req.query.limit);

        await getFamilyForMember(familyId, req.user.uid);

        let fromDate = from && !isNaN(new Date(from)) ? new Date(from) : null;
        let toDateVal = to && !isNaN(new Date(to)) ? new Date(to) : null;
        let monthFilter = null;

        if (month && /^\d{4}-\d{2}$/.test(month)) {
            const [y, m] = month.split('-').map(Number);
            const tzOffset = parseInt(req.query.tzOffset, 10) || 0;
            const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - tzOffset * 60000);
            const monthEnd = new Date(Date.UTC(y, m, 1, 0, 0, 0) - tzOffset * 60000);
            const prevStart = new Date(Date.UTC(y, m - 2, 1, 0, 0, 0) - tzOffset * 60000);
            monthFilter = { monthStart, monthEnd, prevStart };
            fromDate = prevStart;
            toDateVal = monthEnd;
        }

        let query = db.collection('transactions').where('familyId', '==', familyId);
        if (type === 'income' || type === 'expense') query = query.where('type', '==', type);
        if (req.query.scope === 'me') query = query.where('createdBy', '==', req.user.uid);
        if (category) query = query.where('category', '==', String(category));
        if (fromDate) query = query.where('date', '>=', fromDate);
        if (toDateVal) query = query.where('date', '<=', toDateVal);

        if (searchTerm.length >= 2) {
            query = query.where('keywords', 'array-contains', searchTerm.toLowerCase());
        }

        query = query.orderBy('date', 'desc').limit(limit);

        if (startAfter) {
            const startAfterDoc = await db.collection('transactions').doc(String(startAfter)).get();
            if (startAfterDoc.exists && startAfterDoc.data().familyId === familyId) {
                query = query.startAfter(startAfterDoc);
            }
        }

        const snapshot = await query.get();
        let items = snapshot.docs.map(serializeDoc);

        if (monthFilter) {
            items = items.filter((tx) => {
                const d = new Date(tx.date);
                const countNext = Boolean(tx.countForNextMonth);
                if (countNext) {
                    return d >= monthFilter.prevStart && d < monthFilter.monthStart;
                }
                return d >= monthFilter.monthStart && d < monthFilter.monthEnd;
            });
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            items = items.filter((tx) =>
                [tx.description, tx.category, tx.paymentMethod, tx.createdByName].some(
                    (text) => text && String(text).toLowerCase().includes(lower)
                )
            );
        }

        res.status(200).json(items);
    } catch (error) {
        next(error);
    }
};

const assertCanModify = (transaction, family, uid) => {
    if (transaction.createdBy !== uid && family.admin !== uid) {
        throw new HttpError(403, 'Only the person who added this or the admin can change it');
    }
};

exports.updateTransaction = async (req, res, next) => {
    try {
        const { doc, family } = await getOwnedDoc('transactions', req.params.id, req.user.uid);
        assertCanModify(doc.data(), family, req.user.uid);

        const oldT = doc.data();
        const updates = {};
        ['type', 'category', 'description', 'paymentMethod'].forEach((field) => {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        });
        if (req.body.amount !== undefined) {
            const parsed = parseFloat(req.body.amount);
            if (isNaN(parsed) || parsed <= 0) throw new HttpError(400, 'Amount must be greater than zero');
            updates.amount = round2(parsed);
        }
        if (req.body.date !== undefined) {
            const d = new Date(req.body.date);
            if (isNaN(d.getTime())) throw new HttpError(400, 'Invalid date');
            updates.date = d;
        }

        if (req.body.countForNextMonth !== undefined) {
            updates.countForNextMonth = Boolean(req.body.countForNextMonth);
        }
        if (req.body.isSplit !== undefined) updates.isSplit = Boolean(req.body.isSplit);
        if (req.body.myShare !== undefined) updates.myShare = req.body.myShare !== null ? round2(parseFloat(req.body.myShare)) : null;
        if (req.body.lentAmount !== undefined) updates.lentAmount = req.body.lentAmount !== null ? round2(parseFloat(req.body.lentAmount)) : null;
        if (req.body.splitWith !== undefined) updates.splitWith = req.body.splitWith ? String(req.body.splitWith).trim() : null;

        if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update');
        updates.updatedAt = new Date();

        if (updates.description !== undefined || updates.category !== undefined || updates.paymentMethod !== undefined) {
            updates.keywords = buildKeywords(
                updates.description ?? oldT.description,
                updates.category ?? oldT.category,
                updates.paymentMethod ?? oldT.paymentMethod,
                oldT.createdByName
            );
        }

        if (updates.amount !== undefined || updates.type !== undefined || updates.isSplit !== undefined || updates.myShare !== undefined) {
            const oldEff = getEffectiveExpense(oldT);
            const oldDelta = oldT.type === 'income' ? oldT.amount : -oldEff;
            const mergedT = { ...oldT, ...updates };
            const newEff = getEffectiveExpense(mergedT);
            const newAmount = updates.amount !== undefined ? updates.amount : oldT.amount;
            const newDelta = mergedT.type === 'income' ? newAmount : -newEff;
            const delta = round2(newDelta - oldDelta);
            if (delta !== 0) {
                await updateFamilyBalance(family.id, oldT.createdBy, delta);
            }
        }

        const mergedT = { ...oldT, ...updates };
        if (oldT.linkedLoanId) {
            try {
                if (mergedT.isSplit && mergedT.lentAmount && mergedT.lentAmount > 0) {
                    await db.collection('loans').doc(oldT.linkedLoanId).update({
                        amount: mergedT.lentAmount,
                        person: mergedT.splitWith || 'Friends',
                        note: mergedT.description ? `${mergedT.description} (Split expense)` : 'Split expense',
                    });
                } else if (updates.isSplit === false) {
                    const loanSnap = await db.collection('loans').doc(oldT.linkedLoanId).get();
                    if (loanSnap.exists && loanSnap.data().repaidAmount === 0) {
                        await db.collection('loans').doc(oldT.linkedLoanId).delete();
                    }
                    updates.linkedLoanId = null;
                }
            } catch (e) {
                console.warn('Update linked loan error:', e);
            }
        } else if (mergedT.type === 'expense' && mergedT.isSplit && mergedT.lentAmount && mergedT.lentAmount > 0) {
            try {
                const person = mergedT.splitWith || 'Friends';
                const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                const splitNote = mergedT.description ? `${mergedT.description} (Split expense)` : 'Split expense';
                const loanRef = await db.collection('loans').add({
                    familyId: family.id,
                    direction: 'lent',
                    person,
                    amount: mergedT.lentAmount,
                    repaidAmount: 0,
                    dueDate: due,
                    note: splitNote,
                    status: 'open',
                    isSplitLoan: true,
                    sourceTxId: doc.id,
                    createdBy: oldT.createdBy,
                    createdAt: new Date(),
                    settledAt: null,
                });
                updates.linkedLoanId = loanRef.id;
            } catch (e) {
                console.warn('Create linked loan on update error:', e);
            }
        }

        await doc.ref.update(updates);
        res.status(200).json({ message: 'Transaction updated' });
    } catch (error) {
        next(error);
    }
};

exports.deleteTransaction = async (req, res, next) => {
    try {
        const { doc, family } = await getOwnedDoc('transactions', req.params.id, req.user.uid);
        assertCanModify(doc.data(), family, req.user.uid);

        const oldT = doc.data();
        const oldEff = getEffectiveExpense(oldT);
        const delta = oldT.type === 'income' ? -oldT.amount : oldEff;
        await updateFamilyBalance(family.id, oldT.createdBy, delta);

        if (oldT.linkedLoanId) {
            try {
                const loanSnap = await db.collection('loans').doc(oldT.linkedLoanId).get();
                if (loanSnap.exists && loanSnap.data().repaidAmount === 0) {
                    await db.collection('loans').doc(oldT.linkedLoanId).delete();
                }
            } catch (e) {
                console.warn('Delete linked loan error:', e);
            }
        }

        await doc.ref.delete();
        res.status(200).json({ message: 'Transaction deleted' });
    } catch (error) {
        next(error);
    }
};

// Month boundaries are computed in the caller's timezone (`tzOffset`, minutes east of UTC).
const monthRange = (month, tzOffset) => {
    const [year, monthIndex] = month.split('-').map(Number);
    return {
        start: new Date(Date.UTC(year, monthIndex - 1, 1) - tzOffset * 60000),
        end: new Date(Date.UTC(year, monthIndex, 1) - tzOffset * 60000),
    };
};

const previousMonth = (month) => {
    const [year, monthIndex] = month.split('-').map(Number);
    const d = new Date(Date.UTC(year, monthIndex - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const DAY_MS = 86400000;
const TREND_BUCKETS = { day: 7, week: 8, month: 6, year: 12 };

// Local calendar buckets for the trend chart, as "local midnight" values expressed in UTC milliseconds.
// Supports single window mode (for the Donut Chart in Transactions) or historical multi-bucket mode.
const trendBounds = (range, localNow, single = false) => {
    const todayLocal = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
    const starts = [];

    if (single) {
        if (range === 'day') {
            starts.push(todayLocal);
        } else if (range === 'week') {
            for (let i = 6; i >= 0; i--) starts.push(todayLocal - i * DAY_MS);
        } else if (range === 'year') {
            for (let i = 0; i < 12; i++) starts.push(Date.UTC(localNow.getUTCFullYear(), i, 1));
        } else {
            // month: current month
            starts.push(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1));
        }
    } else {
        const count = TREND_BUCKETS[range] || 7;
        if (range === 'day') {
            for (let i = count - 1; i >= 0; i--) starts.push(todayLocal - i * DAY_MS);
        } else if (range === 'week') {
            const thisMonday = todayLocal - ((localNow.getUTCDay() + 6) % 7) * DAY_MS;
            for (let i = count - 1; i >= 0; i--) starts.push(thisMonday - i * 7 * DAY_MS);
        } else if (range === 'year') {
            for (let i = 0; i < 12; i++) starts.push(Date.UTC(localNow.getUTCFullYear(), i, 1));
        } else {
            for (let i = count - 1; i >= 0; i--) {
                starts.push(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - i, 1));
            }
        }
    }

    const endOf = (start) => {
        if (range === 'day' || (single && range === 'week')) return start + DAY_MS;
        if (range === 'week') return start + 7 * DAY_MS;
        const d = new Date(start);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    };

    return starts.map((start) => ({ start, end: endOf(start) }));
};

exports.getTrend = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        const single = req.query.single === '1' || req.query.single === 'true';
        const range = TREND_BUCKETS[req.query.range] ? req.query.range : 'day';
        const tzOffset = parseInt(req.query.tzOffset, 10) || 0;
        const scope = req.query.scope === 'me' ? 'me' : 'family';

        await getFamilyForMember(familyId, req.user.uid);

        const bounds = trendBounds(range, new Date(Date.now() + tzOffset * 60000), single);
        const shift = tzOffset * 60000;
        const buckets = bounds.map((b) => ({
            localStart: new Date(b.start).toISOString().slice(0, 10),
            // Real instants, so the client can ask for exactly this bucket's transactions.
            start: new Date(b.start - shift).toISOString(),
            end: new Date(b.end - shift).toISOString(),
            expense: 0,
            income: 0,
        }));

        let query = db.collection('transactions')
            .where('familyId', '==', familyId)
            .where('date', '>=', new Date(bounds[0].start - shift));
        if (scope === 'me') query = query.where('createdBy', '==', req.user.uid);
        // Sorted newest first on purpose: Firestore then reuses the (familyId, date desc) indexes that the
        // transaction list already needs, instead of demanding a second set of ascending ones.
        const snapshot = await query.orderBy('date', 'desc').limit(5000).get();

        // Spending per category across the whole window, for the pie chart.
        const categories = {};

        snapshot.forEach((doc) => {
            const t = doc.data();
            const local = toDate(t.date).getTime() + shift;
            const index = bounds.findIndex((b) => local >= b.start && local < b.end);
            if (index < 0) return;
            if (t.type === 'expense') {
                const effAmount = getEffectiveExpense(t);
                buckets[index].expense += effAmount;
                categories[t.category] = (categories[t.category] || 0) + effAmount;
            } else {
                buckets[index].income += t.amount;
            }
        });

        const windowExpense = Object.values(categories).reduce((sum, v) => sum + v, 0);
        const byCategory = Object.entries(categories)
            .map(([category, total]) => ({
                category,
                total: round2(total),
                percent: windowExpense > 0 ? Math.round((total / windowExpense) * 1000) / 10 : 0,
            }))
            .sort((a, b) => b.total - a.total);

        res.status(200).json({
            range,
            scope,
            buckets: buckets.map((b) => ({ ...b, expense: round2(b.expense), income: round2(b.income) })),
            byCategory,
        });
    } catch (error) {
        next(error);
    }
};

exports.getSummary = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        const tzOffset = parseInt(req.query.tzOffset, 10) || 0;
        // "me" narrows every figure to what the caller personally added.
        const scope = req.query.scope === 'me' ? 'me' : 'family';
        const localNow = new Date(Date.now() + tzOffset * 60000);
        const month = req.query.month || localNow.toISOString().slice(0, 7);

        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            throw new HttpError(400, 'Month must look like 2026-10');
        }
        const family = await getFamilyForMember(familyId, req.user.uid);

        const current = monthRange(month, tzOffset);
        const previous = monthRange(previousMonth(month), tzOffset);

        // Targeted query: only read transactions within the month comparison window
        let query = db.collection('transactions')
            .where('familyId', '==', familyId)
            .where('date', '>=', previous.start)
            .where('date', '<', current.end);

        if (scope === 'me') {
            query = query.where('createdBy', '==', req.user.uid);
        }

        query = query.orderBy('date', 'desc');

        const snapshot = await query.get();

        let income = 0;
        let expense = 0;
        let previousExpense = 0;
        let transactionCount = 0;
        const byCategory = {};
        const byDay = {};
        const byMember = {};

        snapshot.forEach((doc) => {
            const t = doc.data();
            const when = toDate(t.date);
            const isExpense = t.type === 'expense';
            const countForNextMonth = Boolean(t.countForNextMonth);
            const effExpense = getEffectiveExpense(t);

            if (when >= previous.start && when < previous.end && isExpense && !countForNextMonth) {
                previousExpense += effExpense;
            }

            const inCurrent = countForNextMonth
                ? (when >= previous.start && when < previous.end)
                : (when >= current.start && when < current.end);

            if (!inCurrent) return;

            transactionCount += 1;
            const day = new Date(when.getTime() + tzOffset * 60000).toISOString().slice(0, 10);
            byDay[day] = byDay[day] || { date: day, income: 0, expense: 0 };

            if (isExpense) {
                expense += effExpense;
                byDay[day].expense += effExpense;

                byCategory[t.category] = byCategory[t.category] || { category: t.category, total: 0, count: 0 };
                byCategory[t.category].total += effExpense;
                byCategory[t.category].count += 1;

                byMember[t.createdBy] = byMember[t.createdBy] || {
                    userId: t.createdBy,
                    name: t.createdByName || 'Member',
                    expense: 0,
                };
                byMember[t.createdBy].expense += effExpense;
            } else {
                income += t.amount;
                byDay[day].income += t.amount;
            }
        });

        // Rolling balance retrieval with automatic legacy fallback
        let balance;
        if (scope === 'me') {
            if (family.memberBalances && typeof family.memberBalances[req.user.uid] === 'number') {
                balance = family.memberBalances[req.user.uid];
            } else {
                // Compute from member transactions and cache
                const myAll = await db.collection('transactions')
                    .where('familyId', '==', familyId)
                    .where('createdBy', '==', req.user.uid)
                    .get();
                let myNet = 0;
                myAll.forEach((d) => {
                    const row = d.data();
                    const eff = getEffectiveExpense(row);
                    myNet += row.type === 'income' ? row.amount : -eff;
                });
                balance = round2(myNet);
                const mBalances = family.memberBalances || {};
                await db.collection('families').doc(familyId).update({
                    memberBalances: { ...mBalances, [req.user.uid]: balance },
                });
            }
        } else {
            if (typeof family.balance === 'number') {
                balance = family.balance;
            } else {
                // Compute from all family transactions and cache
                const all = await db.collection('transactions')
                    .where('familyId', '==', familyId)
                    .get();
                let totalNet = 0;
                const mBalances = {};
                all.forEach((d) => {
                    const row = d.data();
                    const eff = getEffectiveExpense(row);
                    const delta = row.type === 'income' ? row.amount : -eff;
                    totalNet += delta;
                    mBalances[row.createdBy] = (mBalances[row.createdBy] || 0) + delta;
                });
                balance = round2(totalNet);
                await db.collection('families').doc(familyId).update({
                    balance,
                    memberBalances: mBalances,
                });
            }
        }

        const categories = Object.values(byCategory)
            .map((c) => ({
                category: c.category,
                total: round2(c.total),
                count: c.count,
                percent: expense > 0 ? Math.round((c.total / expense) * 1000) / 10 : 0,
            }))
            .sort((a, b) => b.total - a.total);

        res.status(200).json({
            month,
            scope,
            tzOffset,
            balance: round2(balance),
            income: round2(income),
            expense: round2(expense),
            net: round2(income - expense),
            previousExpense: round2(previousExpense),
            expenseChangePercent: previousExpense > 0
                ? Math.round(((expense - previousExpense) / previousExpense) * 1000) / 10
                : null,
            transactionCount,
            byCategory: categories,
            byDay: Object.values(byDay)
                .map((d) => ({ date: d.date, income: round2(d.income), expense: round2(d.expense) }))
                .sort((a, b) => a.date.localeCompare(b.date)),
            byMember: Object.values(byMember)
                .map((m) => ({ ...m, expense: round2(m.expense) }))
                .sort((a, b) => b.expense - a.expense),
        });
    } catch (error) {
        next(error);
    }
};
