const conversationService = require('../src/services/conversationService');
const loggerService = require('../src/services/loggerService');
const webhookController = require('../src/controllers/webhookController');
const whatsappService = require('../services/whatsappService');

const MEDIA_REPLIES = {
  audio: 'Recebi seu áudio! 🎧 Por enquanto só consigo ler mensagens de texto. Pode me escrever o que precisa?',
  image: 'Recebi sua imagem! 📷 Por enquanto trabalho só com texto. Me conta o que você precisa?',
  video: 'Recebi seu vídeo! Por enquanto preciso que você escreva em texto, tá bem?',
  document: 'Recebi seu arquivo! Por enquanto só leio mensagens de texto. Pode me explicar por escrito?',
  sticker: 'Adorei o sticker! 😄 Me manda em texto o que você precisa?',
  location: 'Recebi sua localização! 📍 Me confirma o endereço completo por texto para a entrega?',
  default:
    'Recebi sua mensagem! Por enquanto só consigo ler textos. Pode escrever o que precisa?'
};

const extractIncomingMessage = (body) => {
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message) {
    return null;
  }

  const phoneNumber = message.from;

  if (!phoneNumber) {
    return null;
  }

  if (message.type === 'text') {
    const text = message.text?.body;

    if (!text) {
      return null;
    }

    return {
      phoneNumber,
      text,
      whatsappMessageId: message.id,
      type: 'text'
    };
  }

  return {
    phoneNumber,
    text: MEDIA_REPLIES[message.type] || MEDIA_REPLIES.default,
    whatsappMessageId: message.id,
    type: message.type
  };
};

const extractStatusUpdate = (body) => body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0] || null;

const logStatusUpdate = (status) => {
  const recipient = status?.recipient_id;
  const state = status?.status;
  const messageId = status?.id;

  if (state === 'failed') {
    const errors = (status.errors || [])
      .map((error) => `${error.code}: ${error.title || error.message}`)
      .join(' | ');

    console.error('WhatsApp FALHOU ao entregar mensagem:', {
      recipient: recipient,
      messageId,
      errors: errors || 'sem detalhe'
    });
    return;
  }

  console.log('WhatsApp status:', { recipient: recipient, state, messageId });
};

exports.receiveMessage = async (req, res) => {
  try {
    if (!webhookController.verifyMetaSignature(req)) {
      console.warn('Webhook POST rejeitado: assinatura Meta inválida (confira WHATSAPP_APP_SECRET ou deixe vazio).');
      return res.sendStatus(403);
    }

    const messagePreview = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const statusPreview = req.body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];

    if (messagePreview) {
      console.log('WhatsApp recebeu mensagem de:', messagePreview.from, '→', messagePreview.text?.body || messagePreview.type);
    } else if (statusPreview) {
      console.log('WhatsApp status update:', statusPreview.status, 'para', statusPreview.recipient_id);
    } else {
      console.log('Webhook POST sem mensagem/status (payload Meta):', JSON.stringify(req.body).slice(0, 200));
    }

    const incoming = extractIncomingMessage(req.body);

    if (!incoming) {
      const status = extractStatusUpdate(req.body);

      if (status) {
        logStatusUpdate(status);
      }

      return res.sendStatus(200);
    }

    if (!whatsappService.isBotAllowedSender(incoming.phoneNumber)) {
      console.log(
        'Mensagem ignorada (número fora da lista do bot):',
        incoming.phoneNumber,
        '→',
        incoming.text
      );
      return res.sendStatus(200);
    }

    const result = await conversationService.processIncomingMessage(incoming);

    if (result.duplicate) {
      console.log('Webhook duplicado ignorado:', incoming.whatsappMessageId);
      return res.sendStatus(200);
    }

    if (!result.outgoingMessage) {
      console.warn('Mensagem recebida, mas resposta NÃO enviada ao WhatsApp.', {
        phone: incoming.phoneNumber,
        hint: 'Cadastre este número na lista de teste da Meta (erro #131030) ou verifique WHATSAPP_TOKEN.'
      });
    } else {
      console.log('Mensagem processada:', {
        phone: result.conversation.phone_number,
        intent: result.intent,
        incoming: result.incomingMessage.content,
        outgoing: result.outgoingMessage.content,
        orderId: result.order?.id || null
      });
    }

    return res.sendStatus(200);
  } catch (err) {
    loggerService.error('Erro ao processar webhook WhatsApp', {
      message: err.message,
      stack: err.stack,
      meta: err.response?.data?.error || null
    });
    console.error('Erro ao processar webhook:', err.message);
    if (err.response?.data) {
      console.error('Detalhe Meta/API:', JSON.stringify(err.response.data));
    }
    // Sempre 200 para a Meta não reenviar o webhook (evita mensagens duplicadas).
    return res.sendStatus(200);
  }
};
