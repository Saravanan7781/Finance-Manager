const { db, admin } = require('../config/firebase');
const crypto = require('crypto');
const {
    HttpError,
    serializeDoc,
    getFamilyForMember,
    getFamilyForAdmin,
} = require('../utils/http');

const generateInviteCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

exports.createFamily = async (req, res, next) => {
    try {
        const { familyName } = req.body;
        const userId = req.user.uid;

        const inviteCode = generateInviteCode();
        const familyRef = db.collection('families').doc();
        const userRef = db.collection('users').doc(userId);

        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (userDoc.exists && userDoc.data().familyId) {
                throw new HttpError(409, 'You are already in a family. Leave it first.');
            }

            transaction.set(familyRef, {
                name: familyName,
                inviteCode,
                admin: userId,
                members: [userId],
                createdAt: new Date(),
            });
            transaction.set(userRef, { familyId: familyRef.id, role: 'admin' }, { merge: true });
        });

        res.status(201).json({ familyId: familyRef.id, inviteCode });
    } catch (error) {
        next(error);
    }
};

// Joining needs the admin's approval, so this only files a request.
exports.requestJoin = async (req, res, next) => {
    try {
        const inviteCode = req.body.inviteCode.trim().toUpperCase();
        const userId = req.user.uid;

        const userDoc = await db.collection('users').doc(userId).get();
        const user = userDoc.exists ? userDoc.data() : {};
        if (user.familyId) {
            throw new HttpError(400, 'You are already in a family. Leave it first.');
        }

        const familyQuery = await db.collection('families').where('inviteCode', '==', inviteCode).get();
        if (familyQuery.empty) {
            throw new HttpError(404, 'Invalid invite code');
        }
        const familyDoc = familyQuery.docs[0];

        const existing = await db.collection('joinRequests')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .get();
        if (!existing.empty) {
            throw new HttpError(409, 'You already have a join request waiting for approval');
        }

        const requestRef = await db.collection('joinRequests').add({
            familyId: familyDoc.id,
            userId,
            displayName: user.displayName || req.user.email,
            email: req.user.email,
            status: 'pending',
            createdAt: new Date(),
        });

        res.status(202).json({
            message: 'Join request sent. An admin needs to approve it.',
            requestId: requestRef.id,
            familyName: familyDoc.data().name,
        });
    } catch (error) {
        next(error);
    }
};

exports.getFamily = async (req, res, next) => {
    try {
        const family = await getFamilyForMember(req.params.familyId, req.user.uid);

        const memberDocs = await Promise.all(
            family.members.map((uid) => db.collection('users').doc(uid).get())
        );
        const members = memberDocs.map((doc, i) => {
            const data = doc.exists ? doc.data() : {};
            return {
                uid: family.members[i],
                displayName: data.displayName || 'Member',
                email: data.email || null,
                role: family.members[i] === family.admin ? 'admin' : 'member',
            };
        });

        res.status(200).json({
            id: family.id,
            name: family.name,
            inviteCode: family.inviteCode,
            admin: family.admin,
            createdAt: family.createdAt,
            members,
        });
    } catch (error) {
        next(error);
    }
};

exports.listRequests = async (req, res, next) => {
    try {
        await getFamilyForAdmin(req.params.familyId, req.user.uid);

        const snapshot = await db.collection('joinRequests')
            .where('familyId', '==', req.params.familyId)
            .where('status', '==', 'pending')
            .get();

        const requests = snapshot.docs.map(serializeDoc);
        requests.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        res.status(200).json(requests);
    } catch (error) {
        next(error);
    }
};

