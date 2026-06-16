const db = require('../database/connection');

const findById = async (id) => {
  const result = await db.query('SELECT * FROM conversations WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const findByPhoneNumber = async (phoneNumber) => {
  const result = await db.query(
    'SELECT * FROM conversations WHERE phone_number = $1',
    [phoneNumber]
  );

  return result.rows[0] || null;
};

const create = async (phoneNumber) => {
  const result = await db.query(
    `INSERT INTO conversations (phone_number)
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

const touch = async (id) => {
  const result = await db.query(
    `UPDATE conversations
     SET updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  return result.rows[0];
};

const updateStatus = async (id, status) => {
  const result = await db.query(
    `UPDATE conversations
     SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );

  return result.rows[0];
};

const setBotPaused = async (id, paused) => {
  const result = await db.query(
    `UPDATE conversations
     SET bot_paused = $2,
         handoff_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END,
         status = CASE WHEN $2 THEN 'human_handoff' ELSE 'active' END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, paused === true]
  );

  return result.rows[0];
};

const updateDeliveryAddress = async (id, deliveryAddress) => {
  const result = await db.query(
    `UPDATE conversations
     SET delivery_address = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, deliveryAddress]
  );

  return result.rows[0];
};

const listForAttendant = async ({ limit = 50, handoffOnly = false } = {}) => {
  const conditions = handoffOnly ? 'WHERE c.bot_paused = true' : '';
  const result = await db.query(
    `SELECT
       c.id,
       c.phone_number,
       c.status,
       c.bot_paused,
       c.delivery_address,
       c.handoff_at,
       c.updated_at,
       cust.name AS customer_name,
       (
         SELECT content FROM messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC
         LIMIT 1
       ) AS last_message,
       (
         SELECT direction FROM messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC
         LIMIT 1
       ) AS last_message_direction,
       (
         SELECT COUNT(*)::int FROM messages m
         WHERE m.conversation_id = c.id
           AND m.direction = 'incoming'
           AND m.created_at > COALESCE(c.handoff_at, c.updated_at - interval '1 day')
       ) AS unread_estimate
     FROM conversations c
     LEFT JOIN customers cust ON cust.phone_number = c.phone_number
     ${conditions}
     ORDER BY c.bot_paused DESC, c.updated_at DESC
     LIMIT $1`,
    [Math.min(Number(limit) || 50, 100)]
  );

  return result.rows;
};

module.exports = {
  findById,
  findByPhoneNumber,
  create,
  findOrCreateByPhoneNumber,
  touch,
  updateStatus,
  setBotPaused,
  updateDeliveryAddress,
  listForAttendant
};
