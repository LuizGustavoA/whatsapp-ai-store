const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../database/connection');

const phone = process.argv[2] || '5511999999999';

db.query(
  `SELECT id, phone_number, bot_paused, status, updated_at
   FROM conversations WHERE phone_number = $1`,
  [phone]
).then((result) => {
  console.log('Conversa:', JSON.stringify(result.rows[0], null, 2));
  process.exit(0);
});
