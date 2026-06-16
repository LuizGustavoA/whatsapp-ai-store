const axios = require('axios');
const loggerService = require('./loggerService');

const getWebhookUrl = (eventName) => {
  const envKey = `N8N_WEBHOOK_${eventName.toUpperCase().replace(/[.\-]/g, '_')}`;
  return process.env[envKey] || process.env.N8N_WEBHOOK_URL || null;
};

const triggerN8nWebhook = async (eventName, payload = {}) => {
  const url = getWebhookUrl(eventName);

  if (!url) {
    return { skipped: true, reason: 'Webhook N8N não configurado.' };
  }

  try {
    const response = await axios.post(
      url,
      {
        event: eventName,
        timestamp: new Date().toISOString(),
        ...payload
      },
      {
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.N8N_WEBHOOK_SECRET
            ? { 'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET }
            : {})
        }
      }
    );

    await loggerService.info('Webhook N8N disparado', {
      event: eventName,
      status: response.status
    });

    return { success: true, status: response.status };
  } catch (err) {
    await loggerService.warn('Falha ao disparar webhook N8N', {
      event: eventName,
      message: err.message
    });

    return { success: false, error: err.message };
  }
};

module.exports = {
  triggerN8nWebhook
};
