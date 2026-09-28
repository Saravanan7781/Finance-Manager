const { db, admin } = require('../config/firebase');
const crypto = require('crypto');

exports.createFamily = async (req, res, next) => {
    try {
        const { familyName } = req.body;
        const userId = req.user.uid;

        const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        const familyRef = await db.collection('families').add({
            name: familyName,
            inviteCode,
            admin: userId,
            members: [userId],
            createdAt: new Date(),
        });

        await db.collection('users').doc(userId).update({
            familyId: familyRef.id,
            role: 'admin',
        });

        res.status(201).json({ familyId: familyRef.id, inviteCode });
    } catch (error) {
        next(error);
    }
};

exports.joinFamily = async (req, res, next) => {
    try {
        const { inviteCode } = req.body;
        const userId = req.user.uid;

        const familyQuery = await db.collection('families').where('inviteCode', '==', inviteCode).get();
        if (familyQuery.empty) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }

        const familyDoc = familyQuery.docs[0];
        const familyId = familyDoc.id;

        // Check if user is already a member
        const familyData = familyDoc.data();
        if (familyData.members && familyData.members.includes(userId)) {
            return res.status(400).json({ error: 'You are already a member of this family' });
        }

        // Use transaction for atomicity
        await db.runTransaction(async (transaction) => {
            const familyRef = db.collection('families').doc(familyId);
            const userRef = db.collection('users').doc(userId);

            const userDoc = await transaction.get(userRef);
            if (userDoc.exists && userDoc.data().familyId) {
                throw new Error('You are already in a family. Leave it first.');
            }

            transaction.update(familyRef, {
                members: admin.firestore.FieldValue.arrayUnion(userId),
            });

            transaction.update(userRef, {
                familyId,
                role: 'member',
            });
        });

        res.status(200).json({ message: 'Joined family successfully', familyId });
    } catch (error) {
        if (error.message === 'You are already in a family. Leave it first.') {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
};
