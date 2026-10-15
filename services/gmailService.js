const { google } = require('googleapis');
const { analyzePaymentEmail } = require('./geminiService');
const { parseEmail: fallbackRegexParse } = require('./parser/emailParser');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Common Category mapping helper based on SaaS merchant / service names
 */
const CATEGORY_MAP = {
  netflix: 'Entertainment',
  spotify: 'Entertainment',
  youtube: 'Entertainment',
  hulu: 'Entertainment',
  disney: 'Entertainment',
  adobe: 'Design',
  figma: 'Design',
  canva: 'Design',
  github: 'Development',
  gitlab: 'Development',
  vercel: 'Development',
  aws: 'Cloud',
  digitalocean: 'Cloud',
  azure: 'Cloud',
  google: 'Productivity',
  chatgpt: 'Productivity',
  openai: 'Productivity',
  notion: 'Productivity',
  slack: 'Communication',
  zoom: 'Communication',
  microsoft: 'Productivity',
  linkedin: 'Productivity',
};

function inferCategory(serviceName) {
  if (!serviceName) return 'Other';
  const lower = serviceName.toLowerCase();
  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) {
      return category;
    }
  }
  return 'Other';
}

/**
 * Configure Google OAuth2 Client
 */
const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    console.warn('[GmailService] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

/**
 * Generate Google OAuth authorization URL
 */
const getAuthUrl = () => {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.readonly',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });
};

/**
 * Exchange authorization code for OAuth tokens and retrieve user profile email
 */
const getTokensFromCode = async (code) => {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();

  return {
    tokens,
    email: userInfo.data.email,
  };
};

/**
 * Decode base64 URL safe string
 */
function decodeBase64(str) {
  if (!str) return '';
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

/**
 * Recursively extract email text body from Gmail message payload parts
 */
function extractBodyFromPayload(payload) {
  if (!payload) return '';

  if (payload.body && payload.body.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts && payload.parts.length) {
    let plainText = '';
    let htmlText = '';

    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        plainText += decodeBase64(part.body.data) + '\n';
      } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
        htmlText += decodeBase64(part.body.data) + '\n';
      } else if (part.parts) {
        const nested = extractBodyFromPayload(part);
        if (nested) plainText += nested + '\n';
      }
    }

    if (plainText.trim()) return plainText.trim();
    if (htmlText.trim()) {
      // Strip HTML tags for clean text extraction
      return htmlText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return '';
}

/**
 * Process parsed email details and store/update in MongoDB with duplicate prevention
 */
async function processAndStoreEmail(userId, parsed, meta = {}) {
  const serviceName = parsed.serviceName || meta.serviceName;
  const amount = parsed.amount !== null && parsed.amount !== undefined ? Number(parsed.amount) : null;

  if (!serviceName || serviceName === 'Unknown Service' || amount === null || isNaN(amount)) {
    return { status: 'skipped', reason: 'Missing essential service name or amount' };
  }

  const sourceEmailId = meta.sourceEmailId || parsed.sourceEmailId || null;
  const transactionId = parsed.transactionId || meta.transactionId || null;

  // Duplicate Prevention: Check if payment already exists by sourceEmailId or transactionId
  const duplicateConditions = [];
  if (sourceEmailId) {
    duplicateConditions.push({ sourceEmailId });
  }
  if (transactionId) {
    duplicateConditions.push({ transactionId });
  }

  let existingPayment = null;
  if (duplicateConditions.length > 0) {
    existingPayment = await Payment.findOne({
      userId,
      $or: duplicateConditions,
    });
  }

  if (existingPayment) {
    // If payment exists, update missing transactionId or status if appropriate
    let updated = false;
    if (!existingPayment.transactionId && transactionId) {
      existingPayment.transactionId = transactionId;
      updated = true;
    }
    if (parsed.paymentStatus && existingPayment.paymentStatus !== parsed.paymentStatus) {
      existingPayment.paymentStatus = parsed.paymentStatus;
      updated = true;
    }
    if (updated) {
      await existingPayment.save();
    }
    return { status: 'duplicate', paymentId: existingPayment._id, updated };
  }

  // Find or create Subscription record
  let subscription = await Subscription.findOne({
    userId,
    serviceName: { $regex: new RegExp(`^${serviceName.trim()}$`, 'i') },
  });

  let isNewSubscription = false;
  const inferredCat = inferCategory(serviceName);
  const normalizedBillingCycle = (parsed.billingCycle || 'MONTHLY').toLowerCase();

  const paymentDate = parsed.paymentDate ? new Date(parsed.paymentDate) : new Date();
  const renewalDate = parsed.renewalDate ? new Date(parsed.renewalDate) : null;
  const expiryDate = parsed.expiryDate ? new Date(parsed.expiryDate) : null;

  if (!subscription) {
    isNewSubscription = true;
    subscription = new Subscription({
      userId,
      serviceName: serviceName.trim(),
      planName: parsed.planName || null,
      category: inferredCat,
      amount,
      currency: parsed.currency || 'INR',
      billingCycle: normalizedBillingCycle,
      paymentDate,
      renewalDate,
      expiryDate,
      status: 'Active',
      senderEmail: meta.senderEmail || null,
      sourceEmailId,
      manuallyAdded: false,
    });
  } else {
    // Update existing subscription with latest payment & renewal data
    subscription.amount = amount;
    if (parsed.currency) subscription.currency = parsed.currency;
    if (parsed.planName) subscription.planName = parsed.planName;
    if (renewalDate) subscription.renewalDate = renewalDate;
    if (paymentDate) subscription.paymentDate = paymentDate;
    if (expiryDate) subscription.expiryDate = expiryDate;
    if (normalizedBillingCycle) subscription.billingCycle = normalizedBillingCycle;
    subscription.status = subscription.calculateStatus();
  }

  await subscription.save();

  // Create new Payment record
  const payment = new Payment({
    userId,
    subscriptionId: subscription._id,
    serviceName: subscription.serviceName,
    planName: parsed.planName || subscription.planName || null,
    amount,
    currency: parsed.currency || subscription.currency || 'INR',
    paymentDate,
    paymentStatus: parsed.paymentStatus || 'PAID',
    transactionId,
    sourceEmailId,
    sourceSubject: meta.emailSubject || '',
    paymentMethod: 'Credit/Debit Card',
  });

  await payment.save();

  // Create In-App Notification
  await Notification.create({
    userId,
    subscriptionId: subscription._id,
    type: 'payment_detected',
    title: `Payment Detected: ${subscription.serviceName}`,
    message: `Payment of ${payment.currency} ${payment.amount.toLocaleString()} detected for ${subscription.serviceName}${
      payment.planName ? ` (${payment.planName})` : ''
    }.`,
    scheduledFor: new Date(),
    sentAt: new Date(),
    read: false,
  });

  return {
    status: 'created',
    isNewSubscription,
    subscriptionId: subscription._id,
    paymentId: payment._id,
  };
}

/**
 * Retrieve targeted emails via Gmail API and analyze with Gemini AI
 */
const syncGmail = async (user) => {
  if (!user.gmailTokens || !user.gmailTokens.access_token) {
    throw new Error('Gmail is not connected. Please authorize Gmail access first.');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(user.gmailTokens);

  // Listen for refreshed tokens
  oauth2Client.on('tokens', async (newTokens) => {
    user.gmailTokens = { ...user.gmailTokens, ...newTokens };
    await user.save();
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Targeted query for SaaS subscription & payment related emails (Phase 8)
  const query =
    'subject:(payment OR "payment successful" OR "payment confirmation" OR receipt OR invoice OR subscription OR "subscription renewal" OR renewed OR renewal OR billing OR charged OR transaction OR "upcoming renewal" OR expires OR expiration)';

  let listRes;
  try {
    listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 25,
    });
  } catch (err) {
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      user.gmailConnected = false;
      await user.save();
      throw new Error('Gmail authorization expired or was revoked. Please reconnect your Gmail account.');
    }
    throw new Error(`Gmail API failure: ${err.message}`);
  }

  const messages = listRes.data.messages || [];
  let scannedCount = messages.length;
  let paymentsDetected = 0;
  let newSubscriptions = 0;
  let subscriptionsUpdated = 0;

  for (const msgSummary of messages) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgSummary.id,
        format: 'full',
      });

      const headers = msgRes.data.payload.headers || [];
      const subjectHeader = headers.find((h) => h.name.toLowerCase() === 'subject');
      const senderHeader = headers.find((h) => h.name.toLowerCase() === 'from');
      const dateHeader = headers.find((h) => h.name.toLowerCase() === 'date');

      const emailSubject = subjectHeader ? subjectHeader.value : '';
      const senderEmail = senderHeader ? senderHeader.value : '';
      const emailDate = dateHeader ? dateHeader.value : '';
      const bodyText = extractBodyFromPayload(msgRes.data.payload);

      const emailPayloadText = `Subject: ${emailSubject}\nFrom: ${senderEmail}\nDate: ${emailDate}\n\nEmail Body:\n${bodyText}`;

      // Gemini AI Analysis Pipeline (Phase 9)
      let parsed;
      try {
        parsed = await analyzePaymentEmail(emailPayloadText);
      } catch (geminiErr) {
        console.warn(`[GmailService] Gemini parsing fallback for ${msgSummary.id}:`, geminiErr.message);
        // Resilient fallback to rule-based parser if Gemini encountered an issue
        parsed = fallbackRegexParse({
          sourceEmailId: msgSummary.id,
          senderEmail,
          emailSubject,
          emailDate,
          bodyContent: bodyText,
        });
      }

      if (parsed) {
        const result = await processAndStoreEmail(user._id, parsed, {
          sourceEmailId: msgSummary.id,
          senderEmail,
          emailSubject,
        });

        if (result.status === 'created') {
          paymentsDetected++;
          if (result.isNewSubscription) {
            newSubscriptions++;
          } else {
            subscriptionsUpdated++;
          }
        }
      }
    } catch (msgErr) {
      console.error(`Error processing message ${msgSummary.id}:`, msgErr.message);
    }
  }

  user.lastSyncedAt = new Date();
  await user.save();

  return {
    scannedCount,
    paymentsDetected,
    newSubscriptions,
    subscriptionsUpdated,
    syncedAt: user.lastSyncedAt,
  };
};

