require('dotenv').config();
const { Pool } = require('pg');

const dbName = process.env.DB_NAME || 'whatsapp_ai_store';

const adminPool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: 'postgres',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

(async () => {
  const existing = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);

  if (existing.rows.length > 0) {
    console.log(`Banco "${dbName}" já existe.`);
    await adminPool.end();
    return;
  }

  await adminPool.query(`CREATE DATABASE ${dbName}`);
  console.log(`Banco "${dbName}" criado com sucesso.`);
  await adminPool.end();
})().catch((error) => {
  console.error('Erro ao criar banco:', error.message);
  process.exit(1);
});
