const { getAuthUrl, getTokensFromCode, syncGmail, syncDemoEmails } = require('../services/gmail/gmailService');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

exports.getGoogleAuthUrl = (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(200).json({
        success: true,
        configured: false,
        message: 'Google OAuth credentials not configured in server/.env. You can use Demo Mode for instant testing.',
      });
    }

    // Pass user ID inside state token to identify user upon callback
    const jwtSecret = process.env.JWT_SECRET || 'saas_expense_tracker_secret_jwt_key_998877';
    const stateToken = jwt.sign({ userId: req.user._id }, jwtSecret, {
      expiresIn: '15m',
    });

    const url = getAuthUrl() + `&state=${stateToken}`;
    return res.status(200).json({ success: true, configured: true, url });
  } catch (err) {
    console.error('Error generating Google Auth URL:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate OAuth URL.' });
  }
};

exports.handleGoogleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    if (error) {
      return res.redirect(`${clientUrl}/email-connection?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${clientUrl}/email-connection?error=missing_code_or_state`);
    }

    // Verify state to get user ID
    let userId;
    try {
      const jwtSecret = process.env.JWT_SECRET || 'saas_expense_tracker_secret_jwt_key_998877';
      const decoded = jwt.verify(state, jwtSecret);
      userId = decoded.userId;
    } catch (e) {
      return res.redirect(`${clientUrl}/email-connection?error=invalid_state`);
    }

    const { tokens, email } = await getTokensFromCode(code);
    const user = await User.findById(userId);

    if (!user) {
      return res.redirect(`${clientUrl}/email-connection?error=user_not_found`);
    }

    user.gmailConnected = true;
    user.gmailEmail = email;
    user.gmailTokens = tokens;
    await user.save();

    return res.redirect(`${clientUrl}/email-connection?success=connected&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('OAuth Callback Error:', err);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    return res.redirect(`${clientUrl}/email-connection?error=oauth_failed`);
  }
};

exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    return res.status(200).json({
      success: true,
      gmailConnected: !!user.gmailConnected,
      gmailEmail: user.gmailEmail,
      lastSyncedAt: user.lastSyncedAt,
      isOAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve Gmail status.' });
  }
};

exports.syncEmails = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // If real Gmail tokens exist, perform live sync
    if (user.gmailTokens && user.gmailTokens.access_token) {
      const syncResult = await syncGmail(user);
      return res.status(200).json({
        success: true,
        message: 'Gmail synchronization completed successfully.',
        data: syncResult,
      });
    }

    // If user clicked sync but credentials are not set up or demo mode is active
    const demoResult = await syncDemoEmails(user);
    return res.status(200).json({
      success: true,
      message: 'Demo email synchronization completed successfully.',
      data: demoResult,
    });
  } catch (err) {
    console.error('Sync Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Unable to synchronize Gmail right now. Please try again.',
    });
  }
};

exports.syncDemo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const demoResult = await syncDemoEmails(user);
    return res.status(200).json({
      success: true,
      message: 'Demo SaaS emails parsed and synced to MongoDB successfully.',
      data: demoResult,
    });
  } catch (err) {
    console.error('Demo Sync Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to run demo sync.' });
  }
};

exports.disconnectGmail = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.gmailConnected = false;
    user.gmailEmail = null;
    user.gmailTokens = {
      access_token: null,
      refresh_token: null,
      scope: null,
      token_type: null,
      expiry_date: null,
    };
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Gmail disconnected successfully.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to disconnect Gmail.' });
  }
};
