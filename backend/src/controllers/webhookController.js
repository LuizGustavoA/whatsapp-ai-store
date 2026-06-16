const crypto = require('crypto');
const paymentService = require('../services/paymentService');

const verifyMetaSignature = (req) => {
  const secret = process.env.WHATSAPP_APP_SECRET;

  if (!secret) {
    return true;
  }

  const signature = req.headers['x-hub-signature-256'];

  if (!signature || !req.rawBody) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

const mercadoPagoWebhook = async (req, res, next) => {
  try {
    const result = await paymentService.handleMercadoPagoWebhook(req.body);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  verifyMetaSignature,
  mercadoPagoWebhook
};
