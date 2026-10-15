const nodemailer = require('nodemailer');
const Subscription = require('../../models/Subscription');
const Notification = require('../../models/Notification');
const User = require('../../models/User');

// Create reusable Nodemailer transporter
const createTransporter = () => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = process.env.EMAIL_PORT || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    // Return dummy transporter that logs rather than failing
    return {
      sendMail: async (mailOptions) => {
        console.log(`[Notification Email (Mock)] To: ${mailOptions.to} | Subject: ${mailOptions.subject}`);
        return { messageId: `mock_${Date.now()}` };
      },
    };
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

/**
 * Send an email notification to user
 */
const sendRenewalEmail = async ({ user, subscription, daysLeft }) => {
  if (!user.settings || user.settings.emailNotifications === false) {
    return false;
  }

  const transporter = createTransporter();
  const formattedDate = subscription.renewalDate
    ? new Date(subscription.renewalDate).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Upcoming';

  const subject = `Upcoming SaaS Subscription Renewal – ${subscription.serviceName}`;
  const textBody = `Hello ${user.name},

Your ${subscription.serviceName} subscription is scheduled for renewal ${daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}.

Service: ${subscription.serviceName}
Plan: ${subscription.planName || 'Standard'}
Amount: ${subscription.currency} ${subscription.amount.toLocaleString()}
Renewal Date: ${formattedDate}

Please review your subscription if required.

Regards,
SaaS Expense Analytics Dashboard`;

  try {
    await transporter.sendMail({
      from: `"SaaS Expense Analytics" <${process.env.EMAIL_USER || 'no-reply@saasdashboard.io'}>`,
      to: user.email,
      subject,
      text: textBody,
    });
    return true;
  } catch (err) {
    console.error(`[Notification Service] Failed to send email to ${user.email}:`, err.message);
    return false;
  }
};

/**
 * Scan all active subscriptions and generate renewal notifications
 */
const checkRenewalsAndNotify = async () => {
  try {
    const subscriptions = await Subscription.find({
      status: { $in: ['Active', 'Payment Due', 'Expiring Soon'] },
      renewalDate: { $ne: null },
    }).populate('userId');

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const sub of subscriptions) {
      if (!sub.userId) continue;
      const user = sub.userId;

      // Update computed status
      const updatedStatus = sub.calculateStatus();
      if (updatedStatus !== sub.status) {
        sub.status = updatedStatus;
        await sub.save();
      }

      const renewalDate = new Date(sub.renewalDate);
      renewalDate.setHours(0, 0, 0, 0);
      const diffTime = renewalDate.getTime() - now.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let notificationType = null;
      let title = '';
      let message = '';

      if (diffDays === 7) {
        notificationType = 'renewal_7d';
        title = `🔔 ${sub.serviceName} renews in 7 days`;
        message = `Your ${sub.serviceName} subscription renews in 7 days (${sub.currency} ${sub.amount}).`;
      } else if (diffDays === 3) {
        notificationType = 'renewal_3d';
        title = `⚠️ ${sub.serviceName} renews in 3 days`;
        message = `Your ${sub.serviceName} subscription of ${sub.currency} ${sub.amount} is due in 3 days.`;
      } else if (diffDays === 1) {
        notificationType = 'renewal_1d';
        title = `🔔 ${sub.serviceName} renews tomorrow`;
        message = `Your ${sub.serviceName} subscription of ${sub.currency} ${sub.amount} renews tomorrow.`;
      } else if (diffDays === 0) {
        notificationType = 'renewal_today';
        title = `🚨 ${sub.serviceName} renews today`;
        message = `Your ${sub.serviceName} subscription of ${sub.currency} ${sub.amount} is scheduled for renewal today.`;
      }

      if (notificationType) {
        // Prevent duplicate notification today for the same subscription & type
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const existingNotif = await Notification.findOne({
          userId: user._id,
          subscriptionId: sub._id,
          type: notificationType,
          createdAt: { $gte: startOfDay },
        });

        if (!existingNotif) {
          const emailSent = await sendRenewalEmail({ user, subscription: sub, daysLeft: diffDays });
          await Notification.create({
            userId: user._id,
            subscriptionId: sub._id,
            type: notificationType,
            title,
            message,
            scheduledFor: new Date(),
            emailSent,
          });
        }
      }
    }
  } catch (error) {
    console.error('[Notification Service] Error in checkRenewalsAndNotify:', error);
  }
};

module.exports = {
  checkRenewalsAndNotify,
  sendRenewalEmail,
};
