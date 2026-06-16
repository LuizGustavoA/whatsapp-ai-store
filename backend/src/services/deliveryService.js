const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Conversation = require('../../models/Conversation');
const whatsappService = require('../../services/whatsappService');

const STATUS_MESSAGES = {
  assigned: (orderId, courierName) =>
    `🛵 Seu pedido #${orderId} saiu para entrega!\nEntregador: ${courierName}`,
  in_transit: (orderId, courierName) =>
    `📍 Pedido #${orderId} a caminho!\nEntregador: ${courierName}`,
  delivered: (orderId) =>
    `✅ Pedido #${orderId} entregue! Obrigado pela preferência.`
};

const notifyCustomer = async (order, message) => {
  const conversation = await Conversation.findById(order.conversation_id);

  if (!conversation?.phone_number) {
    return null;
  }

  return whatsappService.sendMessage(conversation.phone_number, message);
};

const assignDelivery = async ({ orderId, courierName }) => {
  const order = await Order.findById(orderId);

  if (!order) {
    throw new Error('Pedido não encontrado.');
  }

  if (order.status !== 'ready') {
    throw new Error('Pedido precisa estar com status "ready" para atribuir entrega.');
  }

  const existing = await Delivery.findByOrderId(orderId);

  if (existing && existing.status !== 'delivered') {
    throw new Error('Este pedido já possui uma entrega em andamento.');
  }

  const delivery = await Delivery.create({
    orderId,
    courierName,
    status: 'assigned'
  });

  const updatedOrder = await Order.updateStatus(orderId, 'out_for_delivery');
  const message = STATUS_MESSAGES.assigned(orderId, courierName);
  await notifyCustomer(updatedOrder, message);

  return { delivery, order: updatedOrder };
};

const updateDeliveryStatus = async (deliveryId, status) => {
  const delivery = await Delivery.findById(deliveryId);

  if (!delivery) {
    throw new Error('Entrega não encontrada.');
  }

  const updatedDelivery = await Delivery.updateStatus(deliveryId, status);
  const order = await Order.findById(delivery.order_id);

  if (status === 'in_transit') {
    await notifyCustomer(
      order,
      STATUS_MESSAGES.in_transit(order.id, delivery.courier_name)
    );
  }

  if (status === 'delivered') {
    await Order.updateStatus(order.id, 'delivered');
    await notifyCustomer(order, STATUS_MESSAGES.delivered(order.id));
  }

  return { delivery: updatedDelivery, order };
};

const listDeliveries = async (status) => Delivery.findAll({ status });

module.exports = {
  assignDelivery,
  updateDeliveryStatus,
  listDeliveries,
  notifyCustomer
};
