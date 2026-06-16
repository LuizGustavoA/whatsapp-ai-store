const fs = require('fs');
const path = require('path');
const pool = require('./connection');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  await pool.query(schema);
  console.log('Schema atualizado com sucesso.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Erro ao executar migration:', err);
  process.exit(1);
});
