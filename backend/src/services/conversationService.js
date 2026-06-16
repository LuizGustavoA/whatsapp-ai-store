const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const whatsappService = require('../../services/whatsappService');
const openaiService = require('./openaiService');
const Product = require('../models/Product');
const orderService = require('./orderService');
const paymentService = require('./paymentService');
const kitchenService = require('./kitchenService');
const Customer = require('../models/Customer');
const storeConfigService = require('./storeConfigService');
const chatOrderService = require('./chatOrderService');
const n8nService = require('./n8nService');
const menuService = require('./menuService');
const chatGuardService = require('./chatGuardService');
const customerInfoExtractor = require('./customerInfoExtractor');

const PAYMENT_KEYWORDS = ['paguei', 'já paguei', 'pagamento feito', 'pix feito'];

const isPaymentConfirmation = (text) =>
  PAYMENT_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword));

const sendAndSaveReply = async (conversation, phoneNumber, replyText) => {
  try {
    const apiResponse = await whatsappService.sendMessage(phoneNumber, replyText);

    const outgoingMessage = await Message.create({
      conversationId: conversation.id,
      content: replyText,
      direction: 'outgoing',
      whatsappMessageId: apiResponse?.messages?.[0]?.id || null
    });

    return outgoingMessage;
  } catch (error) {
    const metaError = error.response?.data?.error;
    const detail = metaError?.message || error.message;
    const code = metaError?.code;

    console.error('Falha ao enviar mensagem WhatsApp:', detail);

    if (code === 131030) {
      console.error(
        'Seu número não está na lista de teste da Meta. Em developers.facebook.com → WhatsApp → Configuração da API → adicione o número com DDI (ex.: 5511999999999).'
      );
    } else if (detail.includes('Session has expired') || detail.includes('Error validating access token')) {
      console.error(
        'WHATSAPP_TOKEN expirado ou inválido. Gere um token novo em developers.facebook.com → WhatsApp → Configuração da API e atualize o .env'
      );
    } else if (metaError?.code === 100 || metaError?.error_subcode === 33) {
      console.error(
        'Verifique WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env (token expirado ou ID incorreto).'
      );
    }

    return null;
  }
};

const sendImageAndSave = async (conversation, phoneNumber, imageUrl, caption = '') => {
  try {
    const apiResponse = await whatsappService.sendImage(phoneNumber, imageUrl, caption);
    const label = caption?.trim() || 'Imagem do cardápio';

    const outgoingMessage = await Message.create({
      conversationId: conversation.id,
      content: `[Imagem] ${label}`,
      direction: 'outgoing',
      whatsappMessageId: apiResponse?.messages?.[0]?.id || null
    });

    return outgoingMessage;
  } catch (error) {
    console.error('Falha ao enviar imagem WhatsApp:', error.response?.data?.error?.message || error.message);
    return null;
  }
};

const buildRecentOrdersContext = (orders) => {
  if (!orders.length) {
    return '';
  }

  return orders
    .map((order) => {
      const label = order.daily_order_number != null ? `#${order.daily_order_number}` : `#${order.id}`;
      const status = chatOrderService.STATUS_LABELS[order.status] || order.status;

      return `- Pedido ${label}: ${status} (R$ ${Number(order.total_amount).toFixed(2)})`;
    })
    .join('\n');
};

const persistCustomerInfo = async ({
  phoneNumber,
  conversation,
  customerName,
  deliveryAddress
}) => {
  let customer = null;

  if (customerName) {
    customer = await Customer.updateProfile(phoneNumber, { name: customerName });
  }

  if (deliveryAddress) {
    await Conversation.updateDeliveryAddress(conversation.id, deliveryAddress);
    conversation.delivery_address = deliveryAddress;
  }

  return customer;
};

