const storeConfigService = require('./storeConfigService');

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const ORDER_TOPIC_PATTERN =
  /\b(pedido|pedir|cardapio|menu|entrega|delivery|retirada|endereco|nome|pagamento|pix|paguei|cashback|status|cancelar|horario|taxa|promocao|combo|lanche|pizza|burger|hamburguer|xis|batata|refrigerante|suco|bebida|sobremesa|doce|marmita|porcao|combo|quero|manda|traz|fechar|confirmo|confirmar|total|preco|valor|conta|nota|mesa|atendente|humano|cardap|item|produto|unidade|quantidade|unidades|x\s*\d|\d+\s*x)\b/i;

const GREETING_PATTERN =
  /^(oi|ola|olá|eai|e ai|opa|bom dia|boa tarde|boa noite|hey|hello|hi|salve|fala|blz|beleza|tudo bem|td bem|como vai|obrigad|valeu|brigad)[!.?\s]*$/i;

const JOKE_PATTERN =
  /\b(piada|piadas|conta\s+(uma|um)\s+(piada|caso|historia)|me\s+faz\s+rir|me\s+faça\s+rir|manda\s+(uma\s+)?piada|conte\s+(uma\s+)?piada|algo\s+engraçado|engraçad)\b/i;

const FOOTBALL_PATTERN =
  /\b(futebol|jogo|jogos|partida|partidas|campeonato|brasileirao|libertadores|copa|placar|gol|gols|time|times|flamengo|palmeiras|corinthians|sao paulo|santos|gremio|internacional|atletico|vasco|botafogo|fluminense|cruzeiro|quem\s+ganhou|quem\s+venceu|resultado\s+(do\s+)?jogo|rodada|classificacao|tabela|artilheiro)\b/i;

const isGreetingOnly = (text) => GREETING_PATTERN.test(String(text || '').trim());

const isOrderRelatedMessage = (text) => {
  const value = String(text || '').trim();

  if (!value) {
    return true;
  }

  if (isGreetingOnly(value)) {
    return true;
  }

  return ORDER_TOPIC_PATTERN.test(normalize(value));
};

const isJokeRequest = (text) => JOKE_PATTERN.test(normalize(text));

const isFootballQuestion = (text) => FOOTBALL_PATTERN.test(normalize(text));

const getSmallTalkMode = (text) => {
  if (!storeConfigService.isChatOffTopicRestrictionEnabled()) {
    return null;
  }

  if (isJokeRequest(text)) {
    return 'joke';
  }

  if (isFootballQuestion(text)) {
    return 'football';
  }

  return null;
};

const shouldRedirectOffTopic = (text) => {
  if (!storeConfigService.isChatOffTopicRestrictionEnabled()) {
    return false;
  }

  if (isOrderRelatedMessage(text)) {
    return false;
  }

  if (getSmallTalkMode(text)) {
    return false;
  }

  return true;
};

const buildOffTopicRedirectReply = (storeName = 'nosso restaurante') =>
  `Adoro conversar, mas aqui eu cuido dos pedidos do ${storeName}! 😊 Quer ver o cardápio ou montar seu pedido?`;

module.exports = {
  isOrderRelatedMessage,
  isJokeRequest,
  isFootballQuestion,
  getSmallTalkMode,
  shouldRedirectOffTopic,
  buildOffTopicRedirectReply
};
