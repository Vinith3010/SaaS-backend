const cron = require('node-cron');
const { checkRenewalsAndNotify } = require('../services/notifications/notificationService');

const initRenewalCron = () => {
  // Run daily at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] Running daily SaaS renewal monitoring job...');
    await checkRenewalsAndNotify();
  });

  // Run on startup after 10 seconds to ensure notifications are up to date
  setTimeout(async () => {
    console.log('[Scheduler] Running startup renewal check...');
    await checkRenewalsAndNotify();
  }, 10000);
};

module.exports = { initRenewalCron };
