const db = require('../../database/connection');

const create = async ({ orderId, courierName, status = 'assigned' }) => {
  const result = await db.query(
    `INSERT INTO deliveries (order_id, courier_name, status)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [orderId, courierName, status]
  );

  return result.rows[0];
};

const findById = async (id) => {
  const result = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const findByOrderId = async (orderId) => {
  const result = await db.query(
    `SELECT * FROM deliveries
     WHERE order_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [orderId]
  );

  return result.rows[0] || null;
};

const findAll = async ({ status } = {}) => {
  if (status) {
    const result = await db.query(
      `SELECT d.*, o.total_amount, o.status AS order_status, c.phone_number
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       JOIN conversations c ON c.id = o.conversation_id
       WHERE d.status = $1
       ORDER BY d.created_at DESC`,
      [status]
    );

    return result.rows;
  }

  const result = await db.query(
    `SELECT d.*, o.total_amount, o.status AS order_status, c.phone_number
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     JOIN conversations c ON c.id = o.conversation_id
     ORDER BY d.created_at DESC`
  );

  return result.rows;
};

const updateStatus = async (id, status) => {
  const result = await db.query(
    `UPDATE deliveries
     SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );

  return result.rows[0] || null;
};

module.exports = {
  create,
  findById,
  findByOrderId,
  findAll,
  updateStatus
};
