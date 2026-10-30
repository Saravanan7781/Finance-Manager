const { db } = require('../config/firebase');
const {
    HttpError,
    serializeDoc,
    getFamilyForMember,
    getOwnedDoc,
    parseLimit,
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

        const goalRef = await db.collection('goals').add({
            familyId,
            title,
            targetAmount: round2(parsedTarget),
            currentAmount: 0,
            deadline: deadline ? new Date(deadline) : null,
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
        const { goalId, amount } = req.body;

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) {
            throw new HttpError(400, 'Amount must be a valid number');
        }

        const { doc } = await getOwnedDoc('goals', goalId, req.user.uid);

        let currentAmount;
        let targetAmount;
        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(doc.ref);
            const goal = snapshot.data();
            targetAmount = goal.targetAmount;
            currentAmount = Math.max(0, round2((goal.currentAmount || 0) + parsedAmount));
            transaction.update(doc.ref, { currentAmount, updatedAt: new Date() });
        });

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
        if (req.body.targetAmount !== undefined) updates.targetAmount = round2(parseFloat(req.body.targetAmount));
        if (req.body.deadline !== undefined) {
            updates.deadline = req.body.deadline ? new Date(req.body.deadline) : null;
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
