const db = require('../database/connection');

const findByWhatsappMessageId = async (whatsappMessageId) => {
  if (!whatsappMessageId) {
    return null;
  }

  const result = await db.query(
    `SELECT * FROM messages WHERE whatsapp_message_id = $1 LIMIT 1`,
    [whatsappMessageId]
  );

  return result.rows[0] || null;
};

const createIncoming = async ({ conversationId, content, whatsappMessageId = null }) => {
  if (whatsappMessageId) {
    const existing = await findByWhatsappMessageId(whatsappMessageId);

    if (existing) {
      return { message: existing, created: false };
    }

    try {
      const result = await db.query(
        `INSERT INTO messages (conversation_id, content, direction, whatsapp_message_id)
         VALUES ($1, $2, 'incoming', $3)
         RETURNING *`,
        [conversationId, content, whatsappMessageId]
      );

      return { message: result.rows[0], created: true };
    } catch (error) {
      if (error.code === '23505') {
        const duplicate = await findByWhatsappMessageId(whatsappMessageId);
        return { message: duplicate, created: false };
      }

      throw error;
    }
  }

  const recentDuplicate = await findRecentDuplicateIncoming(conversationId, content);

  if (recentDuplicate) {
    return { message: recentDuplicate, created: false };
  }

  try {
    const result = await db.query(
      `INSERT INTO messages (conversation_id, content, direction, whatsapp_message_id)
       VALUES ($1, $2, 'incoming', NULL)
       RETURNING *`,
      [conversationId, content]
    );

    return { message: result.rows[0], created: true };
  } catch (error) {
    if (error.code === '23505') {
      const duplicate = await findRecentDuplicateIncoming(conversationId, content, 10);
      return { message: duplicate, created: false };
    }

    throw error;
  }
};

const create = async ({ conversationId, content, direction, whatsappMessageId = null }) => {
  if (whatsappMessageId && direction === 'incoming') {
    const incoming = await createIncoming({ conversationId, content, whatsappMessageId });
    return incoming.message;
  }

  const result = await db.query(
    `INSERT INTO messages (conversation_id, content, direction, whatsapp_message_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [conversationId, content, direction, whatsappMessageId]
  );

  return result.rows[0];
};

const findRecentDuplicateIncoming = async (conversationId, content, windowSeconds = 5) => {
  const result = await db.query(
    `SELECT * FROM messages
     WHERE conversation_id = $1
       AND direction = 'incoming'
       AND content = $2
       AND created_at > NOW() - ($3 * INTERVAL '1 second')
     ORDER BY created_at DESC
     LIMIT 1`,
    [conversationId, content, windowSeconds]
  );

  return result.rows[0] || null;
};

const findByConversationId = async (conversationId) => {
  const result = await db.query(
    `SELECT * FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );

  return result.rows;
};

const findRecentByConversationId = async (conversationId, limit = 10) => {
  const result = await db.query(
    `SELECT * FROM (
       SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) recent
     ORDER BY created_at ASC`,
    [conversationId, limit]
  );

  return result.rows;
};

module.exports = {
  create,
  createIncoming,
  findByWhatsappMessageId,
  findRecentDuplicateIncoming,
  findByConversationId,
  findRecentByConversationId
};
