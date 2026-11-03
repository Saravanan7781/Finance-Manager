const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const recurringController = require('../controllers/recurringController');

// Safety: fallback empty list if familyId is omitted
router.get('/', requireAuth, (req, res) => res.json([]));
router.get('/:familyId', requireAuth, recurringController.getRecurring);
router.post('/', requireAuth, recurringController.createRecurring);
router.put('/:id', requireAuth, recurringController.updateRecurring);
router.delete('/:id', requireAuth, recurringController.deleteRecurring);
router.post('/:id/record', requireAuth, recurringController.recordRecurringInstance);

module.exports = router;
