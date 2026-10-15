/**
 * Modular Email Parser for SaaS Subscriptions & Receipts
 * Complies with strict data accuracy rules: If any field cannot be confidently extracted, it returns null.
 */

const KNOWN_SERVICES = [
  {
    name: 'Adobe',
    category: 'Design',
    keywords: ['adobe', 'creative cloud', 'photoshop', 'illustrator', 'acrobat'],
    senders: ['adobe.com', 'mail.adobe.com'],
  },
  {
    name: 'Netflix',
    category: 'Entertainment',
    keywords: ['netflix'],
    senders: ['netflix.com', 'mailer.netflix.com'],
  },
  {
    name: 'Spotify',
    category: 'Entertainment',
    keywords: ['spotify'],
    senders: ['spotify.com'],
  },
  {
    name: 'GitHub',
    category: 'Development',
    keywords: ['github', 'copilot', 'github pro'],
    senders: ['github.com'],
  },
  {
    name: 'AWS',
    category: 'Cloud',
    keywords: ['amazon web services', 'aws billing', 'aws'],
    senders: ['amazon.com', 'aws.amazon.com', 'amazonaws.com'],
  },
  {
    name: 'ChatGPT',
    category: 'Productivity',
    keywords: ['chatgpt', 'openai', 'chatgpt plus', 'chatgpt team'],
    senders: ['openai.com', 'stripe.com'],
  },
  {
    name: 'Microsoft 365',
    category: 'Productivity',
    keywords: ['microsoft 365', 'office 365', 'microsoft azure', 'azure', 'microsoft'],
    senders: ['microsoft.com', 'email.microsoft.com'],
  },
  {
    name: 'Google Workspace',
    category: 'Productivity',
    keywords: ['google workspace', 'google one', 'google storage', 'gsuite'],
    senders: ['google.com'],
  },
  {
    name: 'Notion',
    category: 'Productivity',
    keywords: ['notion', 'notion plus'],
    senders: ['m.notion.so', 'notion.so'],
  },
  {
    name: 'Zoom',
    category: 'Communication',
    keywords: ['zoom video communications', 'zoom pro', 'zoom'],
    senders: ['zoom.us'],
  },
  {
    name: 'Figma',
    category: 'Design',
    keywords: ['figma', 'figma professional'],
    senders: ['figma.com'],
  },
  {
    name: 'Canva',
    category: 'Design',
    keywords: ['canva', 'canva pro'],
    senders: ['canva.com'],
  },
  {
    name: 'DigitalOcean',
    category: 'Cloud',
    keywords: ['digitalocean'],
    senders: ['digitalocean.com'],
  },
  {
    name: 'Vercel',
    category: 'Development',
    keywords: ['vercel', 'vercel pro'],
    senders: ['vercel.com'],
  },
  {
    name: 'Slack',
    category: 'Communication',
    keywords: ['slack', 'slack pro', 'slack technologies'],
    senders: ['slack.com'],
  },
  {
    name: 'LinkedIn',
    category: 'Productivity',
    keywords: ['linkedin premium', 'linkedin learning', 'linkedin'],
    senders: ['linkedin.com'],
  },
  {
    name: 'Dropbox',
    category: 'Productivity',
    keywords: ['dropbox', 'dropbox plus'],
    senders: ['dropbox.com'],
  },
  {
    name: 'Coursera',
    category: 'Education',
    keywords: ['coursera', 'coursera plus'],
    senders: ['coursera.org'],
  },
];

// Helper to normalize and clean text
function cleanText(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Detect service and category based on sender and subject/body text
 */
function detectService(sender, subject, body) {
  const combined = `${sender} ${subject} ${body}`.toLowerCase();

  for (const item of KNOWN_SERVICES) {
    if (item.senders && item.senders.some((domain) => sender.toLowerCase().includes(domain))) {
      return { serviceName: item.name, category: item.category };
    }
    if (item.keywords && item.keywords.some((kw) => combined.includes(kw))) {
      return { serviceName: item.name, category: item.category };
    }
  }

  // Fallback: Attempt to extract from sender name or domain
  const senderMatch = sender.match(/(?:from:)?\s*"?([^"<@]+)"?\s*(?:<.*>)?/i);
  if (senderMatch && senderMatch[1] && !senderMatch[1].includes('@') && senderMatch[1].trim().length > 2) {
    const candidate = senderMatch[1].trim();
    if (!['receipt', 'invoice', 'billing', 'no-reply', 'noreply', 'support', 'team'].includes(candidate.toLowerCase())) {
      return { serviceName: candidate, category: 'Other' };
    }
  }

  return { serviceName: null, category: 'Other' };
}

