const whatsappService = require("../services/whatsappService");

exports.receiveMessage = async (req, res) => {
  try {
    const data = req.body;

    const message = data?.data?.message?.conversation;
    const from = data?.data?.key?.remoteJid;

    if (!message || !from) return res.sendStatus(200);

    console.log(message);

    return res.sendStatus(200);
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
};