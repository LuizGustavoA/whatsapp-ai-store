const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const token = process.env.WHATSAPP_TOKEN?.trim();
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
const model = process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free';

const fail = (message) => {
  console.error('❌', message);
  process.exitCode = 1;
};

const ok = (message) => {
  console.log('✅', message);
};

const run = async () => {
  console.log('Diagnóstico WhatsApp AI Store\n');

  if (!token) {
    fail('WHATSAPP_TOKEN vazio no .env');
  } else {
    ok('WHATSAPP_TOKEN definido');
  }

  if (!phoneNumberId) {
    fail('WHATSAPP_PHONE_NUMBER_ID vazio no .env');
  } else {
    ok(`WHATSAPP_PHONE_NUMBER_ID = ${phoneNumberId}`);
  }

  if (!verifyToken) {
    fail('WHATSAPP_VERIFY_TOKEN vazio no .env');
  } else {
    ok('WHATSAPP_VERIFY_TOKEN definido');
  }

  if (!openRouterKey && !process.env.OPENAI_API_KEY?.trim()) {
    fail('Configure OPENROUTER_API_KEY ou OPENAI_API_KEY');
  } else {
    ok(openRouterKey ? `OpenRouter configurado (modelo: ${model})` : 'OpenAI configurado');
  }

  if (!phoneNumberId || !token) {
    return;
  }

  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v23.0/${phoneNumberId}?fields=display_phone_number,verified_name,webhook_configuration,health_status,code_verification_status`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    ok(`Número Meta: ${data.display_phone_number} (${data.verified_name || 'sem nome'})`);
    ok(`Webhook na Meta: ${data.webhook_configuration?.application || 'não configurado'}`);

    const health = data.health_status;
    const blocked = (health?.entities || []).filter(
      (entity) => entity.can_send_message === 'BLOCKED'
    );

    if (blocked.length) {
      console.log('\n⚠️  Meta bloqueando envio em partes da conta:');
      blocked.forEach((entity) => {
        console.log(`- ${entity.entity_type}:`);
        (entity.errors || []).forEach((error) => {
          console.log(`    ${error.error_code}: ${error.error_description}`);
          if (error.possible_solution) {
            console.log(`    → ${error.possible_solution}`);
          }
        });
      });
      process.exitCode = 1;
    } else {
      ok('Conta sem bloqueios de envio na Meta');
    }
  } catch (error) {
    const meta = error.response?.data?.error;
    const message = meta?.message || error.message;

    if (message.includes('Session has expired') || message.includes('Error validating access token')) {
      fail(`WHATSAPP_TOKEN EXPIRADO — gere um token novo na Meta e atualize o .env\n    ${message}`);
    } else {
      fail(`Token/Phone ID inválido: ${message}`);
    }

    return;
  }

  try {
    await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: 'Responda só: ok' }]
      },
      {
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    ok(`Modelo OpenRouter "${model}" respondeu`);
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    fail(`OpenRouter falhou: ${detail}`);
  }

  console.log('\nImportante (modo teste Meta):');
  console.log('- Converse no WhatsApp com o número de TESTE: +1 555-648-9256 (não outro contato)');
  console.log('- Seu celular precisa estar em WhatsApp → Configuração da API → "Adicionar número de telefone"');
  console.log('- Cadastre seu número com DDD na lista de teste da Meta (ex.: 5511999999999)');
  console.log('- Se a API aceita mas nada chega: adicione forma de pagamento no Meta Business');
  console.log('- Reinicie o backend após mudar o .env: cd backend && npm start');
  console.log('- ngrok deve apontar para porta 3000: ngrok http 3000');
};

run();
