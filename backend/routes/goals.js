const express = require('express');
const router = express.Router();
const goalController = require('../controllers/goalController');
const { requireAuth } = require('../middleware/auth');
const { goalValidation, goalUpdateValidation } = require('../middleware/validate');

router.post('/', requireAuth, goalValidation, goalController.createGoal);
router.get('/:familyId', requireAuth, goalController.getGoals);
router.put('/update', requireAuth, goalUpdateValidation, goalController.updateGoalAmount);

module.exports = router;
