
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
const productRoutes = require('./routes/productRoutes');

app.use('/api/products', productRoutes);
// ROTAS
const routes = require('./routes');
app.use('/api', routes);

// TESTE BASE
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WhatsApp AI Store API funcionando'
  });
});

module.exports = app;