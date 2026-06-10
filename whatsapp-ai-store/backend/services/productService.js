const db = require('../database/connection');

const createProduct = async (nome, descricao, preco, categoria) => {
  const result = await db.query(
    'INSERT INTO produtos (nome, descricao, preco, categoria) VALUES ($1, $2, $3, $4) RETURNING *',
    [nome, descricao, preco, categoria]
  );

  return result.rows[0];
};

const getProducts = async () => {
  const result = await db.query('SELECT * FROM produtos');
  return result.rows;
};

const getProductById = async (id) => {
  const result = await db.query('SELECT * FROM produtos WHERE id = $1', [id]);
  return result.rows[0];
};

module.exports = {
  createProduct,
  getProducts,
  getProductById
};