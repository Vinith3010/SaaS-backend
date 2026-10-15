const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'Productivity',
        'Entertainment',
        'Cloud',
        'Design',
        'Development',
        'Education',
        'Communication',
        'Other',
      ],
      default: 'Other',
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
      trim: true,
    },
    billingCycle: {
      type: String,
      enum: [
        'monthly',
        'yearly',
        'quarterly',
        'weekly',
        'one-time',
        'unknown',
        'MONTHLY',
        'YEARLY',
        'QUARTERLY',
        'WEEKLY',
        'ONE_TIME',
        'UNKNOWN',
      ],
      default: 'monthly',
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    renewalDate: {
      type: Date,
      default: null,
      index: true,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: [
        'Active',
        'Payment Due',
        'Paid',
        'Expiring Soon',
        'Expired',
        'Cancelled',
        'Unknown',
      ],
      default: 'Active',
    },
    senderEmail: {
      type: String,
      default: null,
    },
    sourceEmailId: {
      type: String,
      default: null,
      index: true,
    },
    manuallyAdded: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Method to compute dynamic status based on renewalDate
SubscriptionSchema.methods.calculateStatus = function () {
  if (this.status === 'Cancelled') return 'Cancelled';
  if (!this.renewalDate) return this.status || 'Active';

  const now = new Date();
  const diffDays = Math.ceil((new Date(this.renewalDate) - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'Expired';
  } else if (diffDays <= 3) {
    return 'Expiring Soon';
  } else if (diffDays <= 7) {
    return 'Payment Due';
  } else {
    return 'Active';
  }
};

module.exports = mongoose.model('Subscription', SubscriptionSchema);
