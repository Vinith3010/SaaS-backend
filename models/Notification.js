const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
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
    },
    type: {
      type: String,
      enum: [
        'renewal_7d',
        'renewal_3d',
        'renewal_1d',
        'renewal_today',
        'payment_detected',
        'sync_completed',
        'system',
      ],
      default: 'system',
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    scheduledFor: {
      type: Date,
      default: Date.now,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notification', NotificationSchema);
