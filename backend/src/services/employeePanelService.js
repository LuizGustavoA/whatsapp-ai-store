const bcrypt = require('bcrypt');
const db = require('../../database/connection');

const DEFAULT_PANEL_PERMISSIONS = {
  create_order: false,
  receive_payment: false,
  set_preparing: false,
  set_out_for_delivery: false
};

const PERMISSION_KEYS = Object.keys(DEFAULT_PANEL_PERMISSIONS);

const normalizePermissions = (raw = {}) => ({
  create_order: Boolean(raw.create_order),
  receive_payment: Boolean(raw.receive_payment),
  set_preparing: Boolean(raw.set_preparing),
  set_out_for_delivery: Boolean(raw.set_out_for_delivery)
});

const mapPanelAccess = (row) => ({
  username: row.username || null,
  panelAccessEnabled: row.panel_access_enabled === true,
  permissions: normalizePermissions(row.panel_permissions || DEFAULT_PANEL_PERMISSIONS),
  hasPassword: Boolean(row.password_hash)
});

const findByUsername = async (username) => {
  const result = await db.query(
    `SELECT *
     FROM employees
     WHERE LOWER(username) = LOWER($1)
       AND status = 'active'
       AND panel_access_enabled = true`,
    [username.trim()]
  );

  return result.rows[0] || null;
};

const findForAuth = async (employeeId) => {
  const result = await db.query(
    `SELECT *
     FROM employees
     WHERE id = $1
       AND status = 'active'
       AND panel_access_enabled = true`,
    [employeeId]
  );

  return result.rows[0] || null;
};

const authenticateEmployee = async (username, password) => {
  if (!username?.trim() || !password) {
    throw new Error('Usuário e senha são obrigatórios.');
  }

  const employee = await findByUsername(username);

  if (!employee || !employee.password_hash) {
    throw new Error('Credenciais inválidas.');
  }

  const passwordMatch = await bcrypt.compare(password, employee.password_hash);

  if (!passwordMatch) {
    throw new Error('Credenciais inválidas.');
  }

  return employee;
};

const updatePanelAccess = async (employeeId, payload) => {
  const existing = await db.query(
    `SELECT * FROM employees WHERE id = $1 AND status = 'active'`,
    [employeeId]
  );

  if (existing.rows.length === 0) {
    throw new Error('Funcionário não encontrado ou já demitido.');
  }

  const current = existing.rows[0];
  let username = payload.username?.trim() || null;
  const panelAccessEnabled = payload.panel_access_enabled === true;
  const permissions = normalizePermissions({
    ...DEFAULT_PANEL_PERMISSIONS,
    ...(current.panel_permissions || {}),
    ...(payload.permissions || {})
  });

  if (panelAccessEnabled) {
    if (!username) {
      username = current.name?.trim() || null;
    }

    if (!username) {
      throw new Error('Informe um login para habilitar o painel atendente.');
    }

    if (username.length < 2) {
      throw new Error('Login deve ter pelo menos 2 caracteres.');
    }

    const duplicate = await db.query(
      `SELECT id FROM employees WHERE LOWER(username) = LOWER($1) AND id <> $2`,
      [username, employeeId]
    );

    if (duplicate.rows.length > 0) {
      throw new Error('Este login já está em uso por outro funcionário. Escolha outro nome.');
    }

    if (!payload.password && !current.password_hash) {
      throw new Error('Informe uma senha para habilitar o acesso ao painel atendente.');
    }
  }

  let passwordHash = current.password_hash;

  if (payload.password) {
    if (String(payload.password).length < 4) {
      throw new Error('Senha deve ter pelo menos 4 caracteres.');
    }

    passwordHash = await bcrypt.hash(String(payload.password), 10);
  }

  const result = await db.query(
    `UPDATE employees
     SET username = $2,
         password_hash = $3,
         panel_access_enabled = $4,
         panel_permissions = $5::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [
      employeeId,
      panelAccessEnabled ? username : null,
      panelAccessEnabled ? passwordHash : null,
      panelAccessEnabled,
      JSON.stringify(panelAccessEnabled ? permissions : DEFAULT_PANEL_PERMISSIONS)
    ]
  );

  return mapPanelAccess(result.rows[0]);
};

const toAuthResponse = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  username: row.username,
  permissions: normalizePermissions(row.panel_permissions || DEFAULT_PANEL_PERMISSIONS)
});

module.exports = {
  DEFAULT_PANEL_PERMISSIONS,
  PERMISSION_KEYS,
  normalizePermissions,
  mapPanelAccess,
  findForAuth,
  authenticateEmployee,
  updatePanelAccess,
  toAuthResponse
};
