const { db } = require('../config/firebase');

exports.addTransaction = async (req, res, next) => {
    try {
        const { familyId, amount, type, category, description, date } = req.body;
        const userId = req.user.uid;

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ error: 'Amount must be a positive number' });
        }

        const transactionRef = await db.collection('transactions').add({
            familyId,
            createdBy: userId,
            amount: parsedAmount,
            type,
            category,
            description: description || '',
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
        const { limit = 50, startAfter } = req.query;

        let query = db.collection('transactions')
            .where('familyId', '==', familyId)
            .orderBy('date', 'desc')
            .limit(parseInt(limit));

        if (startAfter) {
            const startAfterDoc = await db.collection('transactions').doc(startAfter).get();
            if (startAfterDoc.exists) {
                query = query.startAfter(startAfterDoc);
            }
        }

        const snapshot = await query.get();

        const transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json(transactions);
    } catch (error) {
        next(error);
    }
};
