const express = require('express');
const router = express.Router();
const { register, login, demoLogin, getMe, updateSettings, forgotPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/demo', demoLogin);
router.post('/forgot-password', forgotPassword);
router.get('/me', protect, getMe);
router.put('/settings', protect, updateSettings);

module.exports = router;
