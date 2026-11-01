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
const DEFAULT_DUE_DAYS = 7;

exports.createLoan = async (req, res, next) => {
    try {
        const { familyId, direction, person, amount, dueDate, note } = req.body;

        await getFamilyForMember(familyId, req.user.uid);

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new HttpError(400, 'Amount must be a positive number');
        }

        let due;
        if (dueDate) {
            const parsedDue = new Date(dueDate);
            due = isNaN(parsedDue.getTime())
                ? new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000)
                : parsedDue;
        } else {
            due = new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000);
        }

        const finalAmount = round2(parsedAmount);
        const loanRef = await db.collection('loans').add({
            familyId,
            direction: direction || 'lent',
            person,
            amount: finalAmount,
            repaidAmount: 0,
            dueDate: due,
            note: note || '',
            status: 'open',
            createdBy: req.user.uid,
            createdAt: new Date(),
            settledAt: null,
        });

        if (req.body.recordTransaction) {
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            const isLent = (direction || 'lent') === 'lent';
            const desc = isLent ? `Loan to ${person}` : `Borrowed from ${person}`;
            const cat = isLent ? 'Lent' : 'Other income';
            const keywords = buildKeywords(desc, cat, req.body.paymentMethod, userDoc.exists ? userDoc.data().displayName : null);

            await db.collection('transactions').add({
                familyId,
                createdBy: req.user.uid,
                createdByName: userDoc.exists ? userDoc.data().displayName : null,
                amount: finalAmount,
                type: isLent ? 'expense' : 'income',
                category: cat,
                description: desc,
                paymentMethod: req.body.paymentMethod || null,
                source: 'manual',
                loanId: loanRef.id,
                keywords,
                date: new Date(),
                createdAt: new Date(),
            });

            await updateFamilyBalance(familyId, req.user.uid, isLent ? -parsedAmount : parsedAmount);
        }

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
        if (req.body.amount !== undefined) {
            const parsed = parseFloat(req.body.amount);
            if (isNaN(parsed) || parsed <= 0) throw new HttpError(400, 'Amount must be a positive number');
            updates.amount = round2(parsed);
        }
        if (req.body.dueDate !== undefined) {
            if (req.body.dueDate) {
                const d = new Date(req.body.dueDate);
                if (isNaN(d.getTime())) throw new HttpError(400, 'Invalid dueDate');
                updates.dueDate = d;
            } else {
                updates.dueDate = null;
            }
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
        const { recordTransaction, paymentMethod } = req.body;

        if (req.body.amount !== undefined) {
            const parsed = parseFloat(req.body.amount);
            if (isNaN(parsed) || parsed <= 0) throw new HttpError(400, 'Payment amount must be greater than zero');
        }

        let result;
        let loanData;
        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(doc.ref);
            const loan = snapshot.data();
            loanData = loan;
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
            result = { repaidAmount, outstanding: round2(loan.amount - repaidAmount), status: settled ? 'settled' : 'open', payment };
        });

        if (recordTransaction && result && result.payment > 0 && loanData) {
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            const isLent = loanData.direction === 'lent';
            const desc = isLent
                ? `Loan repayment from ${loanData.person}`
                : `Loan repayment to ${loanData.person}`;
            const cat = isLent ? 'Loan repayment' : 'Bills';
            const txType = isLent ? 'income' : 'expense';
            const finalPayment = round2(result.payment);
            const keywords = buildKeywords(desc, cat, paymentMethod, userDoc.exists ? userDoc.data().displayName : null);

            await db.collection('transactions').add({
                familyId: loanData.familyId,
                createdBy: req.user.uid,
                createdByName: userDoc.exists ? userDoc.data().displayName : null,
                amount: finalPayment,
                type: txType,
                category: cat,
                description: desc,
                paymentMethod: paymentMethod || null,
                source: 'manual',
                loanId: doc.id,
                keywords,
                date: new Date(),
                createdAt: new Date(),
            });

            await updateFamilyBalance(loanData.familyId, req.user.uid, txType === 'income' ? finalPayment : -finalPayment);
        }

        res.status(200).json({
            repaidAmount: result.repaidAmount,
            outstanding: result.outstanding,
            status: result.status,
        });
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
