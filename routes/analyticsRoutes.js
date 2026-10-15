const express = require('express');
const router = express.Router();
const {
  getOverview,
  getMonthlyTrends,
  getCategoryBreakdown,
  getSubscriptionDistribution,
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/overview', getOverview);

// Support both naming conventions used across client code and documentation
router.get('/trends', getMonthlyTrends);
router.get('/monthly', getMonthlyTrends);

router.get('/category-breakdown', getCategoryBreakdown);
router.get('/categories', getCategoryBreakdown);

router.get('/status-distribution', getSubscriptionDistribution);
router.get('/subscriptions', getSubscriptionDistribution);

module.exports = router;
