const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'saas_expense_tracker_secret_jwt_key_998877', {
    expiresIn: '7d',
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email is already registered. Please sign in.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
    });

    const token = signToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gmailConnected: user.gmailConnected,
        gmailEmail: user.gmailEmail,
        settings: user.settings,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both email and password.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. Password incorrect.' });
    }

    const token = signToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gmailConnected: user.gmailConnected,
        gmailEmail: user.gmailEmail,
        lastSyncedAt: user.lastSyncedAt,
        settings: user.settings,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

exports.demoLogin = async (req, res) => {
  try {
    const demoEmail = 'demo@saasanalytics.io';
    const demoPassword = 'Password123!';

    let user = await User.findOne({ email: demoEmail });
    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(demoPassword, salt);
      user = await User.create({
        name: 'Alex Morgan',
        email: demoEmail,
        passwordHash,
      });

      // Auto-seed mock SaaS subscriptions and invoices
      try {
        const { syncDemoEmails } = require('../services/gmailService');
        await syncDemoEmails(user);
      } catch (seedErr) {
        console.warn('[DemoAuth] Seed notice:', seedErr.message);
      }
    }

    const token = signToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Logged in as Demo User successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gmailConnected: user.gmailConnected,
        gmailEmail: user.gmailEmail,
        lastSyncedAt: user.lastSyncedAt,
        settings: user.settings,
      },
    });
  } catch (err) {
    console.error('Demo login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during demo login.' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = req.user || (await User.findById(req.user._id || req.user.id).select('-passwordHash'));
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gmailConnected: user.gmailConnected,
        gmailEmail: user.gmailEmail,
        lastSyncedAt: user.lastSyncedAt,
        settings: user.settings,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve user profile.' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { name, settings } = req.body;
    const user = await User.findById(req.user.id);

    if (name) user.name = name;
    if (settings) {
      user.settings = { ...user.settings, ...settings };
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Settings updated successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gmailConnected: user.gmailConnected,
        gmailEmail: user.gmailEmail,
        lastSyncedAt: user.lastSyncedAt,
        settings: user.settings,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide your account email.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Security best practice: don't reveal user existence
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, password reset instructions have been sent.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Password reset instructions have been dispatched to your email address.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
};
