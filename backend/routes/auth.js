const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { registerValidation } = require('../middleware/validate');

router.post('/register', registerValidation, authController.register);
router.post('/login', authController.login);

module.exports = router;
