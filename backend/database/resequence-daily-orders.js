const dailyOrderService = require('../src/services/dailyOrderService');
const pool = require('./connection');

async function resequence() {
  const timezone = process.env.STORE_TIMEZONE || 'America/Sao_Paulo';

  await pool.query(
    `UPDATE orders
     SET order_date = (created_at AT TIME ZONE 'UTC' AT TIME ZONE $1)::date
     WHERE order_date IS NULL`,
    [timezone]
  );

  await dailyOrderService.resequenceDailyNumbers(pool);
  console.log('Números diários resequenciados com sucesso.');
  await pool.end();
}

resequence().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
