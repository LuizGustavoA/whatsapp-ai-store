/**
 * Redefine as senhas dos usuários padrão (admin e atendente).
 * Uso: node database/reset-logins.js
 */
const bcrypt = require('bcrypt');
const pool = require('./connection');

const USERS = [
  { username: 'admin', password: 'admin123', name: 'Administrador', role: 'admin' },
  { username: 'atendente', password: 'atendente123', name: 'Atendente', role: 'attendant' }
];

async function resetLogins() {
  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    const existing = await pool.query('SELECT id FROM admins WHERE username = $1', [
      user.username
    ]);

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO admins (username, password_hash, name, role)
         VALUES ($1, $2, $3, $4)`,
        [user.username, passwordHash, user.name, user.role]
      );
      console.log(`Criado: ${user.username} / ${user.password}`);
    } else {
      await pool.query(
        `UPDATE admins
         SET password_hash = $2, name = $3, role = $4, is_active = true
         WHERE username = $1`,
        [user.username, passwordHash, user.name, user.role]
      );
      console.log(`Senha redefinida: ${user.username} / ${user.password}`);
    }
  }

  await pool.end();
  console.log('Pronto.');
}

resetLogins().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
