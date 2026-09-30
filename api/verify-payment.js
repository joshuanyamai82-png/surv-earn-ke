// api/verify-payment.js
import { MEGAPAY_CONFIG } from './megapay-config';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    const payload = {
      api_key: MEGAPAY_CONFIG.apiKey,
      email: MEGAPAY_CONFIG.email,
      transaction_request_id: reference
    };

    const response = await fetch(`${MEGAPAY_CONFIG.baseUrl}/backend/v1/transactionstatus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    // 🔍 Log the full response to see what MegaPay returns
    console.log('MegaPay verification response:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Payment verification failed');
    }

    // --- Determine status ---
    // MegaPay's /transactionstatus response uses "TransactionStatus" (e.g. "Completed",
    // "Pending", "Failed", "Cancelled"), with "TransactionCode" as a numeric backup
    // ("0" = success). It does NOT use status / result_code / state / Status, which is
    // why every poll used to fall through to UNKNOWN and the frontend never advanced
    // past "waiting for confirmation".
    let status = result.TransactionStatus || result.status || result.Status || result.state || '';

    // Some responses (e.g. cancelled at the STK prompt) omit TransactionStatus entirely
    // and only carry ResponseCode/ResponseDescription instead. Handle that shape too.
    if (!status && result.ResponseCode !== undefined) {
      status = Number(result.ResponseCode) === 0 ? 'COMPLETED' : 'FAILED';
    }

    // Fall back to the numeric TransactionCode ("0" = success) if we still have nothing.
    if (!status && result.TransactionCode !== undefined) {
      const numericMap = { '0': 'COMPLETED' };
      status = numericMap[String(result.TransactionCode)] || 'PENDING';
    }

    // Normalize status string to uppercase for mapping
    const statusUpper = typeof status === 'string' ? status.toUpperCase() : '';

    // Map status to our internal statuses
    const statusMap = {
      'COMPLETED': 'COMPLETED',
      'SUCCESS': 'COMPLETED',
      'PAID': 'COMPLETED',
      'PENDING': 'PENDING',
      'FAILED': 'FAILED',
      'CANCELLED': 'CANCELLED',
      'CANCELED': 'CANCELLED',
      '0': 'COMPLETED',   // if returned as string
      '1': 'PENDING',
      '2': 'FAILED',
      '3': 'CANCELLED'
    };

    const mappedStatus = statusMap[statusUpper] || statusUpper || 'UNKNOWN';

    // If status is still unknown, log the raw data for debugging
    if (mappedStatus === 'UNKNOWN') {
      console.warn('Unknown status received from MegaPay:', result);
    }

    res.status(200).json({
      success: true,
      status: mappedStatus,
      data: result,
      // Also return raw status for frontend if needed
      raw_status: status
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      success: false
    });
  }
}