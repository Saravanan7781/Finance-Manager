const express = require('express');
const router = express.Router();
const familyController = require('../controllers/familyController');
const { requireAuth } = require('../middleware/auth');
const { familyValidation, joinFamilyValidation } = require('../middleware/validate');

router.post('/create', requireAuth, familyValidation, familyController.createFamily);
router.post('/join', requireAuth, joinFamilyValidation, familyController.joinFamily);

module.exports = router;
