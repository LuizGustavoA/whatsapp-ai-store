const axios = require('axios');
const Order = require('../models/Order');

const formatAmount = (value) => Number(value).toFixed(2);

const crc16 = (payload) => {
  let crc = 0xffff;

  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;

    for (let j = 0; j < 8; j += 1) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const tlv = (id, value) => {
  const length = String(value.length).padStart(2, '0');
  return `${id}${length}${value}`;
};

const buildStaticPixPayload = ({ pixKey, merchantName, merchantCity, amount, txid }) => {
  const merchantAccount = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', pixKey);
  const additionalData = tlv('05', txid.slice(0, 25));

  const payloadWithoutCrc = [
    tlv('00', '01'),
    tlv('01', '12'),
    tlv('26', merchantAccount),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', formatAmount(amount)),
    tlv('58', 'BR'),
    tlv('59', merchantName.slice(0, 25)),
    tlv('60', merchantCity.slice(0, 15)),
    tlv('62', additionalData),
    '6304'
  ].join('');

  return `${payloadWithoutCrc}${crc16(payloadWithoutCrc)}`;
};

const generateMercadoPagoPix = async (order) => {
  const response = await axios.post(
    'https://api.mercadopago.com/v1/payments',
    {
      transaction_amount: Number(order.total_amount),
      description: `Pedido #${order.id} - WhatsApp AI Store`,
      payment_method_id: 'pix',
      payer: {
        email: process.env.MERCADO_PAGO_PAYER_EMAIL || 'cliente@whatsapp-ai-store.com'
      },
      external_reference: String(order.id)
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `order-${order.id}-${Date.now()}`
      }
    }
  );

  const pixCode =
    response.data?.point_of_interaction?.transaction_data?.qr_code ||
    response.data?.point_of_interaction?.transaction_data?.qr_code_base64;

  if (!pixCode) {
    throw new Error('Mercado Pago não retornou código PIX.');
  }

  return {
    pixCode,
    paymentId: response.data?.id ? String(response.data.id) : null
  };
};

const generateStaticPix = (order) => {
  const pixKey = process.env.PIX_KEY;
  const merchantName = process.env.PIX_MERCHANT_NAME || 'WhatsApp AI Store';
  const merchantCity = process.env.PIX_MERCHANT_CITY || 'SAO PAULO';

  if (!pixKey) {
    throw new Error('PIX_KEY não configurada para gerar pagamento estático.');
  }

  return buildStaticPixPayload({
    pixKey,
    merchantName,
    merchantCity,
    amount: order.total_amount,
    txid: `PED${order.id}`
  });
};

const buildPixMessage = (order, pixCode) =>
  [
    `💳 Pagamento PIX — Pedido #${order.id}`,
    `Valor: R$ ${formatAmount(order.total_amount)}`,
    '',
    'Copie e cole o código abaixo no app do seu banco:',
    '',
    pixCode,
    '',
    'Após o pagamento, envie "paguei" para confirmarmos seu pedido.'
  ].join('\n');

const generatePixForOrder = async (order) => {
  let pixCode;
  let mercadoPagoPaymentId = null;

  if (process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    try {
      const mpResult = await generateMercadoPagoPix(order);
      pixCode = mpResult.pixCode;
      mercadoPagoPaymentId = mpResult.paymentId;
    } catch (error) {
      console.warn('Mercado Pago indisponível, usando PIX estático:', error.message);
      pixCode = generateStaticPix(order);
    }
  } else {
    pixCode = generateStaticPix(order);
  }

  await Order.setPixCode(order.id, pixCode);

  if (mercadoPagoPaymentId) {
    await Order.setMercadoPagoPaymentId(order.id, mercadoPagoPaymentId);
  }

  return {
    pixCode,
    message: buildPixMessage(order, pixCode),
    mercadoPagoPaymentId
  };
};

const findOrderByMercadoPagoPaymentId = async (paymentId) =>
  Order.findByMercadoPagoPaymentId(paymentId);

const findOrderByExternalReference = async (orderId) => Order.findById(orderId);

const handleMercadoPagoWebhook = async (payload) => {
  const paymentId = payload?.data?.id || payload?.id;

  if (!paymentId || !process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    return { handled: false };
  }

  const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`
    }
  });

  const payment = response.data;

  if (payment.status !== 'approved') {
    return { handled: true, status: payment.status };
  }

  let order =
    (await findOrderByMercadoPagoPaymentId(paymentId)) ||
    (payment.external_reference
      ? await findOrderByExternalReference(payment.external_reference)
      : null);

  if (!order || order.status !== 'pending') {
    return { handled: true, status: 'already_processed' };
  }

  const kitchenService = require('./kitchenService');
  const result = await kitchenService.confirmPayment(order.conversation_id);

  return { handled: true, status: 'approved', order: result.order };
};

module.exports = {
  generatePixForOrder,
  buildPixMessage,
  buildStaticPixPayload,
  handleMercadoPagoWebhook
};
