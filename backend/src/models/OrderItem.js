const db = require('../../database/connection');

const createMany = async (orderId, items) => {
  const createdItems = [];

  for (const item of items) {
    const result = await db.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [orderId, item.productId, item.quantity, item.unitPrice]
    );

    createdItems.push(result.rows[0]);
  }

  return createdItems;
};

const findByOrderId = async (orderId) => {
  const result = await db.query(
    `SELECT oi.*, p.name AS product_name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC`,
    [orderId]
  );

  return result.rows;
};

module.exports = {
  createMany,
  findByOrderId
};
