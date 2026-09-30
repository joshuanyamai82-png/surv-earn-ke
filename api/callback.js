// api/callback.js
import { MEGAPAY_CONFIG } from './megapay-config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('MegaPay callback received:', payload);

    // Optional: verify signature if MegaPay provides one

    // TODO: Update your database, send confirmation, etc.

    res.status(200).json({ success: true, message: 'Callback received' });
  } catch (error) {
    console.error('Callback error:', error);
    // Still return 200 to prevent MegaPay from retrying
    res.status(200).json({ success: false, error: error.message });
  }
}