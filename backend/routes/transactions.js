const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');
const { transactionValidation, transactionUpdateValidation } = require('../middleware/validate');

router.post('/', requireAuth, transactionValidation, transactionController.addTransaction);
router.get('/:familyId/summary', requireAuth, transactionController.getSummary);
router.get('/:familyId/trend', requireAuth, transactionController.getTrend);
router.get('/:familyId', requireAuth, transactionController.getTransactions);
router.put('/:id', requireAuth, transactionUpdateValidation, transactionController.updateTransaction);
router.delete('/:id', requireAuth, transactionController.deleteTransaction);

module.exports = router;
