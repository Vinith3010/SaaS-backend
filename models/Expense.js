const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    category: {
      type: String,
      enum: [
        'Office & Supplies',
        'Hardware & Equipment',
        'Consulting & Legal',
        'Marketing & Ads',
        'Travel & Meals',
        'Utilities',
        'Other',
      ],
      default: 'Other',
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    paymentMethod: {
      type: String,
      default: 'Credit Card',
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Expense', ExpenseSchema);
