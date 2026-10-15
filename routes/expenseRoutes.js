const express = require('express');
const router = express.Router();
const {
  getAllExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getComparison,
} = require('../controllers/expenseController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getAllExpenses);
router.post('/', createExpense);
router.get('/comparison', getComparison);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

module.exports = router;
