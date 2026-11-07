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

const calculateNextRun = (baseDate, frequency) => {
    const d = new Date(baseDate);
    switch (frequency) {
        case 'daily':
            d.setDate(d.getDate() + 1);
            break;
        case 'weekly':
            d.setDate(d.getDate() + 7);
            break;
        case 'monthly':
            d.setMonth(d.getMonth() + 1);
            break;
        case 'yearly':
            d.setFullYear(d.getFullYear() + 1);
            break;
        default:
            d.setMonth(d.getMonth() + 1);
    }
    return d;
};

exports.getRecurring = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        await getFamilyForMember(familyId, req.user.uid);

        const snapshot = await db.collection('recurring')
            .where('familyId', '==', familyId)
            .limit(parseLimit(req.query.limit, 100))
            .get();

        const now = new Date();
        const items = [];

        // Check for any active rules with autoRecord = true that are due
        for (const doc of snapshot.docs) {
            const data = doc.data();
            let nextRun = data.nextRunDate && typeof data.nextRunDate.toDate === 'function'
                ? data.nextRunDate.toDate()
                : new Date(data.nextRunDate);

            if (data.status === 'active' && data.autoRecord && !isNaN(nextRun.getTime()) && nextRun <= now) {
                let executed = false;
                let scheduledRun = null;
                let updatedNextRun = null;
                let ruleData = null;

                try {
                    // Concurrency-safe check and date advance inside atomic runTransaction
                    await db.runTransaction(async (transaction) => {
                        const freshDoc = await transaction.get(doc.ref);
                        if (!freshDoc.exists) return;

                        const freshData = freshDoc.data();
                        if (freshData.status !== 'active' || !freshData.autoRecord) return;

                        const freshNext = freshData.nextRunDate && typeof freshData.nextRunDate.toDate === 'function'
                            ? freshData.nextRunDate.toDate()
                            : new Date(freshData.nextRunDate);

                        if (isNaN(freshNext.getTime()) || freshNext > now) {
                            return; // Already processed by a concurrent request
                        }

                        scheduledRun = freshNext;
                        updatedNextRun = calculateNextRun(freshNext, freshData.frequency);
                        ruleData = freshData;

                        transaction.update(doc.ref, {
                            lastRunDate: scheduledRun,
                            nextRunDate: updatedNextRun,
                            updatedAt: new Date(),
                        });
                        executed = true;
                    });
                } catch (txErr) {
                    if (process.env.NODE_ENV !== 'test') {
                        console.warn('Recurring autoRecord transaction conflict:', txErr.message);
                    }
                }

                if (executed && ruleData) {
                    const creatorUid = ruleData.createdBy || req.user.uid;
                    const userDoc = await db.collection('users').doc(creatorUid).get();
                    const userName = userDoc.exists ? userDoc.data().displayName : ruleData.createdByName || null;
                    const desc = ruleData.description ? `${ruleData.description} (Recurring)` : 'Recurring payment';
                    const keywords = buildKeywords(desc, ruleData.category, ruleData.paymentMethod, userName);
                    const dedupeKey = `recurring_${doc.id}_${scheduledRun.toISOString().slice(0, 10)}`;

                    await db.collection('transactions').add({
                        familyId,
                        createdBy: creatorUid,
                        createdByName: userName,
                        amount: ruleData.amount,
                        type: ruleData.type,
                        category: ruleData.category,
                        description: desc,
                        paymentMethod: ruleData.paymentMethod || null,
                        source: 'recurring',
                        recurringId: doc.id,
                        dedupeKey,
                        keywords,
                        date: scheduledRun,
                        createdAt: new Date(),
                    });

                    await updateFamilyBalance(familyId, creatorUid, ruleData.type === 'income' ? ruleData.amount : -ruleData.amount);

                    data.lastRunDate = scheduledRun;
                    data.nextRunDate = updatedNextRun;
                }
            }

            items.push(serializeDoc(doc));
        }

        items.sort((a, b) => String(a.nextRunDate).localeCompare(String(b.nextRunDate)));
        res.status(200).json(items);
    } catch (error) {
        next(error);
    }
};

