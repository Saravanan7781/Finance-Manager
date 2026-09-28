const { db, admin } = require('../config/firebase');

exports.createGoal = async (req, res, next) => {
    try {
        const { familyId, title, targetAmount, deadline } = req.body;

        const parsedTarget = parseFloat(targetAmount);
        if (isNaN(parsedTarget) || parsedTarget <= 0) {
            return res.status(400).json({ error: 'Target amount must be a positive number' });
        }

        const goalRef = await db.collection('goals').add({
            familyId,
            title,
            targetAmount: parsedTarget,
            currentAmount: 0,
            deadline: deadline ? new Date(deadline) : null,
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
        const { limit = 50 } = req.query;

        const snapshot = await db.collection('goals')
            .where('familyId', '==', familyId)
            .limit(parseInt(limit))
            .get();

        const goals = [];
        snapshot.forEach(doc => {
            goals.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json(goals);
    } catch (error) {
        next(error);
    }
};

exports.updateGoalAmount = async (req, res, next) => {
    try {
        const { goalId, amount } = req.body;

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) {
            return res.status(400).json({ error: 'Amount must be a valid number' });
        }

        const goalRef = db.collection('goals').doc(goalId);
        await goalRef.update({
            currentAmount: admin.firestore.FieldValue.increment(parsedAmount),
        });

        res.status(200).json({ message: 'Goal updated' });
    } catch (error) {
        next(error);
    }
};
