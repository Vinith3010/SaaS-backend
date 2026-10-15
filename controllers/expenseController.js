const Expense = require('../models/Expense');
const Payment = require('../models/Payment');

exports.getAllExpenses = async (req, res) => {
  try {
    const { category, startDate, endDate, search } = req.query;
    const query = { userId: req.user._id };

    if (category && category !== 'All') {
      query.category = category;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    const expenses = await Expense.find(query).sort({ date: -1 });
    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    return res.status(200).json({
      success: true,
      count: expenses.length,
      totalAmount,
      data: expenses,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch expenses.' });
  }
};

exports.createExpense = async (req, res) => {
  try {
    const { title, amount, currency, category, date, paymentMethod, description } = req.body;

    if (!title || amount === undefined || amount === null) {
      return res.status(400).json({ success: false, message: 'Expense title and amount are required.' });
    }

    const expense = await Expense.create({
      userId: req.user._id,
      title,
      amount: Number(amount),
      currency: currency || 'INR',
      category: category || 'Other',
      date: date ? new Date(date) : new Date(),
      paymentMethod: paymentMethod || 'Credit Card',
      description: description || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Expense recorded successfully.',
      data: expense,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to create expense.' });
  }
};

exports.updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Expense updated successfully.',
      data: expense,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update expense.' });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Expense deleted successfully.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete expense.' });
  }
};

exports.getComparison = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [saasPayments, generalExpenses] = await Promise.all([
      Payment.find({ userId, paymentDate: { $gte: startOfMonth }, paymentStatus: 'Paid' }),
      Expense.find({ userId, date: { $gte: startOfMonth } }),
    ]);

    const saasTotal = saasPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const generalTotal = generalExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        month: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        saasTotal: Math.round(saasTotal),
        generalTotal: Math.round(generalTotal),
        totalSpending: Math.round(saasTotal + generalTotal),
        comparison: [
          { name: 'SaaS Subscriptions', amount: Math.round(saasTotal) },
          { name: 'General Expenses', amount: Math.round(generalTotal) },
        ],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to compute comparison.' });
  }
};
