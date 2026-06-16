const http = require('http');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '000000000000000';
const testPhone = process.argv[2] || '5511999999999';

const payload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: phoneNumberId },
            messages: [
              {
                from: testPhone,
                id: `wamid.test.${Date.now()}`,
                timestamp: `${Math.floor(Date.now() / 1000)}`,
                type: 'text',
                text: { body: 'oi teste webhook' }
              }
            ]
          },
          field: 'messages'
        }
      ]
    }
  ]
});

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  },
  (res) => {
    let body = '';

    res.on('data', (chunk) => {
      body += chunk;
    });

    res.on('end', () => {
      console.log('HTTP', res.statusCode);
      console.log('Body', body || '(empty)');
    });
  }
);

req.on('error', (error) => {
  console.error('Request error:', error.message);
});

req.write(payload);
req.end();
