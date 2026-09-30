// api/initiate-payment.js
import { MEGAPAY_CONFIG } from './megapay-config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone_number, amount, loan_amount } = req.body;

    if (!phone_number || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Convert phone from 2547XXXXXXXX to 07XXXXXXXX format
    // because MegaPay sample uses 0712345678
    let msisdn = phone_number;
    if (msisdn.startsWith('254')) {
      msisdn = '0' + msisdn.substring(3);
    }
    // If it already starts with 0, keep it; otherwise assume it's valid

    // Generate a unique reference
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    const reference = `TYN-${timestamp}-${randomStr}`;

    // Build payload exactly as in MegaPay sample
    const payload = {
      api_key: MEGAPAY_CONFIG.apiKey,
      email: MEGAPAY_CONFIG.email,
      amount: parseInt(amount),    // fee amount
      msisdn: msisdn,              // e.g., 0712345678
      reference: reference
    };

    const response = await fetch(`${MEGAPAY_CONFIG.baseUrl}/backend/v1/initiatestk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Payment initiation failed');
    }

    // MegaPay's success shape is { success: "200", transaction_request_id, massage }.
    // But it can also return HTTP 200 with an ERROR shape instead
    // ({ ResponseCode, ResponseDescription, ... } with no transaction_request_id) —
    // e.g. insufficient balance, invalid initiator, etc. Without this check that used
    // to slip through as "success" with reference: undefined, which broke polling
    // immediately since verify-payment had nothing valid to check.
    if (!result.transaction_request_id) {
      throw new Error(result.ResponseDescription || result.massage || result.message || 'Payment initiation failed');
    }

    // MegaPay returns a transaction_request_id – we use that for verification
    // We also keep external_reference for our own tracking
    res.status(200).json({
      success: true,
      reference: result.transaction_request_id,   // this is what frontend will use
      external_reference: reference,
      raw: result
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      success: false
    });
  }
}