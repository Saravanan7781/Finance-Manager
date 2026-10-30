const express = require('express');
const router = express.Router();
const meController = require('../controllers/meController');
const { requireAuth } = require('../middleware/auth');
const { profileValidation } = require('../middleware/validate');

router.get('/', requireAuth, meController.getMe);
router.patch('/', requireAuth, profileValidation, meController.updateMe);

module.exports = router;
