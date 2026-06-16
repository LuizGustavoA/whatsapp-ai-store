const Product = require('../models/Product');

const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      category,
      unit_cost,
      is_promotion,
      promotion_price,
      is_active
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'name e price são obrigatórios.' });
    }

    if (is_promotion && (promotion_price === undefined || promotion_price === null)) {
      return res.status(400).json({ error: 'promotion_price é obrigatório quando is_promotion é true.' });
    }

    const parsedUnitCost =
      unit_cost === '' || unit_cost == null ? null : Number(unit_cost);

    if (parsedUnitCost != null && (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0)) {
      return res.status(400).json({ error: 'unit_cost deve ser um número maior ou igual a zero.' });
    }

    const product = await Product.create({
      name,
      description,
      price,
      category,
      unitCost: parsedUnitCost,
      isPromotion: is_promotion === true,
      promotionPrice: is_promotion ? promotion_price : null,
      isActive: is_active !== undefined ? is_active : true
    });

    return res.status(201).json(product);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll();
    return res.json(products);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    return res.json(product);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      category,
      unit_cost,
      is_promotion,
      promotion_price,
      is_active
    } = req.body;

    if (is_promotion === true && (promotion_price === undefined || promotion_price === null)) {
      return res.status(400).json({ error: 'promotion_price é obrigatório quando is_promotion é true.' });
    }

    const parsedUnitCost =
      unit_cost === undefined
        ? undefined
        : unit_cost === '' || unit_cost == null
          ? null
          : Number(unit_cost);

    if (
      parsedUnitCost != null &&
      parsedUnitCost !== undefined &&
      (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0)
    ) {
      return res.status(400).json({ error: 'unit_cost deve ser um número maior ou igual a zero.' });
    }

    const product = await Product.update(req.params.id, {
      name,
      description,
      price,
      category,
      unitCost: parsedUnitCost,
      isPromotion: is_promotion,
      promotionPrice: is_promotion === false ? null : promotion_price,
      isActive: is_active
    });

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    return res.json(product);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.remove(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    return res.json({ message: 'Produto removido com sucesso.', product });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
};
