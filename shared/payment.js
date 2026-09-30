// shared/payment.js — MegaPay STK helpers (backend already wired)
import { API_ENDPOINTS } from './config.js';

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
  } catch { return phone; }
}

export async function initiatePayment(phoneNumber, amount, description) {
  const r = await fetch(API_ENDPOINTS.initiatePayment, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, amount, description }),
  });
  if (!r.ok) {
    let msg = 'Payment initiation failed';
    try { const e = await r.json(); msg = e.error || e.message || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export async function verifyPayment(reference) {
  const r = await fetch(`${API_ENDPOINTS.verifyPayment}?reference=${encodeURIComponent(reference)}`);
  if (!r.ok) throw new Error('Verification failed');
  return r.json();
}

export function pollPaymentStatus(reference, maxAttempts = 10, interval = 4000) {
  return new Promise(resolve => {
    let attempts = 0;
    const tick = async () => {
      attempts++;
      try {
        const result = await verifyPayment(reference);
        const status = result.status || (result.data && result.data.status);
        if (status === 'SUCCESS' || status === 'COMPLETED') {
          resolve({ success: true, data: result });
        } else if (['FAILED', 'CANCELLED', 'TIMEOUT'].includes(status)) {
          resolve({ success: false, error: `Payment ${status.toLowerCase()}` });
        } else if (attempts >= maxAttempts) {
          resolve({ success: false, error: 'Payment timeout' });
        } else {
          setTimeout(tick, interval);
        }
      } catch {
        if (attempts >= maxAttempts) resolve({ success: false, error: 'Unable to verify' });
        else setTimeout(tick, interval);
      }
    };
    tick();
  });
}

export function extractAmountFromMpesaMessage(msg) {
  if (!msg) return null;
  const m = msg.match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const amt = parseFloat(m[1]);
  return isNaN(amt) ? null : amt;
}