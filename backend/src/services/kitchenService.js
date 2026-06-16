const Order = require('../models/Order');
const Conversation = require('../../models/Conversation');
const whatsappService = require('../../services/whatsappService');
const cashbackService = require('./cashbackService');
const deliveryService = require('./deliveryService');
const n8nService = require('./n8nService');

const ALLOWED_TRANSITIONS = {
  pending: ['paid'],
  paid: ['preparing'],
  preparing: ['ready'],
  ready: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: []
};

const STATUS_NOTIFICATIONS = {
  paid: (orderId) =>
    `✅ Pagamento do pedido #${orderId} confirmado! Em breve começaremos o preparo.`,
  preparing: (orderId) =>
    `👨‍🍳 Seu pedido #${orderId} está sendo preparado!`,
  ready: (orderId) =>
    `📦 Pedido #${orderId} pronto! Aguardando entrega.`,
  delivered: (orderId) =>
    `✅ Pedido #${orderId} finalizado. Obrigado!`
};

const validateTransition = (currentStatus, nextStatus) => {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    throw new Error(
      `Transição inválida: "${currentStatus}" → "${nextStatus}". Permitido: ${allowed.join(', ') || 'nenhum'}.`
    );
  }
};

const notifyCustomer = async (order, message) => {
  const conversation = await Conversation.findById(order.conversation_id);

  if (!conversation?.phone_number) {
    return null;
  }

  return whatsappService.sendMessage(conversation.phone_number, message);
};

const listKitchenOrders = async (statuses) => {
  const defaultStatuses = ['paid', 'preparing', 'ready'];
  const filter = statuses?.length ? statuses : defaultStatuses;

  return Order.findKitchenOrders(filter);
};

const updateOrderStatus = async (orderId, nextStatus, options = {}) => {
  const order = await Order.findById(orderId);

  if (!order) {
    throw new Error('Pedido não encontrado.');
  }

  validateTransition(order.status, nextStatus);

  if (nextStatus === 'out_for_delivery') {
    if (!options.courierName) {
      throw new Error('courier_name é obrigatório para status out_for_delivery.');
    }

    if (order.status !== 'ready') {
      throw new Error('Pedido precisa estar "ready" antes de sair para entrega.');
    }

    return deliveryService.assignDelivery({
      orderId,
      courierName: options.courierName
    });
  }

  const updatedOrder = await Order.updateStatus(orderId, nextStatus);
  const conversation = await Conversation.findById(order.conversation_id);

  let notificationMessage = null;

  if (nextStatus === 'paid' && conversation?.phone_number) {
    const cashback = await cashbackService.accrueForPaidOrder(
      conversation.phone_number,
      updatedOrder.total_amount
    );

    if (cashback) {
      notificationMessage = `${STATUS_NOTIFICATIONS.paid(orderId)}\n\n🎁 Você ganhou R$ ${cashback.cashbackAmount.toFixed(2)} de cashback! Saldo: R$ ${cashback.newBalance.toFixed(2)}`;
    } else if (STATUS_NOTIFICATIONS[nextStatus]) {
      notificationMessage = STATUS_NOTIFICATIONS[nextStatus](orderId);
    }
  } else if (STATUS_NOTIFICATIONS[nextStatus]) {
    notificationMessage = STATUS_NOTIFICATIONS[nextStatus](orderId);
  }

  if (notificationMessage && !options.skipCustomerNotification) {
    await notifyCustomer(updatedOrder, notificationMessage);
  }

  if (nextStatus === 'paid') {
    n8nService.triggerN8nWebhook('order.paid', {
      orderId: updatedOrder.id,
      conversationId: updatedOrder.conversation_id,
      phoneNumber: conversation?.phone_number || null,
      totalAmount: Number(updatedOrder.total_amount),
      status: updatedOrder.status
    }).catch(() => {});
  }

  return { order: updatedOrder, notificationMessage };
};

const confirmPayment = async (conversationId, options = {}) => {
  const order = await Order.findLastPendingByConversationId(conversationId);

  if (!order) {
    throw new Error('Nenhum pedido pendente encontrado para esta conversa.');
  }

  return updateOrderStatus(order.id, 'paid', options);
};

module.exports = {
  listKitchenOrders,
  updateOrderStatus,
  confirmPayment,
  ALLOWED_TRANSITIONS
};
