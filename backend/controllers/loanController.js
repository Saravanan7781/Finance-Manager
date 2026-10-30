const { db } = require('../config/firebase');
const {
    HttpError,
    serializeDoc,
    getFamilyForMember,
    getOwnedDoc,
    parseLimit,
} = require('../utils/http');

const round2 = (n) => Math.round(n * 100) / 100;
const DEFAULT_DUE_DAYS = 7;

exports.createLoan = async (req, res, next) => {
    try {
        const { familyId, direction, person, amount, dueDate, note } = req.body;

        await getFamilyForMember(familyId, req.user.uid);

        const due = dueDate
            ? new Date(dueDate)
            : new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000);

        const loanRef = await db.collection('loans').add({
            familyId,
            direction: direction || 'lent',
            person,
            amount: round2(parseFloat(amount)),
            repaidAmount: 0,
            dueDate: due,
            note: note || '',
            status: 'open',
            createdBy: req.user.uid,
            createdAt: new Date(),
            settledAt: null,
        });

        res.status(201).json({ id: loanRef.id });
    } catch (error) {
        next(error);
    }
};

exports.getLoans = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        const { status } = req.query;

        await getFamilyForMember(familyId, req.user.uid);

        let query = db.collection('loans').where('familyId', '==', familyId);
        if (status === 'open' || status === 'settled') query = query.where('status', '==', status);

        const snapshot = await query.limit(parseLimit(req.query.limit, 100)).get();
        const loans = snapshot.docs.map(serializeDoc);
        loans.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
        res.status(200).json(loans);
    } catch (error) {
        next(error);
    }
};

exports.updateLoan = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('loans', req.params.id, req.user.uid);

        const updates = {};
        if (req.body.person !== undefined) updates.person = req.body.person;
        if (req.body.note !== undefined) updates.note = req.body.note;
        if (req.body.amount !== undefined) updates.amount = round2(parseFloat(req.body.amount));
        if (req.body.dueDate !== undefined) {
            updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
        }

        if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update');

        await doc.ref.update(updates);
        res.status(200).json({ message: 'Loan updated' });
    } catch (error) {
        next(error);
    }
};

// Records a repayment. With no amount it clears whatever is still owed.
exports.repayLoan = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('loans', req.params.id, req.user.uid);

        let result;
        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(doc.ref);
            const loan = snapshot.data();
            if (loan.status === 'settled') throw new HttpError(409, 'This loan is already settled');

            const outstanding = round2(loan.amount - loan.repaidAmount);
            const payment = req.body.amount !== undefined
                ? Math.min(round2(parseFloat(req.body.amount)), outstanding)
                : outstanding;

            const repaidAmount = round2(loan.repaidAmount + payment);
            const settled = repaidAmount >= loan.amount;

            transaction.update(doc.ref, {
                repaidAmount,
                status: settled ? 'settled' : 'open',
                settledAt: settled ? new Date() : null,
            });
            result = { repaidAmount, outstanding: round2(loan.amount - repaidAmount), status: settled ? 'settled' : 'open' };
        });

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

exports.deleteLoan = async (req, res, next) => {
    try {
        const { doc } = await getOwnedDoc('loans', req.params.id, req.user.uid);
        await doc.ref.delete();
        res.status(200).json({ message: 'Loan deleted' });
    } catch (error) {
        next(error);
    }
};
