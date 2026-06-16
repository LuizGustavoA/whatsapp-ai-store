const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const Customer = require('../models/Customer');
const chatOrderService = require('./chatOrderService');

const mapConversationRow = (row) => ({
  id: row.id,
  phoneNumber: row.phone_number,
  status: row.status,
  botPaused: row.bot_paused === true,
  deliveryAddress: row.delivery_address,
  handoffAt: row.handoff_at,
  updatedAt: row.updated_at,
  customerName: row.customer_name || null,
  lastMessage: row.last_message || null,
  lastMessageDirection: row.last_message_direction || null,
  unreadEstimate: row.unread_estimate || 0
});

const listConversations = async (options = {}) => {
  const rows = await Conversation.listForAttendant(options);
  return rows.map(mapConversationRow);
};

const getConversationDetail = async (conversationId) => {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    return null;
  }

  const [customer, messages, activeOrder] = await Promise.all([
    Customer.findByPhoneNumber(conversation.phone_number),
    Message.findByConversationId(conversationId),
    chatOrderService.findActiveOrderForConversation(conversationId)
  ]);

  return {
    id: conversation.id,
    phoneNumber: conversation.phone_number,
    status: conversation.status,
    botPaused: conversation.bot_paused === true,
    deliveryAddress: conversation.delivery_address,
    handoffAt: conversation.handoff_at,
    updatedAt: conversation.updated_at,
    customerName: customer?.name || null,
    activeOrder: activeOrder
      ? {
          id: activeOrder.id,
          status: activeOrder.status,
          statusLabel: chatOrderService.STATUS_LABELS[activeOrder.status] || activeOrder.status,
          totalAmount: Number(activeOrder.total_amount),
          dailyOrderNumber: activeOrder.daily_order_number,
          createdAt: activeOrder.created_at
        }
      : null,
    messages: messages.map((message) => ({
      id: message.id,
      content: message.content,
      direction: message.direction,
      createdAt: message.created_at
    }))
  };
};

module.exports = {
  listConversations,
  getConversationDetail
};
