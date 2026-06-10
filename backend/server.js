const express = require("express");
const app = express();

require("dotenv").config();

app.use(express.json());
const whatsappRoutes = require("./routes/whatsappRoutes");

app.use("/", whatsappRoutes);
app.get("/", (req, res) => {
  res.send("🚀 Backend WhatsApp AI Store rodando!");
});
// WhatsApp API
require("./api/whatsapp/webhook")(app);

app.listen(3000, () => {
  console.log("🚀 Backend rodando na porta 3000");
});