const express = require('express');
const router = express.Router();
const recurringController = require('../controllers/recurringController');
const { requireAuth } = require('../middleware/auth');

router.get('/:familyId', requireAuth, recurringController.getRecurring);
router.post('/', requireAuth, recurringController.createRecurring);
router.put('/:id', requireAuth, recurringController.updateRecurring);
router.delete('/:id', requireAuth, recurringController.deleteRecurring);
router.post('/:id/record', requireAuth, recurringController.recordRecurringInstance);

module.exports = router;
