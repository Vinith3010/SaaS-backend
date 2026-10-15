const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    gmailConnected: {
      type: Boolean,
      default: false,
    },
    gmailEmail: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
    gmailTokens: {
      access_token: { type: String, default: null },
      refresh_token: { type: String, default: null },
      scope: { type: String, default: null },
      token_type: { type: String, default: null },
      expiry_date: { type: Number, default: null },
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    settings: {
      currency: { type: String, default: 'INR' },
      currencySymbol: { type: String, default: '₹' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      emailNotifications: { type: Boolean, default: true },
      renewalAlerts: { type: Boolean, default: true },
      paymentDetectionAlerts: { type: Boolean, default: true },
      theme: { type: String, default: 'dark' },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', UserSchema);
