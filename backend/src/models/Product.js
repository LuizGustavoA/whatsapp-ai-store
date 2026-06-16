const db = require('../../database/connection');

const getEffectivePrice = (product) => {
  if (product.is_promotion && product.promotion_price != null) {
    return Number(product.promotion_price);
  }

  return Number(product.price);
};

const getProfitMetrics = (product, quantity = 1) => {
  const salePrice = getEffectivePrice(product);
  const unitCost = product.unit_cost != null ? Number(product.unit_cost) : null;
  const qty = Math.max(1, Number(quantity) || 1);

  if (unitCost == null) {
    return {
      unitCost: null,
      totalCost: null,
      profitPerUnit: null,
      totalProfit: null,
      marginPercent: null
    };
  }

  const profitPerUnit = Number((salePrice - unitCost).toFixed(2));
  const totalCost = Number((unitCost * qty).toFixed(2));
  const totalProfit = Number((profitPerUnit * qty).toFixed(2));
  const marginPercent =
    salePrice > 0 ? Number(((profitPerUnit / salePrice) * 100).toFixed(1)) : null;

  return {
    unitCost,
    totalCost,
    profitPerUnit,
    totalProfit,
    marginPercent
  };
};

const mapProduct = (product) => {
  if (!product) {
    return null;
  }

  const metrics = getProfitMetrics(product);

  return {
    ...product,
    price: Number(product.price),
    promotion_price: product.promotion_price != null ? Number(product.promotion_price) : null,
    unit_cost: product.unit_cost != null ? Number(product.unit_cost) : null,
    effective_price: getEffectivePrice(product),
    ...metrics
  };
};

const findAllActive = async () => {
  const result = await db.query(
    `SELECT * FROM products
     WHERE is_active = true
     ORDER BY is_promotion DESC, name ASC`
  );

  return result.rows.map(mapProduct);
};

const findAll = async () => {
  const result = await db.query(
    'SELECT * FROM products ORDER BY is_promotion DESC, name ASC'
  );
  return result.rows.map(mapProduct);
};

const findById = async (id) => {
  const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  return mapProduct(result.rows[0] || null);
};

const findActiveByIds = async (ids) => {
  const result = await db.query(
    `SELECT * FROM products
     WHERE id = ANY($1::int[]) AND is_active = true`,
    [ids]
  );

  return result.rows.map(mapProduct);
};

const create = async ({
  name,
  description,
  price,
  category,
  unitCost = null,
  isPromotion = false,
  promotionPrice = null,
  isActive = true
}) => {
  const result = await db.query(
    `INSERT INTO products (
       name, description, price, category, unit_cost,
       is_promotion, promotion_price, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      name,
      description || null,
      price,
      category || null,
      unitCost,
      isPromotion,
      promotionPrice,
      isActive
    ]
  );

  return mapProduct(result.rows[0]);
};

const update = async (
  id,
  { name, description, price, category, unitCost, isPromotion, promotionPrice, isActive }
) => {
  const fields = [];
  const values = [id];
  let paramIndex = 2;

  const addField = (column, value) => {
    fields.push(`${column} = $${paramIndex}`);
    values.push(value);
    paramIndex += 1;
  };

  if (name !== undefined) addField('name', name);
  if (description !== undefined) addField('description', description);
  if (price !== undefined) addField('price', price);
  if (category !== undefined) addField('category', category);
  if (unitCost !== undefined) addField('unit_cost', unitCost);
  if (isPromotion !== undefined) addField('is_promotion', isPromotion);
  if (promotionPrice !== undefined) addField('promotion_price', promotionPrice);
  if (isActive !== undefined) addField('is_active', isActive);

  if (fields.length === 0) {
    return findById(id);
  }

  const result = await db.query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );

  return mapProduct(result.rows[0] || null);
};

const remove = async (id) => {
  const result = await db.query(
    'DELETE FROM products WHERE id = $1 RETURNING *',
    [id]
  );

  return result.rows[0] || null;
};

module.exports = {
  findAllActive,
  findAll,
  findById,
  findActiveByIds,
  create,
  update,
  remove,
  getEffectivePrice,
  getProfitMetrics,
  mapProduct
};
