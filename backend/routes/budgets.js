const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const { requireAuth } = require('../middleware/auth');
const { budgetValidation } = require('../middleware/validate');

router.put('/', requireAuth, budgetValidation, budgetController.setBudget);
router.get('/:familyId', requireAuth, budgetController.getBudgets);
router.delete('/:id', requireAuth, budgetController.deleteBudget);

module.exports = router;
