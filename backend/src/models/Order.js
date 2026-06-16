const db = require('../../database/connection');
const dailyOrderService = require('../services/dailyOrderService');

const create = async ({
  conversationId,
  subtotalAmount,
  discountAmount = 0,
  cashbackUsed = 0,
  totalAmount,
  status = 'pending',
  orderDate = dailyOrderService.formatDateInput(),
  deliveryAddress = null,
  displayName = null
}) => {
  await db.query('BEGIN');

  try {
    const { dailyOrderNumber } = await dailyOrderService.reserveDailyOrderNumber(orderDate, db);

    const result = await db.query(
      `INSERT INTO orders (
         conversation_id, subtotal_amount, discount_amount,
         cashback_used, total_amount, status, order_date, daily_order_number,
         delivery_address, display_name
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10)
       RETURNING *`,
      [
        conversationId,
        subtotalAmount,
        discountAmount,
        cashbackUsed,
        totalAmount,
        status,
        orderDate,
        dailyOrderNumber,
        deliveryAddress,
        displayName
      ]
    );

    await db.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};

const findById = async (id) => {
  const result = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const findByMercadoPagoPaymentId = async (paymentId) => {
  const result = await db.query(
    `SELECT * FROM orders WHERE mercado_pago_payment_id = $1 LIMIT 1`,
    [String(paymentId)]
  );

  return result.rows[0] || null;
};

const findKitchenOrders = async (statuses = ['paid', 'preparing', 'ready']) => {
  const result = await db.query(
    `SELECT o.*, c.phone_number,
       COALESCE(
         json_agg(
           json_build_object(
             'id', oi.id,
             'product_id', oi.product_id,
             'product_name', p.name,
             'quantity', oi.quantity,
             'unit_price', oi.unit_price
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'
       ) AS items
     FROM orders o
     JOIN conversations c ON c.id = o.conversation_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.status = ANY($1::text[])
     GROUP BY o.id, c.phone_number
     ORDER BY o.created_at ASC`,
    [statuses]
  );

  return result.rows;
};

const findLastPendingByConversationId = async (conversationId) => {
  const result = await db.query(
    `SELECT * FROM orders
     WHERE conversation_id = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [conversationId]
  );

  return result.rows[0] || null;
};

const updateStatus = async (id, status) => {
  const result = await db.query(
    `UPDATE orders
     SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );

  return result.rows[0] || null;
};

const setPixCode = async (id, pixCode) => {
  const result = await db.query(
    `UPDATE orders
     SET pix_code = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, pixCode]
  );

  return result.rows[0] || null;
};

const setMercadoPagoPaymentId = async (id, paymentId) => {
  const result = await db.query(
    `UPDATE orders
     SET mercado_pago_payment_id = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, paymentId]
  );

  return result.rows[0] || null;
};

module.exports = {
  create,
  findById,
  findByMercadoPagoPaymentId,
  findKitchenOrders,
  findLastPendingByConversationId,
  updateStatus,
  setPixCode,
  setMercadoPagoPaymentId
};
