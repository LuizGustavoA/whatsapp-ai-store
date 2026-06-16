const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const whatsappService = require('./whatsappService');

const AUTO_REPLY_TEXT = 'Olá! Como posso ajudar?';

const processIncomingMessage = async ({ phoneNumber, text, whatsappMessageId }) => {
  const conversation = await Conversation.findOrCreateByPhoneNumber(phoneNumber);

  const incomingMessage = await Message.create({
    conversationId: conversation.id,
    content: text,
    direction: 'incoming',
    whatsappMessageId
  });

  await Conversation.touch(conversation.id);

  const apiResponse = await whatsappService.sendAutoReply(phoneNumber);

  const outgoingMessage = await Message.create({
    conversationId: conversation.id,
    content: AUTO_REPLY_TEXT,
    direction: 'outgoing',
    whatsappMessageId: apiResponse?.messages?.[0]?.id || null
  });

  return {
    conversation,
    incomingMessage,
    outgoingMessage
  };
};

module.exports = {
  processIncomingMessage,
  AUTO_REPLY_TEXT
};
