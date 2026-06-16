const OpenAI = require('openai');
const Product = require('../models/Product');

let openaiClient = null;
let llmClientKey = null;

const VALID_INTENTS = [
  'chat',
  'checkout',
  'send_menu',
  'order_status',
  'complaint_delay',
  'human_handoff',
  'cancel_order',
  'store_info',
  'save_customer_info',
  'provide_order_number'
];

const getLlmConfig = () => {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();

  if (openRouterKey) {
    return {
      provider: 'openrouter',
      apiKey: openRouterKey,
      baseURL: process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free',
      jsonMode: process.env.OPENROUTER_JSON_MODE === 'true'
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();

  if (openAiKey) {
    return {
      provider: 'openai',
      apiKey: openAiKey,
      baseURL: undefined,
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
      jsonMode: true
    };
  }

  throw new Error(
    'Configure OPENROUTER_API_KEY (grátis em openrouter.ai) ou OPENAI_API_KEY no .env'
  );
};

const getClient = () => {
  const config = getLlmConfig();
  const cacheKey = `${config.provider}:${config.apiKey}:${config.baseURL || ''}`;

  if (!openaiClient || llmClientKey !== cacheKey) {
    const options = { apiKey: config.apiKey };

    if (config.baseURL) {
      options.baseURL = config.baseURL;
      options.defaultHeaders = {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL?.trim() || 'http://localhost:3000',
        'X-Title': process.env.STORE_NAME?.trim() || 'whatsapp-ai-store'
      };
    }

    openaiClient = new OpenAI(options);
    llmClientKey = cacheKey;
  }

  return openaiClient;
};

const getEffectivePrice = Product.getEffectivePrice;

const formatProductLine = (product) => {
  const effectivePrice = getEffectivePrice(product);
  const priceLabel =
    product.is_promotion && product.promotion_price != null
      ? `R$ ${effectivePrice.toFixed(2)} (de R$ ${Number(product.price).toFixed(2)} — PROMOÇÃO!)`
      : `R$ ${effectivePrice.toFixed(2)}`;

  const categoryLabel = product.category ? ` [${product.category}]` : '';
  const promoTag = product.is_promotion ? ' 🔥' : '';

  return `- ID ${product.id}: ${product.name}${promoTag}${categoryLabel} — ${priceLabel}${product.description ? ` (${product.description})` : ''}`;
};

const buildSystemPrompt = ({
  products = [],
  customerCashback = 0,
  customerName = null,
  deliveryAddress = null,
  activeOrderContext = '',
  recentOrdersContext = '',
  storeInfo = {},
  orderLookupHint = '',
  smallTalkMode = null
}) => {
  const sortedProducts = [...products].sort((a, b) => {
    if (a.is_promotion !== b.is_promotion) {
      return a.is_promotion ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });

  const menu = sortedProducts.length
    ? sortedProducts.map(formatProductLine).join('\n')
    : 'Nenhum produto cadastrado no momento.';

  const hasPromotions = sortedProducts.some((product) => product.is_promotion);
  const storeOpenLine = storeInfo.isOpen
    ? 'Loja ABERTA no momento.'
    : 'Loja FECHADA no momento — informe o horário e seja acolhedor.';

  const restrictOffTopic = storeInfo.chatRestrictOffTopic !== false;

  const smallTalkRules = !restrictOffTopic
    ? `
MODO CONVERSA LIVRE:
- Responda perguntas gerais normalmente (curiosidades, geografia, clima, etc.).
- Mantenha tom de atendente do restaurante e, quando fizer sentido, convide a ver o cardápio ou fazer pedido.`
    : smallTalkMode === 'joke'
      ? `
MODO PIADA (exceção permitida):
- Conte UMA piada curta e leve (máx. 2 frases).
- Depois convide gentilmente a ver o cardápio ou fazer pedido (1 frase).
- Não use outros intents além de "chat".`
      : smallTalkMode === 'football'
        ? `
MODO FUTEBOL (exceção permitida):
- Responda sobre futebol/jogos de forma breve (máx. 3 frases).
- Se não souber o resultado de HOJE com certeza, diga honestamente que não acompanha placar ao vivo — não invente placar.
- Depois convide a ver o cardápio ou fazer pedido (1 frase).
- Não use outros intents além de "chat".`
        : `
FOCO NO NEGÓCIO (economia de tokens):
- Priorize SEMPRE pedidos, cardápio, entrega, pagamento e status.
- NÃO responda perguntas gerais (geografia, história, matemática, clima, política, curiosidades, etc.) — redirecione gentilmente para o pedido.
- Saudações e montagem de pedido: responda normalmente, mas sem textos longos.`;

  const toneLine = restrictOffTopic
    ? 'Seja OBJETIVO: respostas curtas (1 a 4 frases), salvo quando montar pedido ou explicar status.'
    : 'Seja natural e prestativo nas respostas.';

  return `Você é um atendente humano de ${storeInfo.name || 'nosso restaurante'} no WhatsApp.
Fale de forma natural, calorosa e empática — como uma pessoa real, não como robô.
Entenda mensagens informais, gírias, abreviações e erros de digitação.
${toneLine}
${smallTalkRules}

${storeOpenLine}

INFORMAÇÕES DA LOJA:
- Horário: ${storeInfo.hours || '11:00-01:00'}
- Taxa de entrega: ${storeInfo.deliveryFee || 'consulte'}
- Área de entrega: ${storeInfo.deliveryArea || 'consulte'}
- Tempo médio de preparo: cerca de ${storeInfo.estimatedPrepMinutes || 35} minutos
- Formas de pagamento: ${storeInfo.paymentMethods || 'PIX pelo WhatsApp'}
${storeInfo.skipPaymentConfirmation ? '- MODO TESTE: pedidos são confirmados automaticamente após o checkout — NÃO peça PIX nem diga para enviar "paguei".' : ''}

DADOS DO CLIENTE:
- Nome: ${customerName || 'não informado ainda'}
- Endereço de entrega: ${deliveryAddress || 'não informado ainda'}
- Cashback disponível: R$ ${Number(customerCashback).toFixed(2)}

PEDIDO EM ANDAMENTO:
${activeOrderContext}
${orderLookupHint ? `\nOBSERVAÇÃO SOBRE BUSCA: ${orderLookupHint}` : ''}

ÚLTIMOS PEDIDOS:
${recentOrdersContext || 'Nenhum pedido anterior registrado.'}

CARDÁPIO (use IDs exatos no checkout):
${menu}

INTENTS — escolha UMA:
- "chat": conversa geral, montar pedido, tirar dúvida sobre um item específico
- "send_menu": cliente quer VER o cardápio/menu ("manda o cardápio", "quero ver o menu", "tem cardápio?")
- "checkout": cliente confirmou que quer FECHAR o pedido (precisa ter itens claros)
- "order_status": quer saber onde está o pedido ("cadê", "já saiu?", "status")
- "provide_order_number": cliente informou o NÚMERO do pedido (#3, pedido 5, só "7")
- "complaint_delay": reclamação de demora/atraso ("tá demorando", "quanto tempo", "cadê meu lanche")
- "human_handoff": quer falar com atendente humano
- "cancel_order": quer cancelar pedido aguardando pagamento
- "store_info": horário, taxa, área de entrega, formas de pagamento
- "save_customer_info": cliente informou nome e/ou endereço (extraia nos campos customer_name e delivery_address)

REGRAS DE ATENDIMENTO:
- Entenda linguagem informal: "tá demorando" = atraso; "cadê" = status; "quero falar com alguém" = human_handoff
- Em complaint_delay: peça desculpas, use os dados do PEDIDO EM ANDAMENTO, explique status real, seja empático
- Em order_status: responda com status claro baseado nos dados reais do pedido — não invente
- Se PEDIDO EM ANDAMENTO disser "Nenhum pedido em andamento" e o cliente perguntar status/atraso, PEÇA o número do pedido do dia (ex.: #3) de forma amigável
- Em provide_order_number: agradeça pelo número; se ainda não houver dados do pedido na OBSERVAÇÃO, diga que não encontrou e peça para confirmar o número
- Se OBSERVAÇÃO disser que o número não foi encontrado, peça para verificar o número ou falar com atendente
- Em store_info: use as formas de pagamento configuradas acima
- Se não houver pedido em andamento e perguntarem status, peça o número do pedido antes de chutar
- Em human_handoff: confirme que vai passar para um atendente humano em breve
- Em cancel_order: confirme que vai cancelar o pedido aguardando pagamento (só funciona se status pending)
- Em save_customer_info: agradeça e confirme o que foi anotado
- Em send_menu: responda de forma acolhedora; o sistema enviará a FOTO do cardápio automaticamente se disponível — não liste todos os itens em texto, seja breve e convide a pedir
- Antes de checkout/pagamento, o cliente PRECISA informar nome completo e endereço de entrega — se faltar o nome, peça só o nome; se faltar o endereço, peça só o endereço
- NUNCA use intent "checkout" se o nome ou endereço ainda não estiverem informados nos DADOS DO CLIENTE acima
- Em checkout: só confirme o fechamento quando nome e endereço já estiverem preenchidos
- Se cliente pedir cashback no fechamento, use use_cashback: true
${hasPromotions ? '- Destaque produtos em PROMOÇÃO (🔥) quando relevante\n' : ''}
Responda SEMPRE em JSON válido:
{
  "intent": "chat|send_menu|checkout|order_status|provide_order_number|complaint_delay|human_handoff|cancel_order|store_info|save_customer_info",
  "reply": "sua resposta natural para o cliente",
  "use_cashback": false,
  "customer_name": null,
  "delivery_address": null,
  "order_items": [{ "product_id": 1, "quantity": 2 }]
}

order_items só em checkout.
Sempre preencha customer_name e delivery_address no JSON quando o cliente informar nome ou endereço, em QUALQUER intent (não só save_customer_info).`;
};

const formatHistory = (messages) =>
  messages.map((message) => ({
    role: message.direction === 'incoming' ? 'user' : 'assistant',
    content: message.content
  }));

const extractJsonPayload = (rawContent) => {
  let jsonStr = rawContent.trim();
  const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);

  if (codeBlock) {
    jsonStr = codeBlock[1].trim();
  } else {
    const objectStart = jsonStr.indexOf('{');
    const objectEnd = jsonStr.lastIndexOf('}');

    if (objectStart >= 0 && objectEnd > objectStart) {
      jsonStr = jsonStr.slice(objectStart, objectEnd + 1);
    }
  }

  return JSON.parse(jsonStr);
};

const parseAiResponse = (rawContent) => {
  const parsed = extractJsonPayload(rawContent);

  const intent = VALID_INTENTS.includes(parsed.intent) ? parsed.intent : 'chat';
  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
  const orderItems = Array.isArray(parsed.order_items) ? parsed.order_items : [];

  return {
    intent,
    reply: reply || 'Desculpe, não entendi bem. Pode repetir de outro jeito?',
    useCashback: parsed.use_cashback === true,
    customerName:
      typeof parsed.customer_name === 'string' && parsed.customer_name.trim()
        ? parsed.customer_name.trim()
        : null,
    deliveryAddress:
      typeof parsed.delivery_address === 'string' && parsed.delivery_address.trim()
        ? parsed.delivery_address.trim()
        : null,
    orderItems: orderItems
      .filter((item) => item?.product_id && item?.quantity)
      .map((item) => ({
        productId: Number(item.product_id),
        quantity: Number(item.quantity)
      }))
      .filter((item) => item.productId > 0 && item.quantity > 0)
  };
};

const processMessage = async (context) => {
  const config = getLlmConfig();
  const temperature = Number(process.env.LLM_TEMPERATURE || process.env.OPENAI_TEMPERATURE) || 0.65;
  const restrictOffTopic = context.storeInfo?.chatRestrictOffTopic !== false;
  const historyLimit =
    restrictOffTopic && context.smallTalkMode ? 4 : 16;
  const trimmedHistory = (context.messageHistory || []).slice(-historyLimit);

  const request = {
    model: config.model,
    temperature,
    messages: [
      { role: 'system', content: buildSystemPrompt(context) },
      ...formatHistory(trimmedHistory),
      { role: 'user', content: context.userMessage }
    ]
  };

  if (config.jsonMode) {
    request.response_format = { type: 'json_object' };
  }

  try {
    const completion = await getClient().chat.completions.create(request);
    const rawContent = completion.choices[0]?.message?.content;

    if (!rawContent) {
      throw new Error(`Resposta vazia do provedor de IA (${config.provider})`);
    }

    try {
      return parseAiResponse(rawContent);
    } catch {
      return {
        intent: 'chat',
        reply: rawContent.trim().slice(0, 1000),
        useCashback: false,
        customerName: null,
        deliveryAddress: null,
        orderItems: []
      };
    }
  } catch (error) {
    console.error(`Falha na IA (${config.provider}/${config.model}):`, error.message);
    throw error;
  }
};

module.exports = {
  processMessage,
  buildSystemPrompt,
  getLlmConfig,
  VALID_INTENTS
};
