const productService = require('../services/productService');

const createProduct = async (req, res) => {
  try {
    const { nome, descricao, preco, categoria } = req.body;

    const product = await productService.createProduct(
      nome,
      descricao,
      preco,
      categoria
    );

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const products = await productService.getProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById
};