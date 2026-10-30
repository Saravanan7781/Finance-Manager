const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { requireAuth } = require('../middleware/auth');
const { loanValidation, loanUpdateValidation, loanRepayValidation } = require('../middleware/validate');

router.post('/', requireAuth, loanValidation, loanController.createLoan);
router.get('/:familyId', requireAuth, loanController.getLoans);
router.put('/:id/repay', requireAuth, loanRepayValidation, loanController.repayLoan);
router.put('/:id', requireAuth, loanUpdateValidation, loanController.updateLoan);
router.delete('/:id', requireAuth, loanController.deleteLoan);

module.exports = router;
