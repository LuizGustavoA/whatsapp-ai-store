const chatConversationService = require('../services/chatConversationService');
const conversationService = require('../services/conversationService');
const Conversation = require('../../models/Conversation');

const listConversations = async (req, res, next) => {
  try {
    const conversations = await chatConversationService.listConversations({
      limit: req.query.limit,
      handoffOnly: req.query.handoff === 'true'
    });

    return res.json({ conversations });
  } catch (err) {
    return next(err);
  }
};

const getConversation = async (req, res, next) => {
  try {
    const conversation = await chatConversationService.getConversationDetail(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    return res.json(conversation);
  } catch (err) {
    return next(err);
  }
};

const replyToConversation = async (req, res, next) => {
  try {
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Mensagem é obrigatória.' });
    }

    const result = await conversationService.sendHumanReply({
      conversationId: Number(req.params.id),
      text: message,
      employeeName: req.employee?.name || null
    });

    if (!result.outgoingMessage) {
      return res.status(502).json({
        error: 'Não foi possível registrar a mensagem. Tente novamente.'
      });
    }

    return res.json({
      message: {
        id: result.outgoingMessage.id,
        content: result.outgoingMessage.content,
        direction: result.outgoingMessage.direction,
        createdAt: result.outgoingMessage.created_at
      }
    });
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

const resumeBot = async (req, res, next) => {
  try {
    const conversation = await Conversation.setBotPaused(req.params.id, false);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    return res.json({
      id: conversation.id,
      botPaused: false,
      status: conversation.status
    });
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

module.exports = {
  listConversations,
  getConversation,
  replyToConversation,
  resumeBot
};