/**
 * Realistic Demo SaaS Email Fixtures for Instant Testing
 */
const getDemoFixtures = () => {
  const now = new Date();
  const formatFutureDate = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };
  const formatPastDate = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };

  return [
    {
      sourceEmailId: 'demo_netflix_01',
      senderEmail: 'info@mailer.netflix.com',
      emailSubject: 'Your Netflix payment was successful',
      content: `Subject: Your Netflix payment was successful\n\nYour Netflix Premium subscription payment was successful.\nAmount charged: ₹649\nPayment date: ${formatPastDate(
        2
      )}\nYour next billing date is ${formatFutureDate(28)}.\nTransaction ID: NF123456789`,
    },
    {
      sourceEmailId: 'demo_adobe_02',
      senderEmail: 'billing@adobe.com',
      emailSubject: 'Your Adobe Creative Cloud subscription has been renewed',
      content: `Subject: Your Adobe Creative Cloud subscription has been renewed\n\nYour Adobe Creative Cloud All Apps subscription has been renewed.\nAmount charged: ₹1,675\nPayment date: ${formatPastDate(
        5
      )}\nRenewal date: ${formatFutureDate(25)}.\nPayment status: Paid\nTransaction ID: ADB-99882231`,
    },
    {
      sourceEmailId: 'demo_spotify_03',
      senderEmail: 'no-reply@spotify.com',
      emailSubject: 'Spotify Premium Family Receipt',
      content: `Subject: Spotify Premium Family Receipt\n\nThank you for choosing Spotify.\nPlan: Premium Family\nAmount charged: ₹179\nPayment date: ${formatPastDate(
        10
      )}\nNext billing date is ${formatFutureDate(20)}.\nTransaction ID: SPOT-448811`,
    },
    {
      sourceEmailId: 'demo_github_04',
      senderEmail: 'billing@github.com',
      emailSubject: 'GitHub Receipt for Pro plan',
      content: `Subject: GitHub Receipt for Pro plan\n\nThank you for your payment to GitHub.\nPlan: GitHub Pro\nAmount charged: ₹400\nPayment date: ${formatPastDate(
        14
      )}\nRenewal date: ${formatFutureDate(16)}.\nStatus: PAID\nTransaction ID: GH-902148`,
    },
  ];
};

