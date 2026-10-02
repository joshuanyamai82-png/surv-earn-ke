export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    function normalizePhoneNumber(phone) {
      // Remove any spaces, dashes, or special characters
      phone = phone.replace(/[\s\-\(\)]/g, '');
      
      // Remove leading + if present
      if (phone.startsWith('+')) {
        phone = phone.substring(1);
      }
      
      // Convert 07... to 2547...
      if (phone.startsWith('07')) {
        phone = '254' + phone.substring(1);
      }
      // Convert 01... to 2541...
      else if (phone.startsWith('01')) {
        phone = '254' + phone.substring(1);
      }
      // If it starts with 7 (without 0), add 254
      else if (phone.startsWith('7') && phone.length === 9) {
        phone = '254' + phone;
      }
      // If it starts with 1 (without 0), add 254
      else if (phone.startsWith('1') && phone.length === 9) {
        phone = '254' + phone;
      }
      // If it already starts with 254, keep it
      else if (!phone.startsWith('254')) {
        return null;
      }
      
      // Validate final format (should be 254XXXXXXXXX, 12 digits total)
      if (phone.length !== 12 || !phone.startsWith('254')) {
        return null;
      }
      
      return phone;
    }

    const normalizedPhone = normalizePhoneNumber(phone);

    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    res.status(200).json({
      success: true,
      normalized_phone: normalizedPhone
    });

  } catch (error) {
    console.error('Phone normalization error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      success: false
    });
  }
}