exports.createRecurring = async (req, res, next) => {
    try {
        const { familyId, amount, type, category, description, frequency, startDate, paymentMethod, autoRecord } = req.body;
        await getFamilyForMember(familyId, req.user.uid);

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new HttpError(400, 'Amount must be a positive number');
        }

        const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
        const freq = validFrequencies.includes(frequency) ? frequency : 'monthly';
        const start = startDate ? new Date(startDate) : new Date();

        const userDoc = await db.collection('users').doc(req.user.uid).get();

        const docRef = await db.collection('recurring').add({
            familyId,
            createdBy: req.user.uid,
            createdByName: userDoc.exists ? userDoc.data().displayName : null,
            amount: round2(parsedAmount),
            type: type === 'income' ? 'income' : 'expense',
            category: category || 'Bills',
            description: (description || '').trim(),
            frequency: freq,
            startDate: start,
            nextRunDate: start,
            lastRunDate: null,
            paymentMethod: paymentMethod || null,
            autoRecord: Boolean(autoRecord),
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        res.status(201).json({ id: docRef.id });
    } catch (error) {
        next(error);
    }
};

exports.updateRecurring = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('recurring', req.params.id, req.user.uid);

        const updates = {};
        if (req.body.amount !== undefined) {
            const parsed = parseFloat(req.body.amount);
            if (isNaN(parsed) || parsed <= 0) throw new HttpError(400, 'Invalid amount');
            updates.amount = round2(parsed);
        }
        if (req.body.type !== undefined) {
            if (!['income', 'expense'].includes(req.body.type)) throw new HttpError(400, 'Invalid type');
            updates.type = req.body.type;
        }
        if (req.body.category !== undefined) updates.category = req.body.category;
        if (req.body.description !== undefined) updates.description = req.body.description.trim();
        if (req.body.frequency !== undefined) {
            if (!['daily', 'weekly', 'monthly', 'yearly'].includes(req.body.frequency)) {
                throw new HttpError(400, 'Invalid frequency');
            }
            updates.frequency = req.body.frequency;
        }
        if (req.body.nextRunDate !== undefined) {
            const nextDate = new Date(req.body.nextRunDate);
            if (isNaN(nextDate.getTime())) throw new HttpError(400, 'Invalid nextRunDate');
            updates.nextRunDate = nextDate;
        }
        if (req.body.paymentMethod !== undefined) updates.paymentMethod = req.body.paymentMethod;
        if (req.body.autoRecord !== undefined) updates.autoRecord = Boolean(req.body.autoRecord);
        if (req.body.status !== undefined) {
            if (!['active', 'paused'].includes(req.body.status)) throw new HttpError(400, 'Invalid status');
            updates.status = req.body.status;
        }

        if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update');
        updates.updatedAt = new Date();

        await doc.ref.update(updates);
        res.status(200).json({ message: 'Recurring transaction updated' });
    } catch (error) {
        next(error);
    }
};

exports.deleteRecurring = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('recurring', req.params.id, req.user.uid);
        await doc.ref.delete();
        res.status(200).json({ message: 'Recurring transaction deleted' });
    } catch (error) {
        next(error);
    }
};

exports.recordRecurringInstance = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('recurring', req.params.id, req.user.uid);
        const data = doc.data();

        const userDoc = await db.collection('users').doc(req.user.uid).get();
        const now = new Date();

        // Create transaction
        const userName = userDoc.exists ? userDoc.data().displayName : null;
        const desc = data.description ? `${data.description} (Recurring)` : 'Recurring payment';
        const method = req.body.paymentMethod || data.paymentMethod || null;
        const keywords = buildKeywords(desc, data.category, method, userName);

        const txRef = await db.collection('transactions').add({
            familyId: data.familyId,
            createdBy: req.user.uid,
            createdByName: userName,
            amount: data.amount,
            type: data.type,
            category: data.category,
            description: desc,
            paymentMethod: method,
            source: 'recurring',
            recurringId: doc.id,
            keywords,
            date: now,
            createdAt: now,
        });

        await updateFamilyBalance(data.familyId, req.user.uid, data.type === 'income' ? data.amount : -data.amount);

        const currentNext = data.nextRunDate && typeof data.nextRunDate.toDate === 'function'
            ? data.nextRunDate.toDate()
            : new Date(data.nextRunDate || now);

        const nextRun = calculateNextRun(currentNext > now ? currentNext : now, data.frequency);

        await doc.ref.update({
            lastRunDate: now,
            nextRunDate: nextRun,
            updatedAt: now,
        });

        res.status(200).json({
            message: 'Transaction recorded',
            transactionId: txRef.id,
            nextRunDate: nextRun.toISOString(),
        });
    } catch (error) {
        next(error);
    }
};
