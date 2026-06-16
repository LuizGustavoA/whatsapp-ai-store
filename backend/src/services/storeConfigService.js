const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const resolveTimezone = () => {
  const configured = process.env.STORE_TIMEZONE?.trim();

  if (!configured) {
    return DEFAULT_TIMEZONE;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: configured });
    return configured;
  } catch {
    console.warn(
      `STORE_TIMEZONE inválido ("${configured}"). Usando ${DEFAULT_TIMEZONE}. Ex.: America/Sao_Paulo`
    );
    return DEFAULT_TIMEZONE;
  }
};

const TIMEZONE = resolveTimezone();

const parseHours = () => {
  const raw = process.env.STORE_HOURS || '11:00-01:00';
  const match = raw.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);

  if (!match) {
    return { openHour: 11, openMinute: 0, closeHour: 1, closeMinute: 0 };
  }

  return {
    openHour: Number(match[1]),
    openMinute: Number(match[2]),
    closeHour: Number(match[3]),
    closeMinute: Number(match[4])
  };
};

const getStoreLocalTime = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);

  return { hour, minute, minutesSinceMidnight: hour * 60 + minute };
};

const isStoreOpen = () => {
  if (process.env.STORE_ALWAYS_OPEN === 'true') {
    return true;
  }

  const { openHour, openMinute, closeHour, closeMinute } = parseHours();
  const { minutesSinceMidnight } = getStoreLocalTime();
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  if (closeMinutes > openMinutes) {
    return minutesSinceMidnight >= openMinutes && minutesSinceMidnight < closeMinutes;
  }

  return minutesSinceMidnight >= openMinutes || minutesSinceMidnight < closeMinutes;
};

const isPaymentConfirmationSkipped = () =>
  process.env.SKIP_PAYMENT_CONFIRMATION === 'true';

const isChatOffTopicRestrictionEnabled = () =>
  process.env.CHAT_RESTRICT_OFF_TOPIC !== 'false';

const getStoreInfo = () => ({
  name: process.env.STORE_NAME || 'WhatsApp AI Store',
  hours: process.env.STORE_HOURS || '11:00-01:00',
  deliveryFee: process.env.STORE_DELIVERY_FEE || 'Consulte no atendimento',
  deliveryArea: process.env.STORE_DELIVERY_AREA || 'Consulte disponibilidade no bairro',
  estimatedPrepMinutes: Number(process.env.STORE_ESTIMATED_PREP_MINUTES) || 35,
  paymentMethods:
    process.env.STORE_PAYMENT_METHODS ||
    'PIX pelo WhatsApp. No balcão/salão também aceitamos dinheiro, cartão débito e crédito.',
  skipPaymentConfirmation: isPaymentConfirmationSkipped(),
  chatRestrictOffTopic: isChatOffTopicRestrictionEnabled(),
  isOpen: isStoreOpen()
});

const getClosedMessage = () => {
  const info = getStoreInfo();

  return `Olá! No momento estamos fechados. 🕐\n\nNosso horário de funcionamento é ${info.hours}.\n\nDeixe sua mensagem que respondemos quando abrirmos, ou volte nesse horário para fazer seu pedido!`;
};

module.exports = {
  getStoreInfo,
  isStoreOpen,
  isPaymentConfirmationSkipped,
  isChatOffTopicRestrictionEnabled,
  getClosedMessage
};
