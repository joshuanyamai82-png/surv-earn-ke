export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone_number, amount, loan_amount } = req.body;

    // Validate input
    if (!phone_number || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const PAYHERO_CONFIG = {
      apiUrl: 'https://backend.payhero.co.ke/api/v2/payments',
      basicAuthToken: 'Basic b1ZicjQ2bE5oZ1IyVEV6a3JybHU6N3BjdTlpanJpZVVSOWYzMUxBcUFjQnlUUHlQaWtyYnRiNHZ2QklnWg==',
      channelId: 4776,
      provider: 'm-pesa',
      callbackUrl: 'https://samttech.co.ke/callback'
    };

    // Generate a unique reference without loan information
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const payload = {
      amount: parseInt(amount),
      phone_number: phone_number,
      channel_id: PAYHERO_CONFIG.channelId,
      provider: PAYHERO_CONFIG.provider,
      external_reference: `TYN-${timestamp}-${randomStr}`, 
      callback_url: PAYHERO_CONFIG.callbackUrl
    };

    const response = await fetch(PAYHERO_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': PAYHERO_CONFIG.basicAuthToken
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Payment initiation failed');
    }

    
    
    res.status(200).json({
      success: true,
      reference: result.reference,
      external_reference: result.external_reference
      
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}