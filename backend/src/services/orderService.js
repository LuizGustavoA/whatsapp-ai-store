const Product = require('../models/Product');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Conversation = require('../../models/Conversation');
const Customer = require('../models/Customer');
const cashbackService = require('./cashbackService');
const chatOrderService = require('./chatOrderService');
const n8nService = require('./n8nService');

const checkoutLocks = new Map();

const acquireCheckoutLock = async (conversationId) => {
  while (checkoutLocks.has(conversationId)) {
    await checkoutLocks.get(conversationId);
  }

  let release = () => {};

  const waitPromise = new Promise((resolve) => {
    release = resolve;
  });

  checkoutLocks.set(conversationId, waitPromise);

  return () => {
    checkoutLocks.delete(conversationId);
    release();
  };
};

const formatOrderLabel = (order) =>
  order.daily_order_number != null ? `#${order.daily_order_number}` : `#${order.id}`;

const formatCurrency = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const buildOrderSummary = (order, items) => {
  const lines = items.map((item) => {
    const name =
      item.product_name || item.productName || `Produto #${item.product_id || item.productId}`;
    const quantity = item.quantity;
    const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0);

    return `• ${quantity}x ${name} — ${formatCurrency(unitPrice * quantity)}`;
  });

  const orderLabel =
    order.daily_order_number != null ? `#${order.daily_order_number}` : `#${order.id}`;

  const summary = [`Pedido ${orderLabel} registrado com sucesso!`, '', ...lines];

  if (Number(order.discount_amount) > 0) {
    summary.push(
      '',
      `Subtotal: ${formatCurrency(order.subtotal_amount)}`,
      `Desconto cashback: -${formatCurrency(order.cashback_used)}`
    );
  }

  summary.push('', `Total: ${formatCurrency(order.total_amount)}`);

  return summary.join('\n');
};

const createOrderFromCheckout = async (conversationId, orderItems, options = {}) => {
  const { useCashback = false, deliveryAddress = null, customerName = null } = options;

  if (!orderItems?.length) {
    throw new Error('Nenhum item informado para o pedido.');
  }

  const releaseLock = await acquireCheckoutLock(conversationId);

  try {
    const activeOrder = await chatOrderService.findActiveOrderForConversation(conversationId);

    if (activeOrder) {
      const statusLabel =
        chatOrderService.STATUS_LABELS[activeOrder.status] || activeOrder.status;

      throw new Error(
        `Você já tem o pedido ${formatOrderLabel(activeOrder)} em andamento (${statusLabel}).`
      );
    }

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new Error('Conversa não encontrada.');
  }

  const productIds = [...new Set(orderItems.map((item) => item.productId))];
  const products = await Product.findActiveByIds(productIds);
  const productMap = new Map(products.map((product) => [product.id, product]));

  const normalizedItems = [];
  let subtotalAmount = 0;

  for (const item of orderItems) {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new Error(`Produto ID ${item.productId} não encontrado ou inativo.`);
    }

    const unitPrice = Product.getEffectivePrice(product);
    const lineTotal = unitPrice * item.quantity;
    subtotalAmount += lineTotal;

    normalizedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice
    });
  }

  const pricing = await cashbackService.applyCashbackDiscount(
    conversation.phone_number,
    subtotalAmount,
    useCashback
  );

  const customer = await Customer.findByPhoneNumber(conversation.phone_number);
  const displayName = customerName?.trim() || customer?.name?.trim() || null;

  if (!displayName) {
    throw new Error('Nome do cliente é obrigatório para fechar o pedido.');
  }

  if (!customer?.name?.trim() && displayName) {
    await Customer.updateProfile(conversation.phone_number, { name: displayName });
  }

  const order = await Order.create({
    conversationId,
    subtotalAmount,
    discountAmount: pricing.discountAmount,
    cashbackUsed: pricing.cashbackUsed,
    totalAmount: pricing.totalAmount,
    status: 'pending',
    deliveryAddress,
    displayName
  });

  const items = await OrderItem.createMany(order.id, normalizedItems);
  const itemsForSummary = normalizedItems.map((item) => ({
    product_id: item.productId,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice
  }));

  if (deliveryAddress) {
    await Conversation.updateDeliveryAddress(conversationId, deliveryAddress);
  }

  await Conversation.updateStatus(conversationId, 'awaiting_payment');

  n8nService.triggerN8nWebhook('order.created', {
    orderId: order.id,
    conversationId,
    phoneNumber: conversation.phone_number,
    totalAmount: Number(order.total_amount),
    status: order.status,
    items: normalizedItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    }))
  }).catch(() => {});

  return {
    order,
    items,
    summary: buildOrderSummary(order, itemsForSummary),
    cashbackApplied: pricing.cashbackUsed
  };
  } finally {
    releaseLock();
  }
};

module.exports = {
  createOrderFromCheckout,
  buildOrderSummary
};
