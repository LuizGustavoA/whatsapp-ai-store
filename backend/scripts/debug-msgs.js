const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../database/connection');

const phone = process.argv[2] || '5511999999999';

db.query(
  `SELECT m.direction, m.content, m.created_at, m.whatsapp_message_id
   FROM messages m
   JOIN conversations c ON c.id = m.conversation_id
   WHERE c.phone_number = $1
   ORDER BY m.created_at DESC
   LIMIT 20`,
  [phone]
).then((result) => {
  console.log(`Mensagens para ${phone}:\n`);

  if (!result.rows.length) {
    console.log('(nenhuma)');
    process.exit(0);
  }

  result.rows.forEach((row) => {
    console.log(`${row.created_at} [${row.direction}] ${row.content}`);
  });

  const outgoing = result.rows.filter((row) => row.direction === 'outgoing');

  console.log(`\nTotal: ${result.rows.length} | Enviadas pelo bot: ${outgoing.length}`);
  process.exit(0);
});
