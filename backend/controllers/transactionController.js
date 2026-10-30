const { db } = require('../config/firebase');
const {
    HttpError,
    serializeDoc,
    getFamilyForMember,
    getOwnedDoc,
    parseLimit,
} = require('../utils/http');

const round2 = (n) => Math.round(n * 100) / 100;
const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : new Date(v));

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

        const transactionRef = await db.collection('transactions').add({
            familyId,
            createdBy: userId,
            createdByName: userDoc.exists ? userDoc.data().displayName : null,
            amount: round2(parsedAmount),
            type,
            category,
            description: description || '',
            paymentMethod: paymentMethod || null,
            source: source || 'manual',
            dedupeKey: dedupeKey || null,
            date: date ? new Date(date) : new Date(),
            createdAt: new Date(),
        });

        res.status(201).json({ id: transactionRef.id });
    } catch (error) {
        next(error);
    }
};

exports.getTransactions = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        const { startAfter, from, to, type, category } = req.query;
        const limit = parseLimit(req.query.limit);

        await getFamilyForMember(familyId, req.user.uid);

        let query = db.collection('transactions').where('familyId', '==', familyId);
        if (type === 'income' || type === 'expense') query = query.where('type', '==', type);
        if (req.query.scope === 'me') query = query.where('createdBy', '==', req.user.uid);
        if (category) query = query.where('category', '==', String(category));
        if (from && !isNaN(new Date(from))) query = query.where('date', '>=', new Date(from));
        if (to && !isNaN(new Date(to))) query = query.where('date', '<=', new Date(to));

        query = query.orderBy('date', 'desc').limit(limit);

        if (startAfter) {
            const startAfterDoc = await db.collection('transactions').doc(String(startAfter)).get();
            if (startAfterDoc.exists && startAfterDoc.data().familyId === familyId) {
                query = query.startAfter(startAfterDoc);
            }
        }

        const snapshot = await query.get();
        res.status(200).json(snapshot.docs.map(serializeDoc));
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

        const updates = {};
        ['type', 'category', 'description', 'paymentMethod'].forEach((field) => {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        });
        if (req.body.amount !== undefined) updates.amount = round2(parseFloat(req.body.amount));
        if (req.body.date !== undefined) updates.date = new Date(req.body.date);

        if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update');
        updates.updatedAt = new Date();

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
const TREND_BUCKETS = { day: 7, week: 8, month: 6 };

// Local calendar buckets for the trend chart, as "local midnight" values expressed in UTC milliseconds.
// Days are the last 7 days ending today, weeks run Monday to Sunday (the last 8, the newest still in
// progress), and months are the last 6 calendar months including this one.
const trendBounds = (range, localNow) => {
    const todayLocal = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
    const count = TREND_BUCKETS[range];
    const starts = [];

    if (range === 'day') {
        for (let i = count - 1; i >= 0; i--) starts.push(todayLocal - i * DAY_MS);
    } else if (range === 'week') {
        const thisMonday = todayLocal - ((localNow.getUTCDay() + 6) % 7) * DAY_MS;
        for (let i = count - 1; i >= 0; i--) starts.push(thisMonday - i * 7 * DAY_MS);
    } else {
        for (let i = count - 1; i >= 0; i--) {
            starts.push(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - i, 1));
        }
    }

    const endOf = (start) => {
        if (range === 'day') return start + DAY_MS;
        if (range === 'week') return start + 7 * DAY_MS;
        const d = new Date(start);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    };

    return starts.map((start) => ({ start, end: endOf(start) }));
};

exports.getTrend = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        const range = TREND_BUCKETS[req.query.range] ? req.query.range : 'day';
        const tzOffset = parseInt(req.query.tzOffset, 10) || 0;
        const scope = req.query.scope === 'me' ? 'me' : 'family';

        await getFamilyForMember(familyId, req.user.uid);

        const bounds = trendBounds(range, new Date(Date.now() + tzOffset * 60000));
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
                buckets[index].expense += t.amount;
                categories[t.category] = (categories[t.category] || 0) + t.amount;
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
        await getFamilyForMember(familyId, req.user.uid);

        const current = monthRange(month, tzOffset);
        const previous = monthRange(previousMonth(month), tzOffset);

        const snapshot = await db.collection('transactions')
            .where('familyId', '==', familyId)
            .limit(5000)
            .get();

        let allIncome = 0;
        let allExpense = 0;
        let income = 0;
        let expense = 0;
        let previousExpense = 0;
        let transactionCount = 0;
        const byCategory = {};
        const byDay = {};
        const byMember = {};

        snapshot.forEach((doc) => {
            const t = doc.data();
            if (scope === 'me' && t.createdBy !== req.user.uid) return;

            const when = toDate(t.date);
            const isExpense = t.type === 'expense';

            if (isExpense) allExpense += t.amount;
            else allIncome += t.amount;

            if (when >= previous.start && when < previous.end && isExpense) {
                previousExpense += t.amount;
            }
            if (when < current.start || when >= current.end) return;

            transactionCount += 1;
            const day = new Date(when.getTime() + tzOffset * 60000).toISOString().slice(0, 10);
            byDay[day] = byDay[day] || { date: day, income: 0, expense: 0 };

            if (isExpense) {
                expense += t.amount;
                byDay[day].expense += t.amount;

                byCategory[t.category] = byCategory[t.category] || { category: t.category, total: 0, count: 0 };
                byCategory[t.category].total += t.amount;
                byCategory[t.category].count += 1;

                byMember[t.createdBy] = byMember[t.createdBy] || {
                    userId: t.createdBy,
                    name: t.createdByName || 'Member',
                    expense: 0,
                };
                byMember[t.createdBy].expense += t.amount;
            } else {
                income += t.amount;
                byDay[day].income += t.amount;
            }
        });

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
            balance: round2(allIncome - allExpense),
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
