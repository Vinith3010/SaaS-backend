const { parseEmail } = require('./services/parser/emailParser');

const testEmails = [
  {
    sourceEmailId: 'test_adobe_01',
    senderEmail: 'billing@adobe.com',
    emailSubject: 'Your Adobe Creative Cloud subscription has been renewed',
    bodyContent: 'Your Adobe Creative Cloud subscription has been renewed. Amount charged: ₹1,675. Renewal date: October 23, 2026. Payment successful.',
  },
  {
    sourceEmailId: 'test_netflix_02',
    senderEmail: 'info@mailer.netflix.com',
    emailSubject: 'Netflix Membership Receipt',
    bodyContent: 'Thanks for using Netflix. Plan: Premium. Total charged: ₹649. Renewal date: October 2, 2026. Payment status: Paid. Order ID: NFLX-998822',
  },
  {
    sourceEmailId: 'test_missing_dates_03',
    senderEmail: 'unknown@example.com',
    emailSubject: 'Receipt for service',
    bodyContent: 'Thanks for your payment of $15.00 for our monthly plan.',
  },
];

console.log('Testing Email Parser:');
testEmails.forEach((email, i) => {
  const parsed = parseEmail(email);
  console.log(`\n--- Test Case ${i + 1} (${parsed.serviceName}) ---`);
  console.log('Service:', parsed.serviceName);
  console.log('Plan:', parsed.planName);
  console.log('Amount:', parsed.amount, parsed.currency);
  console.log('Payment Status:', parsed.paymentStatus);
  console.log('Renewal Date:', parsed.renewalDate);
  console.log('Transaction ID:', parsed.transactionId);
});
