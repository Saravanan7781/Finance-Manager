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

exports.createGoal = async (req, res, next) => {
    try {
        const { familyId, title, targetAmount, deadline } = req.body;

        await getFamilyForMember(familyId, req.user.uid);

        const parsedTarget = parseFloat(targetAmount);
        if (isNaN(parsedTarget) || parsedTarget <= 0) {
            throw new HttpError(400, 'Target amount must be a positive number');
        }

        let parsedDeadline = null;
        if (deadline) {
            const d = new Date(deadline);
            parsedDeadline = isNaN(d.getTime()) ? null : d;
        }

        const goalRef = await db.collection('goals').add({
            familyId,
            title,
            targetAmount: round2(parsedTarget),
            currentAmount: 0,
            deadline: parsedDeadline,
            createdBy: req.user.uid,
            createdAt: new Date(),
        });

        res.status(201).json({ id: goalRef.id });
    } catch (error) {
        next(error);
    }
};

exports.getGoals = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        await getFamilyForMember(familyId, req.user.uid);

        const snapshot = await db.collection('goals')
            .where('familyId', '==', familyId)
            .limit(parseLimit(req.query.limit))
            .get();

        const goals = snapshot.docs.map(serializeDoc);
        goals.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        res.status(200).json(goals);
    } catch (error) {
        next(error);
    }
};

// Adds to (or, with a negative amount, takes from) the money saved so far.
exports.updateGoalAmount = async (req, res, next) => {
    try {
        const { goalId, amount, recordTransaction, paymentMethod } = req.body;

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) {
            throw new HttpError(400, 'Amount must be a valid number');
        }

        const { doc } = await getOwnedDoc('goals', goalId, req.user.uid);

        let currentAmount;
        let targetAmount;
        let goalData;
        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(doc.ref);
            const goal = snapshot.data();
            goalData = goal;
            targetAmount = goal.targetAmount;
            currentAmount = Math.max(0, round2((goal.currentAmount || 0) + parsedAmount));
            transaction.update(doc.ref, { currentAmount, updatedAt: new Date() });
        });

        if (recordTransaction && parsedAmount !== 0 && goalData) {
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            const desc = parsedAmount > 0
                ? `Goal contribution: ${goalData.title}`
                : `Goal withdrawal: ${goalData.title}`;
            const cat = parsedAmount > 0 ? 'Savings' : 'Savings withdrawal';
            const txType = parsedAmount > 0 ? 'expense' : 'income';
            const finalAmt = round2(Math.abs(parsedAmount));
            const keywords = buildKeywords(desc, cat, paymentMethod, userDoc.exists ? userDoc.data().displayName : null);

            await db.collection('transactions').add({
                familyId: goalData.familyId,
                createdBy: req.user.uid,
                createdByName: userDoc.exists ? userDoc.data().displayName : null,
                amount: finalAmt,
                type: txType,
                category: cat,
                description: desc,
                paymentMethod: paymentMethod || null,
                source: 'manual',
                goalId: doc.id,
                keywords,
                date: new Date(),
                createdAt: new Date(),
            });

            await updateFamilyBalance(goalData.familyId, req.user.uid, txType === 'income' ? finalAmt : -finalAmt);
        }

        res.status(200).json({
            message: 'Goal updated',
            currentAmount,
            completed: currentAmount >= targetAmount,
        });
    } catch (error) {
        next(error);
    }
};

exports.updateGoal = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('goals', req.params.goalId, req.user.uid);

        const updates = {};
        if (req.body.title !== undefined) updates.title = req.body.title;
        if (req.body.targetAmount !== undefined) {
            const parsed = parseFloat(req.body.targetAmount);
            if (isNaN(parsed) || parsed <= 0) throw new HttpError(400, 'Target amount must be a positive number');
            updates.targetAmount = round2(parsed);
        }
        if (req.body.deadline !== undefined) {
            if (req.body.deadline) {
                const d = new Date(req.body.deadline);
                if (isNaN(d.getTime())) throw new HttpError(400, 'Invalid deadline');
                updates.deadline = d;
            } else {
                updates.deadline = null;
            }
        }

        if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update');
        updates.updatedAt = new Date();

        await doc.ref.update(updates);
        res.status(200).json({ message: 'Goal updated' });
    } catch (error) {
        next(error);
    }
};

exports.deleteGoal = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('goals', req.params.goalId, req.user.uid);
        await doc.ref.delete();
        res.status(200).json({ message: 'Goal deleted' });
    } catch (error) {
        next(error);
    }
};
