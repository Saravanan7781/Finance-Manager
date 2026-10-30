const { db } = require('../config/firebase');
const { serializeDoc, getFamilyForMember, getOwnedDoc } = require('../utils/http');

const round2 = (n) => Math.round(n * 100) / 100;
const slug = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

// One budget per category per family, so the document id is derived from both.
exports.setBudget = async (req, res, next) => {
    try {
        const { familyId, category, limit } = req.body;

        await getFamilyForMember(familyId, req.user.uid);

        const id = `${familyId}__${slug(category)}`;
        await db.collection('budgets').doc(id).set({
            familyId,
            category: category.trim(),
            limit: round2(parseFloat(limit)),
            updatedBy: req.user.uid,
            updatedAt: new Date(),
        });

        res.status(200).json({ id });
    } catch (error) {
        next(error);
    }
};

exports.getBudgets = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        await getFamilyForMember(familyId, req.user.uid);

        const snapshot = await db.collection('budgets').where('familyId', '==', familyId).get();
        const budgets = snapshot.docs.map(serializeDoc);
        budgets.sort((a, b) => a.category.localeCompare(b.category));
        res.status(200).json(budgets);
    } catch (error) {
        next(error);
    }
};

exports.deleteBudget = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('budgets', req.params.id, req.user.uid);
        await doc.ref.delete();
        res.status(200).json({ message: 'Budget deleted' });
    } catch (error) {
        next(error);
    }
};
