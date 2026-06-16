const express = require('express');
const whatsappController = require('../controllers/whatsappController');

const router = express.Router();

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    mode === 'subscribe' &&
    expectedToken &&
    token === expectedToken
  ) {
    console.log('Webhook validado com sucesso!');
    return res.status(200).send(challenge);
  }

  if (!expectedToken) {
    console.log('Falha na validação do webhook: WHATSAPP_VERIFY_TOKEN não está definido no .env');
  } else if (mode !== 'subscribe') {
    console.log('Falha na validação do webhook: hub.mode inválido:', mode);
  } else {
    console.log('Falha na validação do webhook: token não confere com WHATSAPP_VERIFY_TOKEN do .env');
  }

  return res.sendStatus(403);
});

router.post('/webhook', whatsappController.receiveMessage);

module.exports = router;
