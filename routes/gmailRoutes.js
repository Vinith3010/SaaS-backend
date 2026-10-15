const express = require('express');
const router = express.Router();
const {
  getGoogleAuthUrl,
  handleGoogleCallback,
  getStatus,
  syncEmails,
  syncDemo,
  disconnectGmail,
} = require('../controllers/gmailController');
const { protect } = require('../middleware/auth');

// Google OAuth routes
router.get('/auth/google', protect, getGoogleAuthUrl);
router.get('/auth/google/callback', handleGoogleCallback);

// Gmail Sync & Management routes
router.get('/gmail/status', protect, getStatus);
router.post('/gmail/sync', protect, syncEmails);
router.post('/gmail/demo-sync', protect, syncDemo);
router.post('/gmail/sync-demo', protect, syncDemo);
router.delete('/gmail/disconnect', protect, disconnectGmail);
router.post('/gmail/disconnect', protect, disconnectGmail);

module.exports = router;
