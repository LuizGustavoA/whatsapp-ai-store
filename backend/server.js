const express = require("express");

const path = require("path");

const cors = require("cors");

const app = express();



require("dotenv").config({ path: path.join(__dirname, ".env") });



app.use(cors({

  origin: process.env.CORS_ORIGIN || "*",

  credentials: true

}));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Permite chamadas diretas com prefixo /api (ex.: VITE_API_URL=http://localhost:3000/api)
app.use((req, res, next) => {
  if (req.url.startsWith('/api/') || req.url === '/api') {
    req.url = req.url.replace(/^\/api(?=\/|$)/, '') || '/';
  }

  return next();
});

app.use("/public", express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  if (req.path === '/webhook') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${timestamp}] ${req.method} /webhook`);
  }

  return next();
});



const authMiddleware = require("./src/middlewares/authMiddleware");

const errorLogger = require("./src/middlewares/errorLogger");



const whatsappRoutes = require("./routes/whatsappRoutes");

const authRoutes = require("./src/routes/authRoutes");

const productRoutes = require("./src/routes/productRoutes");

const customerRoutes = require("./src/routes/customerRoutes");

const kitchenRoutes = require("./src/routes/kitchenRoutes");

const deliveryRoutes = require("./src/routes/deliveryRoutes");

const reportRoutes = require("./src/routes/reportRoutes");

const attendantRoutes = require("./src/routes/attendantRoutes");
const employeeRoutes = require("./src/routes/employeeRoutes");
const webhookController = require("./src/controllers/webhookController");



app.use("/", whatsappRoutes);

app.use("/admin", authRoutes);

app.use("/products", authMiddleware, productRoutes);

app.use("/customers", authMiddleware, customerRoutes);

app.use("/kitchen", authMiddleware, kitchenRoutes);

app.use("/deliveries", authMiddleware, deliveryRoutes);

app.use("/reports", authMiddleware, reportRoutes);

app.use("/attendant", attendantRoutes);
app.use("/employees", authMiddleware, employeeRoutes);

app.post("/webhooks/mercadopago", webhookController.mercadoPagoWebhook);



app.get("/health", (req, res) => {

  res.json({
    status: "ok",
    service: "whatsapp-ai-store",
    version: "2025-06-humanized-chatbot",
    features: {
      financialConfig: true,
      ownerDashboard: true,
      employeesDashboard: true,
      employeePanelLogin: true,
      humanizedChatbot: true,
      whatsappHandoff: true
    }
  });

});



app.get("/", (req, res) => {

  res.send("🚀 Backend WhatsApp AI Store rodando!");

});



app.use(errorLogger);



const PORT = process.env.PORT || 3000;



app.listen(PORT, () => {

  console.log(`🚀 Backend rodando na porta ${PORT} (build 2026-06-16-nome-produto)`);

  if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    console.warn('⚠️  WHATSAPP_VERIFY_TOKEN não definido — webhook da Meta não vai validar');
  } else {
    console.log('Webhook WhatsApp: GET /webhook (verify token configurado)');
  }

  const allowedNumbers = process.env.WHATSAPP_BOT_ALLOWED_NUMBERS?.trim();

  if (allowedNumbers) {
    console.log(`Chatbot restrito aos números: ${allowedNumbers}`);
  }

  if (process.env.SKIP_PAYMENT_CONFIRMATION === 'true') {
    console.log('⚠️  Modo teste: pedidos confirmados automaticamente (sem PIX/pagamento)');
  }

  if (process.env.CHAT_RESTRICT_OFF_TOPIC === 'false') {
    console.log('💬 Restrições de chat DESATIVADAS (IA conversa livremente)');
  } else {
    console.log('💬 Restrições de chat ATIVAS (economia de tokens)');
  }

});

