require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../database/connection');

const phone = process.argv[2] || '5511999999999';

(async () => {
  const result = await db.query(
    `SELECT m.direction, m.content, m.created_at
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.phone_number = $1
     ORDER BY m.created_at DESC
     LIMIT 30`,
    [phone]
  );

  for (const row of result.rows.reverse()) {
    const time = new Date(row.created_at).toLocaleTimeString('pt-BR');
    const prefix = row.direction === 'incoming' ? '>>>' : '<<<';
    console.log(`${time} ${prefix} ${row.content.slice(0, 120)}`);
  }

  process.exit(0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
