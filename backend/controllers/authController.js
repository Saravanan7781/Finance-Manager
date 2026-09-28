const { auth, db } = require('../config/firebase');

exports.register = async (req, res, next) => {
    try {
        const { email, password, displayName } = req.body;

        const userRecord = await auth.createUser({
            email,
            password,
            displayName,
        });

        await db.collection('users').doc(userRecord.uid).set({
            email,
            displayName,
            familyId: null,
            role: 'member',
            createdAt: new Date(),
        });

        res.status(201).json({ message: 'User registered successfully', uid: userRecord.uid });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res) => {
    res.status(200).json({ message: 'Login flow is handled by Firebase on frontend.' });
};
