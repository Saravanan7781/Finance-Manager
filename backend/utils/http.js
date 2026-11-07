const { db } = require('../config/firebase');

class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Firestore Timestamps and Dates become ISO strings so the client gets plain JSON.
const serializeValue = (value) => {
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(serializeValue);
    return value;
};

const serializeDoc = (doc) => {
    const data = doc.data();
    const out = { id: doc.id };
    Object.keys(data).forEach((key) => {
        out[key] = serializeValue(data[key]);
    });
    return out;
};

// Loads the family and throws unless the user belongs to it.
const getFamilyForMember = async (familyId, uid) => {
    const familyDoc = await db.collection('families').doc(familyId).get();
    if (!familyDoc.exists) throw new HttpError(404, 'Family not found');

    const family = familyDoc.data();
    if (!family.members || !family.members.includes(uid)) {
        throw new HttpError(403, 'You are not a member of this family');
    }
    return { id: familyDoc.id, ...family };
};

const getFamilyForAdmin = async (familyId, uid) => {
    const family = await getFamilyForMember(familyId, uid);
    if (family.admin !== uid) throw new HttpError(403, 'Only the family admin can do this');
    return family;
};

// Loads a document by id and checks the caller belongs to the family it points at.
const getOwnedDoc = async (collection, id, uid) => {
    const doc = await db.collection(collection).doc(id).get();
    if (!doc.exists) throw new HttpError(404, 'Not found');

    const family = await getFamilyForMember(doc.data().familyId, uid);
    return { doc, family };
};

const parseLimit = (value, fallback = 50, max = 200) => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) return fallback;
    return Math.min(n, max);
};

const round2 = (n) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
};

// Updates rolling balance and member balances on the family document atomically
const updateFamilyBalance = async (familyId, userId, delta) => {
    const safeDelta = round2(delta);
    if (safeDelta === 0) return;
    return updateFamilyBalances(familyId, { [userId]: safeDelta });
};

// Atomically updates rolling family balance and multiple member balances in a single transaction
const updateFamilyBalances = async (familyId, memberDeltas) => {
    const entries = Object.entries(memberDeltas || {})
        .map(([uid, d]) => [uid, round2(d)])
        .filter(([_, d]) => d !== 0);

    if (entries.length === 0) return;

    try {
        const familyRef = db.collection('families').doc(familyId);
        await db.runTransaction(async (transaction) => {
            const fDoc = await transaction.get(familyRef);
            if (!fDoc.exists) return;

            const fData = fDoc.data();
            let curBalance = typeof fData.balance === 'number' && Number.isFinite(fData.balance) ? fData.balance : 0;
            const mBalances = fData.memberBalances && typeof fData.memberBalances === 'object' ? { ...fData.memberBalances } : {};

            let totalDelta = 0;
            for (const [uid, delta] of entries) {
                const curMember = typeof mBalances[uid] === 'number' && Number.isFinite(mBalances[uid]) ? mBalances[uid] : 0;
                mBalances[uid] = round2(curMember + delta);
                totalDelta = round2(totalDelta + delta);
            }

            transaction.update(familyRef, {
                balance: round2(curBalance + totalDelta),
                memberBalances: mBalances,
                updatedAt: new Date(),
            });
        });
    } catch (err) {
        if (process.env.NODE_ENV !== 'test') {
            console.error('Failed to update family balances:', err.message);
        }
        throw err;
    }
};

// Generates searchable keywords and prefixes for fast server-side search
const buildKeywords = (...inputs) => {
    const text = inputs.filter(Boolean).join(' ').toLowerCase();
    const words = text.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
    const prefixes = new Set();
    words.forEach((w) => {
        for (let i = 2; i <= Math.min(w.length, 15); i++) {
            prefixes.add(w.slice(0, i));
        }
    });
    return Array.from(prefixes).slice(0, 50);
};

module.exports = {
    HttpError,
    serializeDoc,
    getFamilyForMember,
    getFamilyForAdmin,
    getOwnedDoc,
    parseLimit,
    round2,
    updateFamilyBalance,
    updateFamilyBalances,
    buildKeywords,
};
