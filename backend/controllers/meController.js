const { db } = require('../config/firebase');
const { serializeDoc } = require('../utils/http');

// Returns the signed-in user's profile, family and any join request still waiting on an admin.
exports.getMe = async (req, res, next) => {
    try {
        const { uid, email } = req.user;
        const userRef = db.collection('users').doc(uid);
        let userDoc = await userRef.get();

        // Accounts created straight through Firebase Auth have no profile document yet.
        if (!userDoc.exists) {
            await userRef.set({
                email,
                displayName: email ? email.split('@')[0] : 'Member',
                familyId: null,
                role: 'member',
                createdAt: new Date(),
            });
            userDoc = await userRef.get();
        }

        const user = serializeDoc(userDoc);
        let family = null;

        if (user.familyId) {
            const familyDoc = await db.collection('families').doc(user.familyId).get();
            const familyData = familyDoc.exists ? familyDoc.data() : null;

            if (familyData && familyData.members.includes(uid)) {
                family = {
                    id: familyDoc.id,
                    name: familyData.name,
                    inviteCode: familyData.inviteCode,
                    admin: familyData.admin,
                    memberCount: familyData.members.length,
                };
            } else {
                // The family was deleted or the user was removed; clear the stale link.
                await userRef.update({ familyId: null, role: 'member' });
                user.familyId = null;
                user.role = 'member';
            }
        }

        let pendingRequest = null;
        if (!family) {
            const pending = await db.collection('joinRequests')
                .where('userId', '==', uid)
                .where('status', '==', 'pending')
                .get();
            if (!pending.empty) {
                const request = serializeDoc(pending.docs[0]);
                const familyDoc = await db.collection('families').doc(request.familyId).get();
                pendingRequest = {
                    id: request.id,
                    familyId: request.familyId,
                    familyName: familyDoc.exists ? familyDoc.data().name : null,
                    createdAt: request.createdAt,
                };
            }
        }

        res.status(200).json({
            uid,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            familyId: user.familyId,
            family,
            pendingRequest,
        });
    } catch (error) {
        next(error);
    }
};

exports.updateMe = async (req, res, next) => {
    try {
        const { displayName } = req.body;
        await db.collection('users').doc(req.user.uid).set({ displayName }, { merge: true });
        res.status(200).json({ displayName });
    } catch (error) {
        next(error);
    }
};
