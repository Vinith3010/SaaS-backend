const express = require('express');
const router = express.Router();
const { getAllPayments, getPaymentById } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getAllPayments);
router.get('/:id', getPaymentById);

module.exports = router;