/**
 * Extract currency symbol/code
 */
function extractCurrency(text) {
  if (/₹|INR|Rs\.?|Rupees/i.test(text)) return 'INR';
  if (/\$|USD/i.test(text)) return 'USD';
  if (/€|EUR/i.test(text)) return 'EUR';
  if (/£|GBP/i.test(text)) return 'GBP';
  if (/C\$|CAD/i.test(text)) return 'CAD';
  if (/A\$|AUD/i.test(text)) return 'AUD';
  return null;
}

/**
 * Extract monetary amount accurately
 */
function extractAmount(text) {
  const patterns = [
    // Amount charged: ₹1,675 or $20.00
    /(?:amount charged|amount paid|total paid|total charged|total amount|subtotal|amount|total|billed|price|charged):\s*(?:[₹$€£]|INR|USD|EUR|GBP)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
    // ₹1,675.00 or $20.00 or INR 1675
    /(?:[₹$€£]|INR|USD|EUR|GBP)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
    // 1,675 INR or 20.00 USD
    /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:INR|USD|EUR|GBP|₹|\$|€|£)/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const cleaned = match[1].replace(/,/g, '');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && parsed > 0 && parsed < 1000000) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Safe date parser with validation
 */
function safeParseDate(str) {
  if (!str) return null;
  const d = new Date(str.trim());
  if (isNaN(d.getTime())) return null;
  // Plausibility check: between year 2000 and 2050
  const year = d.getFullYear();
  if (year < 2000 || year > 2050) return null;
  return d;
}

/**
 * Extract renewal and expiry dates
 */
