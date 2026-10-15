const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// DNS fix for MongoDB Atlas SRV resolution
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = require('./app');
const { connectDB } = require('./config/db');
const { initRenewalCron } = require('./jobs/renewalCron');

const User = require('./models/User');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 5000;

const seedDemoAccountIfEmpty = async () => {
  try {
    const demoEmail = 'demo@saasanalytics.io';
    const existing = await User.findOne({ email: demoEmail });

    if (!existing) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('Password123!', salt);

      const demoUser = await User.create({
        name: 'Alex Morgan',
        email: demoEmail,
        passwordHash,
      });

      const { syncDemoEmails } = require('./services/gmailService');
      await syncDemoEmails(demoUser);

      console.log('[Seed] Demo account auto-created with pre-loaded SaaS subscriptions.');
    }
  } catch (seedErr) {
    console.warn('[Seed] Notice on demo account auto-seed:', seedErr.message);
  }
};

const startServer = async () => {
  try {
    await connectDB();
    initRenewalCron();
    await seedDemoAccountIfEmpty();

    app.listen(PORT, () => {
      console.log('====================================================');
      console.log('  SaaS Subscription & Expense Analytics Backend API');
      console.log(`  Server running on http://localhost:${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('====================================================');
    });
  } catch (error) {
    console.error('Failed to start backend server:', error);
    process.exit(1);
  }
};

startServer();