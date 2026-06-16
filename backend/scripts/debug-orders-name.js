require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../database/connection');

(async () => {
  const result = await db.query(
    `SELECT o.id,
            o.display_name,
            o.daily_order_number,
            o.created_at,
            c.phone_number,
            cust.name AS customer_name
     FROM orders o
     JOIN conversations c ON c.id = o.conversation_id
     LEFT JOIN customers cust ON cust.phone_number = c.phone_number
     ORDER BY o.id DESC
     LIMIT 8`
  );

  console.table(result.rows);
  process.exit(0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
