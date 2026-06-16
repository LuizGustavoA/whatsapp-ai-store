const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const loggerService = require('../services/loggerService');

const JWT_EXPIRES_IN = '8h';

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  if (!process.env.JWT_SECRET) {
    loggerService.error('JWT_SECRET não configurado no .env');
    return res.status(500).json({ error: 'Autenticação não configurada no servidor.' });
  }

  try {
    const admin = await Admin.findByUsername(username.trim());

    if (!admin) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { sub: admin.id, username: admin.username, role: admin.role || 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await loggerService.info('Login realizado', { adminId: admin.id, role: admin.role });

    return res.json({
      token,
      expiresIn: JWT_EXPIRES_IN,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role || 'admin'
      }
    });
  } catch (err) {
    loggerService.error('Erro no login administrativo', { message: err.message });
    return res.status(500).json({ error: 'Erro ao processar login.' });
  }
};

const me = async (req, res) => {
  return res.json({
    admin: {
      id: req.admin.id,
      username: req.admin.username,
      name: req.admin.name,
      role: req.admin.role || 'admin'
    }
  });
};

module.exports = {
  login,
  me
};
