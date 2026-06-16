const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const token = process.env.WHATSAPP_TOKEN;

const webhookPhone = process.argv[2] || '5511999999999';

const withMobileNine = (phone) => {
  const digits = String(phone).replace(/\D/g, '');

  if (/^55\d{10}$/.test(digits)) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }

  return digits;
};

const sendTest = async (to) => {
  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: 'Teste de envio — se recebeu, a API está OK.' }
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log(`✅ ${to} → enviado (id: ${data.messages?.[0]?.id})`);
    return true;
  } catch (error) {
    const meta = error.response?.data?.error;
    console.log(`❌ ${to} → ${meta?.code} ${meta?.message}`);
    return false;
  }
};

const run = async () => {
  console.log('Teste de envio WhatsApp\n');
  console.log('Número que chega no webhook:', webhookPhone);

  const alternate = withMobileNine(webhookPhone);

  if (alternate !== webhookPhone) {
    console.log('Variação com 9 móvel:', alternate);
  }

  const candidates = [...new Set([webhookPhone, alternate])];

  for (const number of candidates) {
    await sendTest(number);
  }

  console.log('\nSe ambos deram #131030:');
  console.log('1. Meta → WhatsApp → Configuração da API → adicione AMBOS os formatos na lista de teste');
  console.log('2. Confirme que o token do .env é do MESMO app onde você verificou o número');
  console.log('3. App em modo Desenvolvimento só envia para números da lista de teste');
};

run();