/**
 * Demo Sync for Instant Testing Without Gmail Credentials (Phase 18)
 */
const syncDemoEmails = async (user) => {
  const fixtures = getDemoFixtures();
  let scannedCount = fixtures.length;
  let paymentsDetected = 0;
  let newSubscriptions = 0;
  let subscriptionsUpdated = 0;

  for (const fixture of fixtures) {
    let parsed = fallbackRegexParse({
      sourceEmailId: fixture.sourceEmailId,
      senderEmail: fixture.senderEmail,
      emailSubject: fixture.emailSubject,
      bodyContent: fixture.content,
    });

    if (parsed) {
      const result = await processAndStoreEmail(user._id, parsed, {
        sourceEmailId: fixture.sourceEmailId,
        senderEmail: fixture.senderEmail,
        emailSubject: fixture.emailSubject,
      });

      if (result.status === 'created') {
        paymentsDetected++;
        if (result.isNewSubscription) {
          newSubscriptions++;
        } else {
          subscriptionsUpdated++;
        }
      }
    }
  }

  user.gmailConnected = true;
  if (!user.gmailEmail) {
    user.gmailEmail = 'demo.subscriber@gmail.com';
  }
  user.lastSyncedAt = new Date();
  await user.save();

  return {
    scannedCount,
    paymentsDetected,
    newSubscriptions,
    subscriptionsUpdated,
    syncedAt: user.lastSyncedAt,
    isDemo: true,
  };
};

module.exports = {
  getOAuth2Client,
  getAuthUrl,
  getTokensFromCode,
  syncGmail,
  syncDemoEmails,
  processAndStoreEmail,
  inferCategory,
};