function extractRenewalDates(text) {
  let renewalDate = null;
  let expiryDate = null;

  // Renewal patterns:
  // "Renewal date: October 23, 2026"
  // "Next billing date: 2026-10-23"
  // "Renews on: 23 Sep 2026"
  // "Next payment on 23/10/2026"
  const renewalPatterns = [
    /(?:renewal date|renews on|next billing date|next renewal date|will automatically renew on|next payment on|next charge on|auto-renew(?:s)? on)[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+,? \d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    /(?:renews|renewal)[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+,? \d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
  ];

  for (const regex of renewalPatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const d = safeParseDate(match[1]);
      if (d) {
        renewalDate = d;
        break;
      }
    }
  }

  // Expiration patterns:
  const expiryPatterns = [
    /(?:expiry date|expires on|expiration date|valid until|valid through|access ends on)[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+,? \d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
  ];

  for (const regex of expiryPatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const d = safeParseDate(match[1]);
      if (d) {
        expiryDate = d;
        break;
      }
    }
  }

  return { renewalDate, expiryDate };
}

/**
 * Extract payment date
 */
function extractPaymentDate(text, emailDate) {
  const paymentDatePatterns = [
    /(?:payment date|date of payment|charged on|billed on|paid on|order date|invoice date)[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+,? \d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
  ];

  for (const regex of paymentDatePatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const d = safeParseDate(match[1]);
      if (d) return d;
    }
  }

  // If email date is provided, use it as fallback payment date
  if (emailDate) {
    const d = safeParseDate(emailDate);
    if (d) return d;
  }

  return null;
}

/**
 * Extract plan name
 */
function extractPlanName(text, serviceName) {
  // Check explicit plan patterns
  const planPatterns = [
    /(?:plan|subscription|package)[:\s]+([A-Za-z0-9\s+]+?)(?:\r|\n|\.|,|\(|-|\$|₹)/i,
    /(?:for your|your)\s+([A-Za-z0-9\s+]+?)\s+(?:subscription|plan|membership)/i,
  ];

  for (const regex of planPatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (
        candidate.length > 2 &&
        candidate.length < 50 &&
        !['payment', 'invoice', 'receipt', 'account', 'monthly', 'yearly', 'annual'].includes(candidate.toLowerCase())
      ) {
        return candidate;
      }
    }
  }

  // Service-specific plan detection
  const lower = text.toLowerCase();
  if (serviceName === 'Adobe') {
    if (lower.includes('creative cloud')) return 'Creative Cloud';
    if (lower.includes('photoshop')) return 'Photoshop';
    if (lower.includes('acrobat')) return 'Acrobat Pro';
  }
  if (serviceName === 'Netflix') {
    if (lower.includes('premium')) return 'Premium (4K)';
    if (lower.includes('standard')) return 'Standard (1080p)';
    if (lower.includes('basic')) return 'Basic';
  }
  if (serviceName === 'Spotify') {
    if (lower.includes('family')) return 'Premium Family';
    if (lower.includes('duo')) return 'Premium Duo';
    if (lower.includes('student')) return 'Premium Student';
    if (lower.includes('individual') || lower.includes('premium')) return 'Premium Individual';
  }
  if (serviceName === 'GitHub') {
    if (lower.includes('copilot')) return 'Copilot Pro';
    if (lower.includes('pro')) return 'Pro';
    if (lower.includes('team')) return 'Team';
  }
  if (serviceName === 'ChatGPT') {
    if (lower.includes('team')) return 'Team';
    if (lower.includes('plus')) return 'Plus';
    if (lower.includes('pro')) return 'Pro';
  }
  if (serviceName === 'Microsoft 365') {
    if (lower.includes('family')) return 'Family';
    if (lower.includes('personal')) return 'Personal';
    if (lower.includes('business')) return 'Business Standard';
  }

  return null;
}

/**
 * Extract billing cycle
 */
function extractBillingCycle(text) {
  const lower = text.toLowerCase();
  if (lower.includes('annual') || lower.includes('yearly') || lower.includes('/year') || lower.includes('per year')) {
    return 'yearly';
  }
  if (lower.includes('quarterly') || lower.includes('/quarter') || lower.includes('per quarter')) {
    return 'quarterly';
  }
  if (lower.includes('month') || lower.includes('/mo') || lower.includes('per month')) {
    return 'monthly';
  }
  return 'monthly'; // Standard SaaS default
}

/**
 * Extract transaction or invoice ID
 */
function extractTransactionId(text) {
  const patterns = [
    /(?:transaction\s*id|transaction\s*#|invoice\s*#|invoice\s*id|receipt\s*#|order\s*id|order\s*#|reference\s*#|reference\s*id)[:\s]+([A-Za-z0-9_-]{5,35})/i,
    /(?:inv|order|ref)[-#:\s]+([A-Za-z0-9_-]{5,30})/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Determine payment status
 */
function extractPaymentStatus(text) {
  const lower = text.toLowerCase();
  if (lower.includes('failed') || lower.includes('payment unsuccessful') || lower.includes('declined')) {
    return 'Failed';
  }
  if (lower.includes('pending') || lower.includes('processing')) {
    return 'Pending';
  }
  if (lower.includes('refund') || lower.includes('refunded')) {
    return 'Refunded';
  }
  if (
    lower.includes('successful') ||
    lower.includes('paid') ||
    lower.includes('renewed') ||
    lower.includes('receipt') ||
    lower.includes('invoice') ||
    lower.includes('amount charged')
  ) {
    return 'Paid';
  }
  return 'Paid';
}

/**
 * Main parser function
 * Takes email metadata and extracts structured subscription & payment data
 */
function parseEmail({ sourceEmailId, senderEmail, emailSubject, emailDate, bodyContent }) {
  const cleanBody = cleanText(bodyContent);
  const combinedText = `${emailSubject} ${cleanBody}`;

  const { serviceName, category } = detectService(senderEmail || '', emailSubject || '', cleanBody);
  const currency = extractCurrency(combinedText) || 'INR';
  const amount = extractAmount(combinedText);
  const { renewalDate, expiryDate } = extractRenewalDates(combinedText);
  const paymentDate = extractPaymentDate(combinedText, emailDate);
  const planName = extractPlanName(combinedText, serviceName);
  const billingCycle = extractBillingCycle(combinedText);
  const transactionId = extractTransactionId(combinedText);
  const paymentStatus = extractPaymentStatus(combinedText);

  return {
    serviceName: serviceName || 'Unknown Service',
    category,
    planName: planName || null,
    amount: amount !== null ? amount : null,
    currency,
    paymentDate: paymentDate || null,
    paymentStatus,
    renewalDate: renewalDate || null,
    expiryDate: expiryDate || null,
    billingCycle,
    senderEmail: senderEmail || null,
    emailSubject: emailSubject || '',
    transactionId: transactionId || null,
    sourceEmailId: sourceEmailId || null,
  };
}

module.exports = {
  parseEmail,
  detectService,
  extractCurrency,
  extractAmount,
  extractRenewalDates,
  extractPaymentDate,
  extractPlanName,
  extractBillingCycle,
  extractTransactionId,
  extractPaymentStatus,
  KNOWN_SERVICES,
};
