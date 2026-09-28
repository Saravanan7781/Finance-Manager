const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');
const { transactionValidation } = require('../middleware/validate');

router.post('/', requireAuth, transactionValidation, transactionController.addTransaction);
router.get('/:familyId', requireAuth, transactionController.getTransactions);

module.exports = router;
