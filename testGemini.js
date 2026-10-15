const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { analyzePaymentEmail } = require('./services/geminiService');

const sampleEmail = `
Subject: Your Netflix payment was successful

Your Netflix Premium subscription payment was successful.

Amount charged: ₹649
Payment date: September 25, 2026
Your next billing date is October 25, 2026.
Transaction ID: NF123456789
`;

async function runTest() {
  console.log('====================================================');
  console.log('  Testing Gemini AI Payment Email Parser');
  console.log('====================================================');
  console.log('\n[Input Email Content]:');
  console.log(sampleEmail.trim());

  console.log('\n[Executing analyzePaymentEmail()] Calling Gemini API...');
  const startTime = Date.now();

  try {
    const result = await analyzePaymentEmail(sampleEmail);
    const duration = Date.now() - startTime;

    console.log(`\n✓ Successfully parsed in ${duration}ms!`);
    console.log('\n[Structured Output Result]:');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n[Validation Checks]:');
    console.log(`- Service Name:   ${result.serviceName} ${result.serviceName === 'Netflix' ? '✓' : '✗'}`);
    console.log(`- Plan Name:      ${result.planName} ${result.planName === 'Premium' ? '✓' : '✗'}`);
    console.log(`- Amount:         ${result.amount} ${result.amount === 649 ? '✓' : '✗'}`);
    console.log(`- Currency:       ${result.currency} ${result.currency === 'INR' ? '✓' : '✗'}`);
    console.log(`- Payment Date:   ${result.paymentDate} ${result.paymentDate === '2026-09-25' ? '✓' : '✗'}`);
    console.log(`- Payment Status: ${result.paymentStatus} ${result.paymentStatus === 'PAID' ? '✓' : '✗'}`);
    console.log(`- Renewal Date:   ${result.renewalDate} ${result.renewalDate === '2026-10-25' ? '✓' : '✗'}`);
    console.log(`- Expiry Date:    ${result.expiryDate} (Expected null: ${result.expiryDate === null ? '✓' : '✗'})`);
    console.log(`- Billing Cycle:  ${result.billingCycle} ${result.billingCycle === 'MONTHLY' ? '✓' : '✗'}`);
    console.log(`- Transaction ID: ${result.transactionId} ${result.transactionId === 'NF123456789' ? '✓' : '✗'}`);

    console.log('\n====================================================');
    console.log('  GEMINI INTEGRATION TEST PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (error) {
    console.error('\n✗ Gemini test failed with error:');
    console.error(error.message || error);
    console.error('\nStack trace:', error.stack);
    process.exitCode = 1;
  }
}

runTest();
