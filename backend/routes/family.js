const express = require('express');
const router = express.Router();
const familyController = require('../controllers/familyController');
const { requireAuth } = require('../middleware/auth');
const {
    familyValidation,
    joinFamilyValidation,
    transferAdminValidation,
} = require('../middleware/validate');

router.post('/create', requireAuth, familyValidation, familyController.createFamily);
router.post('/join', requireAuth, joinFamilyValidation, familyController.requestJoin);
router.post('/leave', requireAuth, familyController.leaveFamily);

router.post('/requests/:requestId/approve', requireAuth, familyController.approveRequest);
router.post('/requests/:requestId/reject', requireAuth, familyController.rejectRequest);

router.get('/:familyId', requireAuth, familyController.getFamily);
router.patch('/:familyId', requireAuth, familyValidation, familyController.renameFamily);
router.get('/:familyId/requests', requireAuth, familyController.listRequests);
router.post('/:familyId/invite', requireAuth, familyController.regenerateInvite);
router.put('/:familyId/admin', requireAuth, transferAdminValidation, familyController.transferAdmin);
router.delete('/:familyId/members/:userId', requireAuth, familyController.removeMember);
router.post('/:familyId/categories', requireAuth, familyController.addCategory);
router.delete('/:familyId/categories/:categoryId', requireAuth, familyController.deleteCategory);

module.exports = router;
