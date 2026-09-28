const admin = require('firebase-admin');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

let serviceAccount;
const keyPath = path.join(__dirname, 'serviceAccountKey.json');

if (fs.existsSync(keyPath)) {
    serviceAccount = require(keyPath);
    console.log("Using Firebase service account from local file.");
} else {
    try {
        const envKey = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (envKey) {
            serviceAccount = typeof envKey === 'string' ? JSON.parse(envKey) : envKey;
        }
    } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT from .env. Error:", e.message);
    }
}

let db, auth;

if (serviceAccount && serviceAccount.project_id) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    auth = admin.auth();
    console.log("Firebase Admin SDK initialized successfully.");
} else {
    console.warn("Firebase credentials missing or invalid. Firebase features will not work.");
    const notConfigured = () => { throw new Error("Firebase not configured"); };
    db = {
        collection: () => ({
            add: notConfigured,
            doc: () => ({ set: notConfigured, update: notConfigured, get: notConfigured }),
            where: () => ({ get: () => ({ empty: true, docs: [] }) }),
        }),
    };
    auth = { createUser: notConfigured, verifyIdToken: notConfigured };
}

module.exports = { admin, db, auth };
