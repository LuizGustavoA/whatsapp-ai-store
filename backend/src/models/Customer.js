const db = require('../../database/connection');

const findByPhoneNumber = async (phoneNumber) => {
  const result = await db.query(
    'SELECT * FROM customers WHERE phone_number = $1',
    [phoneNumber]
  );

  return result.rows[0] || null;
};

const create = async (phoneNumber) => {
  const result = await db.query(
    `INSERT INTO customers (phone_number)
     VALUES ($1)
     RETURNING *`,
    [phoneNumber]
  );

  return result.rows[0];
};

const findOrCreateByPhoneNumber = async (phoneNumber) => {
  const existing = await findByPhoneNumber(phoneNumber);

  if (existing) {
    return existing;
  }

  return create(phoneNumber);
};

const updateProfile = async (phoneNumber, { name }) => {
  if (!name?.trim()) {
    return findByPhoneNumber(phoneNumber);
  }

  await findOrCreateByPhoneNumber(phoneNumber);

  const result = await db.query(
    `UPDATE customers
     SET name = $2, updated_at = CURRENT_TIMESTAMP
     WHERE phone_number = $1
     RETURNING *`,
    [phoneNumber, name.trim()]
  );

  return result.rows[0] || null;
};

const addCashback = async (phoneNumber, amount) => {
  const result = await db.query(
    `UPDATE customers
     SET cashback_balance = cashback_balance + $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE phone_number = $1
     RETURNING *`,
    [phoneNumber, amount]
  );

  return result.rows[0] || null;
};

const deductCashback = async (phoneNumber, amount) => {
  const result = await db.query(
    `UPDATE customers
     SET cashback_balance = GREATEST(cashback_balance - $2, 0),
         updated_at = CURRENT_TIMESTAMP
     WHERE phone_number = $1
     RETURNING *`,
    [phoneNumber, amount]
  );

  return result.rows[0] || null;
};

const PAID_STATUSES = ['paid', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

const findAllWithOrderCount = async () => {
  const result = await db.query(
    `SELECT
       c.id,
       c.name,
       c.phone_number,
       COUNT(DISTINCT o.id)::int AS order_count,
       COALESCE(SUM(o.total_amount) FILTER (
         WHERE o.status = ANY($1::text[])
       ), 0)::float AS total_spent
     FROM customers c
     LEFT JOIN conversations conv ON conv.phone_number = c.phone_number
     LEFT JOIN orders o ON o.conversation_id = conv.id
     GROUP BY c.id, c.name, c.phone_number
     ORDER BY c.created_at DESC`,
    [PAID_STATUSES]
  );

  return result.rows;
};

const findById = async (id) => {
  const result = await db.query('SELECT * FROM customers WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const findStatsById = async (id) => {
  const customer = await findById(id);

  if (!customer) {
    return null;
  }

  const [lastOrdersResult, favoriteProductsResult, favoriteDaysResult, totalsResult] =
    await Promise.all([
      db.query(
        `SELECT
           o.id,
           o.total_amount,
           o.status,
           o.created_at,
           o.daily_order_number,
           o.order_date
         FROM orders o
         JOIN conversations c ON c.id = o.conversation_id
         WHERE c.phone_number = $1
         ORDER BY o.created_at DESC
         LIMIT 10`,
        [customer.phone_number]
      ),
      db.query(
        `SELECT
           p.name AS product_name,
           SUM(oi.quantity)::int AS total_quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN conversations c ON c.id = o.conversation_id
         JOIN products p ON p.id = oi.product_id
         WHERE c.phone_number = $1
         GROUP BY p.id, p.name
         ORDER BY total_quantity DESC
         LIMIT 5`,
        [customer.phone_number]
      ),
      db.query(
        `SELECT
           CASE EXTRACT(DOW FROM o.created_at)::int
             WHEN 0 THEN 'Domingo'
             WHEN 1 THEN 'Segunda-feira'
             WHEN 2 THEN 'Terça-feira'
             WHEN 3 THEN 'Quarta-feira'
             WHEN 4 THEN 'Quinta-feira'
             WHEN 5 THEN 'Sexta-feira'
             WHEN 6 THEN 'Sábado'
           END AS day_name,
           COUNT(*)::int AS order_count
         FROM orders o
         JOIN conversations c ON c.id = o.conversation_id
         WHERE c.phone_number = $1
         GROUP BY EXTRACT(DOW FROM o.created_at)
         ORDER BY order_count DESC`,
        [customer.phone_number]
      ),
      db.query(
        `SELECT
           COUNT(DISTINCT o.id)::int AS order_count,
           COALESCE(SUM(o.total_amount) FILTER (
             WHERE o.status = ANY($2::text[])
           ), 0)::float AS total_spent
         FROM orders o
         JOIN conversations c ON c.id = o.conversation_id
         WHERE c.phone_number = $1`,
        [customer.phone_number, PAID_STATUSES]
      )
    ]);

  const totals = totalsResult.rows[0];

  return {
    id: customer.id,
    name: customer.name,
    phoneNumber: customer.phone_number,
    orderCount: totals.order_count,
    totalSpent: Number(totals.total_spent),
    lastOrders: lastOrdersResult.rows.map((row) => ({
      id: row.id,
      totalAmount: Number(row.total_amount),
      status: row.status,
      createdAt: row.created_at,
      dailyOrderNumber: row.daily_order_number,
      orderDate: row.order_date
    })),
    favoriteProducts: favoriteProductsResult.rows.map((row) => ({
      productName: row.product_name,
      totalQuantity: row.total_quantity
    })),
    favoriteDays: favoriteDaysResult.rows.map((row) => ({
      dayName: row.day_name,
      orderCount: row.order_count
    }))
  };
};

module.exports = {
  findByPhoneNumber,
  create,
  findOrCreateByPhoneNumber,
  updateProfile,
  addCashback,
  deductCashback,
  findAllWithOrderCount,
  findById,
  findStatsById,
  PAID_STATUSES
};
