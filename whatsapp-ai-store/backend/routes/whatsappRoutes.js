const express = require("express");
const router = express.Router();

router.get("/webhook", (req, res) => {
  console.log("Webhook chamado");
  console.log("TOKEN RECEBIDO:", req.query["hub.verify_token"]);
  console.log("TOKEN ENV:", process.env.WHATSAPP_VERIFY_TOKEN);

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    console.log("Webhook validado com sucesso!");
    return res.status(200).send(challenge);
  }

  console.log("Falha na validação");
  return res.sendStatus(403);
});
router.post("/webhook", (req, res) => {
  console.log("=== NOVA MENSAGEM ===");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});
module.exports = router;