const resolveRequest = (decision) => async (req, res, next) => {
    try {
        const requestRef = db.collection('joinRequests').doc(req.params.requestId);
        const requestDoc = await requestRef.get();
        if (!requestDoc.exists) throw new HttpError(404, 'Join request not found');

        const request = requestDoc.data();
        await getFamilyForAdmin(request.familyId, req.user.uid);
        if (request.status !== 'pending') {
            throw new HttpError(409, `This request was already ${request.status}`);
        }

        if (decision === 'reject') {
            await requestRef.update({ status: 'rejected', resolvedAt: new Date() });
            return res.status(200).json({ message: 'Request rejected' });
        }

        const familyRef = db.collection('families').doc(request.familyId);
        const userRef = db.collection('users').doc(request.userId);

        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (userDoc.exists && userDoc.data().familyId) {
                throw new HttpError(409, 'This person already joined another family');
            }

            transaction.update(familyRef, {
                members: admin.firestore.FieldValue.arrayUnion(request.userId),
            });
            transaction.set(userRef, { familyId: request.familyId, role: 'member' }, { merge: true });
            transaction.update(requestRef, { status: 'approved', resolvedAt: new Date() });
        });

        res.status(200).json({ message: 'Request approved' });
    } catch (error) {
        next(error);
    }
};

exports.approveRequest = resolveRequest('approve');
exports.rejectRequest = resolveRequest('reject');

exports.leaveFamily = async (req, res, next) => {
    try {
        const userId = req.user.uid;
        const userRef = db.collection('users').doc(userId);

        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const familyId = userDoc.exists ? userDoc.data().familyId : null;
            if (!familyId) throw new HttpError(400, 'You are not in a family');

            const familyRef = db.collection('families').doc(familyId);
            const familyDoc = await transaction.get(familyRef);

            if (familyDoc.exists) {
                const family = familyDoc.data();
                const others = family.members.filter((uid) => uid !== userId);

                if (family.admin === userId && others.length > 0) {
                    throw new HttpError(400, 'Make another member the admin before you leave');
                }
                if (others.length === 0) {
                    transaction.delete(familyRef);
                } else {
                    transaction.update(familyRef, { members: admin.firestore.FieldValue.arrayRemove(userId) });
                }
            }

            transaction.update(userRef, { familyId: null, role: 'member' });
        });

        res.status(200).json({ message: 'You left the family' });
    } catch (error) {
        next(error);
    }
};

exports.removeMember = async (req, res, next) => {
    try {
        const { familyId, userId } = req.params;
        const family = await getFamilyForAdmin(familyId, req.user.uid);

        if (userId === family.admin) throw new HttpError(400, 'The admin cannot be removed');
        if (!family.members.includes(userId)) throw new HttpError(404, 'That person is not in this family');

        await db.collection('families').doc(familyId).update({
            members: admin.firestore.FieldValue.arrayRemove(userId),
        });
        await db.collection('users').doc(userId).set({ familyId: null, role: 'member' }, { merge: true });

        res.status(200).json({ message: 'Member removed' });
    } catch (error) {
        next(error);
    }
};

exports.transferAdmin = async (req, res, next) => {
    try {
        const { familyId } = req.params;
        const { userId } = req.body;
        const family = await getFamilyForAdmin(familyId, req.user.uid);

        if (!family.members.includes(userId)) throw new HttpError(404, 'That person is not in this family');

        await db.collection('families').doc(familyId).update({ admin: userId });
        await db.collection('users').doc(userId).set({ role: 'admin' }, { merge: true });
        await db.collection('users').doc(req.user.uid).set({ role: 'member' }, { merge: true });

        res.status(200).json({ message: 'Admin rights transferred' });
    } catch (error) {
        next(error);
    }
};

exports.renameFamily = async (req, res, next) => {
    try {
        await getFamilyForAdmin(req.params.familyId, req.user.uid);

        const name = req.body.familyName;
        await db.collection('families').doc(req.params.familyId).update({ name });

        res.status(200).json({ name });
    } catch (error) {
        next(error);
    }
};

exports.regenerateInvite = async (req, res, next) => {
    try {
        await getFamilyForAdmin(req.params.familyId, req.user.uid);

        const inviteCode = generateInviteCode();
        await db.collection('families').doc(req.params.familyId).update({ inviteCode });

        res.status(200).json({ inviteCode });
    } catch (error) {
        next(error);
    }
};
