const db = require('../../database/connection');

const TIMEZONE = process.env.STORE_TIMEZONE || 'America/Sao_Paulo';

const formatDateInput = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

const getNextDailyOrderNumber = async (orderDate, client = db) => {
  const result = await client.query(
    `SELECT COALESCE(MAX(daily_order_number), 0) + 1 AS next_number
     FROM orders
     WHERE order_date = $1::date`,
    [orderDate]
  );

  return Number(result.rows[0].next_number);
};

const reserveDailyOrderNumber = async (orderDate = formatDateInput(), client = db) => {
  const dailyOrderNumber = await getNextDailyOrderNumber(orderDate, client);
  return { orderDate, dailyOrderNumber };
};

const resequenceDailyNumbers = async (client = db) => {
  await client.query(`
    WITH numbered AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(order_date, created_at::date)
          ORDER BY created_at ASC
        ) AS daily_num
      FROM orders
    )
    UPDATE orders o
    SET daily_order_number = numbered.daily_num
    FROM numbered
    WHERE o.id = numbered.id
  `);
};

module.exports = {
  TIMEZONE,
  formatDateInput,
  getNextDailyOrderNumber,
  reserveDailyOrderNumber,
  resequenceDailyNumbers
};
