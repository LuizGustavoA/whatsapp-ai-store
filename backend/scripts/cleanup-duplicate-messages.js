const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../database/connection');

const run = async () => {
  const deleted = await db.query(
    `DELETE FROM messages a
     USING messages b
     WHERE a.id > b.id
       AND a.whatsapp_message_id IS NOT NULL
       AND a.whatsapp_message_id = b.whatsapp_message_id`
  );

  console.log(`Duplicatas removidas (mesmo whatsapp_message_id): ${deleted.rowCount}`);

  const deletedRecent = await db.query(
    `DELETE FROM messages a
     USING messages b
     WHERE a.id > b.id
       AND a.direction = 'incoming'
       AND b.direction = 'incoming'
       AND a.conversation_id = b.conversation_id
       AND a.content = b.content
       AND a.created_at BETWEEN b.created_at - INTERVAL '3 seconds' AND b.created_at + INTERVAL '3 seconds'`
  );

  console.log(`Duplicatas removidas (mesmo texto em 3s): ${deletedRecent.rowCount}`);

  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_message_id_unique
     ON messages (whatsapp_message_id)
     WHERE whatsapp_message_id IS NOT NULL`
  );

  console.log('Índice único criado. Pronto.');
  process.exit(0);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
