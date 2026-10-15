const express = require('express');
const router = express.Router();
const {
  getAllSubscriptions,
  getSubscriptionById,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} = require('../controllers/subscriptionController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getAllSubscriptions);
router.get('/:id', getSubscriptionById);
router.post('/', createSubscription);
router.put('/:id', updateSubscription);
router.delete('/:id', deleteSubscription);

module.exports = router;
