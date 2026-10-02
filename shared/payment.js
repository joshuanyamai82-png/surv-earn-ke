// shared/payment.js — PayHero STK helpers
import { API_ENDPOINTS } from './config.js';

/* ---------------------------------------------------------------
   Phone normalization (delegates to /api/normalize-phone, which
   returns 2547XXXXXXXX format — the format PayHero expects).
   --------------------------------------------------------------- */
export async function normalizePhoneNumber(phone) {
  try {
    const r = await fetch(API_ENDPOINTS.normalizePhone, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!r.ok) throw new Error();
    const d = await r.json();
    return d.normalized_phone || phone;
  } catch {
    return phone;
  }
}

/* ---------------------------------------------------------------
   Initiate STK push.
   API returns: { success: true, reference, external_reference }
   --------------------------------------------------------------- */
export async function initiatePayment(phoneNumber, amount, description) {
  const r = await fetch(API_ENDPOINTS.initiatePayment, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, amount, description }),
  });
  if (!r.ok) {
    let msg = 'Payment initiation failed';
    try {
      const e = await r.json();
      msg = e.error || e.message || msg;
    } catch {}
    throw new Error(msg);
  }
  const data = await r.json();

  // PayHero returns `reference` directly. The frontend consumes `.reference`
  // everywhere, so we just surface the raw field. If PayHero ever omits it,
  // we still fall back to `external_reference` so polling can proceed.
  return {
    ...data,
    reference: data.reference || data.external_reference,
  };
}

/* ---------------------------------------------------------------
   Verify a transaction.
   API returns: { success: true, status, data }
   `status` is PayHero's raw status string, e.g. "Success", "Failed",
   "Pending", "Queued", "Sent".
   --------------------------------------------------------------- */
export async function verifyPayment(reference) {
  const r = await fetch(
    `${API_ENDPOINTS.verifyPayment}?reference=${encodeURIComponent(reference)}`
  );
  if (!r.ok) throw new Error('Verification failed');
  return r.json();
}

/* ---------------------------------------------------------------
   Normalize any provider status string to one of our canonical
   values: COMPLETED | FAILED | CANCELLED | PENDING
   Handles PayHero's mixed-case vocabulary + MegaPay-era strings.
   --------------------------------------------------------------- */
export function normalizeStatus(raw) {
  const s = String(raw || '').trim().toUpperCase();
  const map = {
    // Success family
    'SUCCESS':     'COMPLETED',
    'COMPLETED':   'COMPLETED',
    'COMPLETE':    'COMPLETED',
    'PAID':        'COMPLETED',
    'OK':          'COMPLETED',
    // Failure family
    'FAILED':      'FAILED',
    'FAILURE':     'FAILED',
    'DECLINED':    'FAILED',
    'ERROR':       'FAILED',
    'REJECTED':    'FAILED',
    // Cancellation family
    'CANCELLED':   'CANCELLED',
    'CANCELED':    'CANCELLED',
    // Pending family (anything else → pending)
    'PENDING':     'PENDING',
    'QUEUED':      'PENDING',
    'SENT':        'PENDING',
    'PROCESSING':  'PENDING',
    'INITIATED':   'PENDING',
    'IN_PROGRESS': 'PENDING',
  };
  return map[s] || 'PENDING';
}

/* ---------------------------------------------------------------
   Poll /api/verify-payment until terminal status or timeout.
   Resolves: { success: true, data }  or  { success: false, error }
   --------------------------------------------------------------- */
export function pollPaymentStatus(reference, maxAttempts = 15, interval = 4000) {
  return new Promise((resolve) => {
    let attempts = 0;

    const tick = async () => {
      attempts++;
      try {
        const result = await verifyPayment(reference);
        const raw =
          result.status ||
          (result.data && result.data.status) ||
          (result.data && result.data.transaction_status);
        const status = normalizeStatus(raw);

        if (status === 'COMPLETED') {
          resolve({ success: true, data: result });
        } else if (status === 'FAILED' || status === 'CANCELLED') {
          resolve({ success: false, error: `Payment ${status.toLowerCase()}` });
        } else if (attempts >= maxAttempts) {
          resolve({ success: false, error: 'Payment timeout' });
        } else {
          setTimeout(tick, interval);
        }
      } catch {
        if (attempts >= maxAttempts) {
          resolve({ success: false, error: 'Unable to verify' });
        } else {
          setTimeout(tick, interval);
        }
      }
    };

    tick();
  });
}

/* ---------------------------------------------------------------
   Extract amount from a pasted M-Pesa confirmation SMS (used by
   the manual fallback flow). Unchanged.
   --------------------------------------------------------------- */
export function extractAmountFromMpesaMessage(msg) {
  if (!msg) return null;
  const m = msg.match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const amt = parseFloat(m[1]);
  return isNaN(amt) ? null : amt;
}