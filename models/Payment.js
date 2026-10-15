const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
      index: true,
    },
    serviceName: {
      type: String,
      required: true,
      trim: true,
    },
    planName: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    paymentDate: {
      type: Date,
      required: true,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: [
        'Paid',
        'Pending',
        'Failed',
        'Refunded',
        'Unknown',
        'PAID',
        'PENDING',
        'FAILED',
        'REFUNDED',
        'UNKNOWN',
      ],
      default: 'Paid',
    },
    transactionId: {
      type: String,
      default: null,
      index: true,
    },
    sourceEmailId: {
      type: String,
      default: null,
      index: true,
    },
    sourceSubject: {
      type: String,
      default: '',
    },
    paymentMethod: {
      type: String,
      default: 'Credit/Debit Card',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to help avoid duplicate payment records
PaymentSchema.index({ userId: 1, sourceEmailId: 1 }, { sparse: true });
PaymentSchema.index({ userId: 1, transactionId: 1 }, { sparse: true });

module.exports = mongoose.model('Payment', PaymentSchema);
