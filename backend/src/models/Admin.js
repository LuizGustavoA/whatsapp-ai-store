const db = require('../../database/connection');

const findByUsername = async (username) => {
  const result = await db.query(
    'SELECT * FROM admins WHERE username = $1 AND is_active = true',
    [username]
  );

  return result.rows[0] || null;
};

const findById = async (id) => {
  const result = await db.query(
    'SELECT id, username, name, role, is_active, created_at FROM admins WHERE id = $1',
    [id]
  );

  return result.rows[0] || null;
};

const create = async ({ username, passwordHash, name, role = 'admin' }) => {
  const result = await db.query(
    `INSERT INTO admins (username, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, name, role, is_active, created_at`,
    [username, passwordHash, name, role]
  );

  return result.rows[0];
};

module.exports = {
  findByUsername,
  findById,
  create
};
