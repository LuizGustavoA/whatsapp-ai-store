module.exports = (app) => {
  const whatsappRoutes = require("../../routes/whatsappRoutes");
  app.use(whatsappRoutes);
};