const processIncomingMessage = async ({ phoneNumber, text, whatsappMessageId }) => {
  const conversation = await Conversation.findOrCreateByPhoneNumber(phoneNumber);

  const { message: incomingMessage, created: isNewMessage } = await Message.createIncoming({
    conversationId: conversation.id,
    content: text,
    whatsappMessageId
  });

  if (!isNewMessage) {
    return {
      conversation,
      incomingMessage,
      outgoingMessage: null,
      intent: 'duplicate_skipped',
      order: null,
      duplicate: true
    };
  }

  await Conversation.touch(conversation.id);

  try {
    return await handleIncomingMessage({
      conversation,
      incomingMessage,
      phoneNumber,
      text
    });
  } catch (error) {
    console.error('Erro ao processar mensagem:', error.message, error.stack);

    const outgoingMessage = await sendAndSaveReply(
      conversation,
      phoneNumber,
      'Desculpe, tive um problema aqui. Pode mandar de novo em instantes? 🙏'
    );

    return {
      conversation,
      incomingMessage,
      outgoingMessage,
      intent: 'error',
      order: null
    };
  }
};

const handleIncomingMessage = async ({
  conversation,
  incomingMessage,
  phoneNumber,
  text
}) => {
  if (isPaymentConfirmation(text)) {
    try {
      const result = await kitchenService.confirmPayment(conversation.id);
      const replyText =
        result.notificationMessage ||
        `Pagamento confirmado! Pedido #${result.order.id} em preparação em breve. 🎉`;

      const outgoingMessage = await sendAndSaveReply(conversation, phoneNumber, replyText);

      return {
        conversation,
        incomingMessage,
        outgoingMessage,
        intent: 'payment_confirmed',
        order: result.order
      };
    } catch (error) {
      const replyText = `Não encontrei pedido pendente para confirmar. ${error.message}`;
      const outgoingMessage = await sendAndSaveReply(conversation, phoneNumber, replyText);

      return {
        conversation,
        incomingMessage,
        outgoingMessage,
        intent: 'payment_error',
        order: null
      };
    }
  }

  if (conversation.bot_paused) {
    return {
      conversation,
      incomingMessage,
      outgoingMessage: null,
      intent: 'human_queue',
      order: null
    };
  }

  const storeInfo = storeConfigService.getStoreInfo();

  if (!storeInfo.isOpen) {
    const replyText = storeConfigService.getClosedMessage();
    const outgoingMessage = await sendAndSaveReply(conversation, phoneNumber, replyText);

    return {
      conversation,
      incomingMessage,
      outgoingMessage,
      intent: 'store_closed',
      order: null
    };
  }

  const [messageHistory, products, customer, recentOrders] = await Promise.all([
    Message.findRecentByConversationId(conversation.id, 16),
    Product.findAllActive(),
    Customer.findOrCreateByPhoneNumber(phoneNumber),
    chatOrderService.findRecentOrdersForConversation(conversation.id, 3)
  ]);

  const orderLookup = await chatOrderService.resolveOrderForStatus({
    conversationId: conversation.id,
    phoneNumber,
    text,
    conversationStatus: conversation.status
  });

  const resolvedOrder = orderLookup.order;

  let orderLookupHint = '';

  if (orderLookup.lookupAttempted && !orderLookup.lookupFound) {
    orderLookupHint = `Cliente informou o pedido #${orderLookup.orderNumber}, mas não encontramos pedido com esse número neste WhatsApp. Peça para confirmar o número (ex.: #3 do dia).`;
  }

  if (chatGuardService.shouldRedirectOffTopic(text)) {
    const replyText = chatGuardService.buildOffTopicRedirectReply(storeInfo.name);
    const outgoingMessage = await sendAndSaveReply(conversation, phoneNumber, replyText);

    return {
      conversation,
      incomingMessage,
      outgoingMessage,
      intent: 'off_topic_redirect',
      order: null
    };
  }

  const smallTalkMode = chatGuardService.getSmallTalkMode(text);

  const aiResult = await openaiService.processMessage({
    userMessage: text,
    messageHistory: messageHistory.filter((msg) => msg.id !== incomingMessage.id),
    products,
    customerCashback: Number(customer.cashback_balance),
    customerName: customer.name,
    deliveryAddress: conversation.delivery_address,
    activeOrderContext: chatOrderService.buildOrderContextForAi(
      resolvedOrder,
      storeInfo.estimatedPrepMinutes
    ),
    recentOrdersContext: buildRecentOrdersContext(recentOrders),
    storeInfo,
    orderLookupHint,
    smallTalkMode
  }).catch((error) => {
    console.error('Falha na IA (OpenRouter/OpenAI):', error.message);

    return {
      intent: 'chat',
      reply:
        'Desculpe, tive um probleminha técnico agora. Pode repetir sua mensagem em instantes? 🙏',
      useCashback: false,
      customerName: null,
      deliveryAddress: null,
      orderItems: []
    };
  });

  let replyText = aiResult.reply;
  let order = null;
  let intent = aiResult.intent;

  const resolvedCustomerInfo = customerInfoExtractor.resolveCustomerInfoFromMessage({
    text,
    aiCustomerName: aiResult.customerName,
    aiDeliveryAddress: aiResult.deliveryAddress,
    existingName: customer.name
  });

  await persistCustomerInfo({
    phoneNumber,
    conversation,
    customerName: resolvedCustomerInfo.customerName,
    deliveryAddress: resolvedCustomerInfo.deliveryAddress
  });

  const customerAfterUpdate = await Customer.findByPhoneNumber(phoneNumber);

  if (aiResult.intent === 'provide_order_number') {
    intent = 'order_status';
  }

  if (['order_status', 'complaint_delay', 'provide_order_number'].includes(intent)) {
    if (resolvedOrder) {
      await Conversation.updateStatus(conversation.id, 'active');
    } else if (orderLookup.lookupAttempted && !orderLookup.lookupFound) {
      await Conversation.updateStatus(conversation.id, 'awaiting_order_number');
    } else if (!resolvedOrder) {
      await Conversation.updateStatus(conversation.id, 'awaiting_order_number');
    }
  }

  if (aiResult.intent === 'save_customer_info') {
    // Dados já persistidos acima a partir da mensagem/IA.
  }

  if (aiResult.intent === 'human_handoff') {
    await Conversation.setBotPaused(conversation.id, true);

    n8nService
      .triggerN8nWebhook('conversation.handoff', {
        conversationId: conversation.id,
        phoneNumber,
        lastMessage: text
      })
      .catch(() => {});

    replyText =
      replyText ||
      'Entendi! Vou chamar um atendente humano para te ajudar. Aguarde só um instante, por favor. 🙏';
    intent = 'human_handoff';
  }

  if (aiResult.intent === 'cancel_order') {
    try {
      const cancelled = await chatOrderService.cancelPendingOrder(conversation.id);
      const orderLabel =
        cancelled.daily_order_number != null
          ? `#${cancelled.daily_order_number}`
          : `#${cancelled.id}`;

      replyText = `${replyText}\n\nPedido ${orderLabel} cancelado com sucesso.`.trim();
      await Conversation.updateStatus(conversation.id, 'active');
      intent = 'cancel_order';
    } catch (error) {
      replyText = `${replyText}\n\n${error.message}`.trim();
    }
  }

  const wantsMenu = aiResult.intent === 'send_menu' || menuService.isMenuRequest(text);

  if (wantsMenu) {
    intent = 'send_menu';
    const imageUrl = menuService.getMenuImageUrl();

    if (imageUrl) {
      try {
        await sendImageAndSave(
          conversation,
          phoneNumber,
          imageUrl,
          `📋 Cardápio — ${storeInfo.name || 'nossa loja'}`
        );

        if (!replyText || replyText.length < 20) {
          replyText = 'Aqui está nosso cardápio! 😊 Me diz o que você gostaria de pedir.';
        }
      } catch (error) {
        console.warn('Falha ao enviar imagem do cardápio:', error.message);
        replyText = menuService.buildTextMenu(products);
      }
    } else {
      replyText = menuService.buildTextMenu(products);
    }
  }

  if (aiResult.intent === 'checkout') {
    const customerName = customerAfterUpdate?.name?.trim();
    const deliveryAddress = conversation.delivery_address || resolvedCustomerInfo.deliveryAddress;

    if (!customerName) {
      replyText =
        aiResult.reply ||
        'Antes de fechar o pedido, me passa seu nome completo, por favor? 😊';
      intent = 'chat';
    } else if (!deliveryAddress?.trim()) {
      replyText =
        aiResult.reply ||
        'Perfeito! Agora me passa seu endereço completo para entrega, por favor? 📍';
      intent = 'chat';
    } else {
      const activeOrder = await chatOrderService.findActiveOrderForConversation(conversation.id);

      if (activeOrder) {
        const label =
          activeOrder.daily_order_number != null
            ? `#${activeOrder.daily_order_number}`
            : `#${activeOrder.id}`;
        const statusLabel =
          chatOrderService.STATUS_LABELS[activeOrder.status] || activeOrder.status;

        replyText =
          aiResult.reply ||
          `Você já tem o pedido ${label} em andamento (${statusLabel}). Quer saber o status dele?`;
        intent = 'chat';
      } else {
      try {
        const checkout = await orderService.createOrderFromCheckout(
          conversation.id,
          aiResult.orderItems,
          {
            useCashback: aiResult.useCashback,
            deliveryAddress: conversation.delivery_address || resolvedCustomerInfo.deliveryAddress,
            customerName
          }
        );

        order = checkout.order;

        if (storeInfo.skipPaymentConfirmation) {
          const confirmResult = await kitchenService.confirmPayment(conversation.id, {
            skipCustomerNotification: true
          });

          order = confirmResult.order;
          const confirmLine =
            confirmResult.notificationMessage ||
            `✅ Pedido confirmado! Em breve começaremos o preparo.`;

          replyText = `${checkout.summary}\n\n${confirmLine}\n\n(Modo teste: pagamento automático, sem PIX.)`;
          await Conversation.updateStatus(conversation.id, 'active');
        } else {
          const payment = await paymentService.generatePixForOrder(order);
          replyText = `${checkout.summary}\n\n${payment.message}`;
        }

        intent = 'checkout';
      } catch (error) {
        replyText = `${aiResult.reply}\n\nNão consegui finalizar: ${error.message}. Confirma os itens?`;
        await Conversation.updateStatus(conversation.id, 'active');
        intent = 'chat';
      }
      }
    }
  } else if (
    !['human_handoff', 'cancel_order', 'send_menu', 'order_status', 'complaint_delay'].includes(
      intent
    )
  ) {
    await Conversation.updateStatus(conversation.id, 'active');
  }

  const outgoingMessage = await sendAndSaveReply(conversation, phoneNumber, replyText);

  return {
    conversation,
    incomingMessage,
    outgoingMessage,
    intent,
    order
  };
};

const sendHumanReply = async ({ conversationId, text, employeeName }) => {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new Error('Conversa não encontrada.');
  }

  const prefix = employeeName ? `${employeeName}: ` : '';
  const replyText = `${prefix}${text.trim()}`;

  const outgoingMessage = await Message.create({
    conversationId: conversation.id,
    content: replyText,
    direction: 'outgoing',
    whatsappMessageId: null
  });

  try {
    await whatsappService.sendMessage(conversation.phone_number, replyText);
  } catch (error) {
    const metaError = error.response?.data?.error;
    const detail = metaError?.message || error.message;

    console.error('Falha ao enviar resposta humana no WhatsApp:', detail);

    throw new Error(
      `Mensagem registrada no painel, mas não foi enviada no WhatsApp: ${detail}. Verifique WHATSAPP_TOKEN.`
    );
  }

  await Conversation.touch(conversation.id);

  return { conversation, outgoingMessage };
};

module.exports = {
  processIncomingMessage,
  sendHumanReply,
  sendAndSaveReply
};
