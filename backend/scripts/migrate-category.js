/**
 * One-shot migration: rename "Cafes and Restaurants" → "Food"
 * in the `transactions` and `budgets` Firestore collections.
 *
 * Run once from the backend folder:
 *   node scripts/migrate-category.js
 */

const path = require('path');
const admin = require('firebase-admin');

const keyPath = path.join(__dirname, '../config/serviceAccountKey.json');
const serviceAccount = require(keyPath);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const OLD = 'Cafes and Restaurants';
const NEW = 'Food';

async function migrate(collectionName) {
    const snap = await db.collection(collectionName).where('category', '==', OLD).get();
    if (snap.empty) {
        console.log(`[${collectionName}] No documents to update.`);
        return 0;
    }

    // Firestore batch max 500 writes
    const batches = [];
    let batch = db.batch();
    let opCount = 0;

    snap.docs.forEach((doc) => {
        batch.update(doc.ref, { category: NEW });
        opCount++;
        if (opCount % 500 === 0) {
            batches.push(batch);
            batch = db.batch();
        }
    });
    batches.push(batch);

    for (const b of batches) await b.commit();
    console.log(`[${collectionName}] Updated ${snap.size} document(s): "${OLD}" → "${NEW}"`);
    return snap.size;
}

(async () => {
    try {
        const txCount = await migrate('transactions');
        const budgetCount = await migrate('budgets');
        const total = txCount + budgetCount;
        console.log(`\nDone. ${total} total document(s) updated.`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
})();

