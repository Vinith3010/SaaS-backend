const { GoogleGenAI, Type } = require('@google/genai');

/**
 * Structured schema definition for SaaS payment and subscription email parsing.
 * Enforces strict JSON types via Google GenAI SDK.
 */
const paymentExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    serviceName: {
      type: Type.STRING,
      nullable: true,
      description:
        'The name of the SaaS/subscription service (e.g. Netflix, Spotify, Adobe, GitHub, AWS, Google Workspace, ChatGPT, Notion, Canva, Figma). Return null if not identifiable.',
    },
    planName: {
      type: Type.STRING,
      nullable: true,
      description:
        'The specific tier or plan name (e.g. Premium, Pro, Family, Individual, Business, Standard). Return null if not stated.',
    },
    amount: {
      type: Type.NUMBER,
      nullable: true,
      description:
        'The exact numeric payment amount charged or billed (e.g. 649, 19.99). Never invent or guess an amount. Return null if no numeric amount is present.',
    },
    currency: {
      type: Type.STRING,
      nullable: true,
      description:
        'Standard 3-letter ISO 4217 currency code (e.g. INR for ₹ or Rs, USD for $, EUR for €, GBP for £). Return null if unknown.',
    },
    paymentDate: {
      type: Type.STRING,
      nullable: true,
      description:
        'The date on which this payment was made or charged, formatted strictly as YYYY-MM-DD. Never invent dates. Return null if no payment date is stated.',
    },
    paymentStatus: {
      type: Type.STRING,
      enum: ['PAID', 'PENDING', 'FAILED', 'REFUNDED', 'UNKNOWN'],
      description:
        'Normalized payment status: PAID (successful/charged/renewed), PENDING (due/processing), FAILED (declined), REFUNDED (returned), or UNKNOWN.',
    },
    renewalDate: {
      type: Type.STRING,
      nullable: true,
      description:
        'The next billing date, renewal date, or next scheduled charge explicitly stated in the email, formatted strictly as YYYY-MM-DD. Never invent or assume a renewal date. Return null if not present.',
    },
    expiryDate: {
      type: Type.STRING,
      nullable: true,
      description:
        'The subscription expiration or cancellation effective date if explicitly stated, formatted strictly as YYYY-MM-DD. Return null if not present.',
    },
    billingCycle: {
      type: Type.STRING,
      enum: ['MONTHLY', 'YEARLY', 'WEEKLY', 'QUARTERLY', 'ONE_TIME', 'UNKNOWN'],
      description:
        'Normalized billing cycle frequency: MONTHLY, YEARLY, WEEKLY, QUARTERLY, ONE_TIME, or UNKNOWN.',
    },
    transactionId: {
      type: Type.STRING,
      nullable: true,
      description:
        'Transaction ID, invoice number, order number, reference number, or receipt ID if provided in the email. Return null if not present.',
    },
  },
  required: [
    'serviceName',
    'planName',
    'amount',
    'currency',
    'paymentDate',
    'paymentStatus',
    'renewalDate',
    'expiryDate',
    'billingCycle',
    'transactionId',
  ],
};

const SYSTEM_INSTRUCTION = `You are an expert financial and SaaS subscription email parser.
Your task is to analyze the email text and extract structured subscription and payment details strictly according to the provided schema.

Strict Extraction Rules:
1. If any piece of information is missing, ambiguous, or unavailable, return null for that field.
2. NEVER invent, hallucinate, or estimate dates. If a date is not explicitly mentioned, return null.
3. NEVER invent amounts. If no price is mentioned, return null.
4. NEVER assume a renewal date that is not clearly written in the text.
5. Normalize all extracted dates to YYYY-MM-DD format (e.g. "September 25, 2026" -> "2026-09-25").
6. Normalize currency to standard 3-letter ISO code:
   - ₹ or Rs / INR -> "INR"
   - $ or USD -> "USD"
   - € or EUR -> "EUR"
   - £ or GBP -> "GBP"
7. Normalize paymentStatus strictly into: PAID, PENDING, FAILED, REFUNDED, UNKNOWN.
8. Normalize billingCycle strictly into: MONTHLY, YEARLY, WEEKLY, QUARTERLY, ONE_TIME, UNKNOWN.`;

// Priority list of models to try.
// If the primary model experiences transient capacity (503) or 404, we failover gracefully.
const CANDIDATE_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

/**
 * Lazily initialize and return the GoogleGenAI instance using GEMINI_API_KEY from environment.
 */
