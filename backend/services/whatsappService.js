const axios = require('axios');

const AUTO_REPLY_TEXT = 'Olá! Como posso ajudar?';

const normalizeRecipientPhone = (phone) => {
  const digits = String(phone).replace(/\D/g, '');

  // Brasil: webhook às vezes manda 55 + DDD + 8 dígitos (sem o 9 do celular).
  // A Meta exige o formato com 9 para enviar (ex.: 5511888888888 → 5511999888888).
  if (/^55\d{2}\d{8}$/.test(digits)) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }

  return digits;
};

const isBotAllowedSender = (phone) => {
  const raw = process.env.WHATSAPP_BOT_ALLOWED_NUMBERS?.trim();

  if (!raw) {
    return true;
  }

  const canonical = normalizeRecipientPhone(phone);
  const allowed = raw
    .split(',')
    .map((entry) => normalizeRecipientPhone(entry.trim()))
    .filter(Boolean);

  return allowed.includes(canonical);
};

async function sendMessage(to, text) {
  const recipient = normalizeRecipientPhone(to);
  const url =
    `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: {
        body: text
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

async function sendImage(to, imageUrl, caption = '') {
  const recipient = normalizeRecipientPhone(to);
  const url =
    `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const imagePayload = {
    link: imageUrl
  };

  if (caption?.trim()) {
    imagePayload.caption = caption.trim().slice(0, 1024);
  }

  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'image',
      image: imagePayload
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

async function sendAutoReply(to) {
  return sendMessage(to, AUTO_REPLY_TEXT);
}

module.exports = {
  sendMessage,
  sendImage,
  sendAutoReply,
  normalizeRecipientPhone,
  isBotAllowedSender,
  AUTO_REPLY_TEXT
};