let aiInstance = null;
function getGenAIClient() {
  if (!process.env.GEMINI_API_KEY) {
    const path = require('path');
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY' || apiKey.trim() === '') {
    throw new Error(
      'Missing or invalid GEMINI_API_KEY in environment variables. Please update server/.env with a valid key.'
    );
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

/**
 * Validates and normalizes date string to YYYY-MM-DD. Returns null if invalid.
 */
function normalizeDate(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return trimmed;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

/**
 * Validates and normalizes parsed data to ensure strict compliance with project schema.
 */
function normalizeExtractedData(data) {
  const validStatuses = ['PAID', 'PENDING', 'FAILED', 'REFUNDED', 'UNKNOWN'];
  const validCycles = ['MONTHLY', 'YEARLY', 'WEEKLY', 'QUARTERLY', 'ONE_TIME', 'UNKNOWN'];

  const normalizedStatus =
    data.paymentStatus && validStatuses.includes(String(data.paymentStatus).toUpperCase())
      ? String(data.paymentStatus).toUpperCase()
      : 'UNKNOWN';

  const normalizedCycle =
    data.billingCycle && validCycles.includes(String(data.billingCycle).toUpperCase())
      ? String(data.billingCycle).toUpperCase()
      : 'UNKNOWN';

  let normalizedAmount = null;
  if (data.amount !== null && data.amount !== undefined) {
    const num = Number(data.amount);
    if (!isNaN(num) && num >= 0) {
      normalizedAmount = Math.round(num * 100) / 100;
    }
  }

  let normalizedCurrency = null;
  if (data.currency && typeof data.currency === 'string') {
    const cur = data.currency.trim().toUpperCase();
    if (cur.length === 3) {
      normalizedCurrency = cur;
    } else if (cur === '₹' || cur === 'RS') {
      normalizedCurrency = 'INR';
    } else if (cur === '$') {
      normalizedCurrency = 'USD';
    } else if (cur === '€') {
      normalizedCurrency = 'EUR';
    } else if (cur === '£') {
      normalizedCurrency = 'GBP';
    }
  }

  return {
    serviceName: data.serviceName ? String(data.serviceName).trim() : null,
    planName: data.planName ? String(data.planName).trim() : null,
    amount: normalizedAmount,
    currency: normalizedCurrency,
    paymentDate: normalizeDate(data.paymentDate),
    paymentStatus: normalizedStatus,
    renewalDate: normalizeDate(data.renewalDate),
    expiryDate: normalizeDate(data.expiryDate),
    billingCycle: normalizedCycle,
    transactionId: data.transactionId ? String(data.transactionId).trim() : null,
  };
}

/**
 * Analyzes payment or subscription email content using Gemini AI.
 * Returns structured JSON with serviceName, planName, amount, currency,
 * paymentDate, paymentStatus, renewalDate, expiryDate, billingCycle, transactionId.
 *
 * @param {string} emailText - Full text of the email (subject + body)
 * @returns {Promise<Object>} Structured payment and subscription details
 */
async function analyzePaymentEmail(emailText) {
  if (!emailText || typeof emailText !== 'string' || !emailText.trim()) {
    throw new Error('Email text is required for analysis.');
  }

  const ai = getGenAIClient();
  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `Analyze the following email content and extract all relevant payment and SaaS subscription details:\n\n${emailText}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: paymentExtractionSchema,
          temperature: 0.1, // Low temperature for maximum factual consistency
        },
      });

      if (!response || !response.text) {
        throw new Error(`Empty response received from Gemini model ${modelName}`);
      }

      let parsedJson;
      try {
        parsedJson = JSON.parse(response.text);
      } catch (jsonErr) {
        // Fallback: match first json block if surrounding text was included
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedJson = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(`Failed to parse Gemini response as JSON: ${response.text}`);
        }
      }

      return normalizeExtractedData(parsedJson);
    } catch (err) {
      lastError = err;
      const errMsg = err.message || String(err);
      const isTransientOrUnavailable =
        err.status === 503 ||
        err.status === 404 ||
        errMsg.includes('503') ||
        errMsg.includes('404') ||
        errMsg.includes('high demand') ||
        errMsg.includes('not found') ||
        errMsg.includes('no longer available');

      if (isTransientOrUnavailable) {
        console.warn(`[GeminiService] Model ${modelName} unavailable (${errMsg}). Trying next candidate model...`);
        continue;
      }

      // For unrecoverable errors (e.g. invalid API key), rethrow immediately
      throw err;
    }
  }

  throw new Error(`Gemini payment analysis failed across all candidate models: ${lastError?.message || lastError}`);
}

module.exports = {
  analyzePaymentEmail,
  getGenAIClient,
  paymentExtractionSchema,
};
