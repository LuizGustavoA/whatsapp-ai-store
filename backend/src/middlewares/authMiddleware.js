const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const employeePanelService = require('../services/employeePanelService');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.type === 'employee') {
      const employee = await employeePanelService.findForAuth(payload.sub);

      if (!employee) {
        return res.status(401).json({ error: 'Funcionário inválido ou sem acesso ao painel.' });
      }

      req.employee = employeePanelService.toAuthResponse(employee);
      req.authType = 'employee';
      req.admin = {
        id: employee.id,
        username: employee.username,
        name: employee.name,
        role: 'attendant'
      };

      return next();
    }

    const admin = await Admin.findById(payload.sub);

    if (!admin || !admin.is_active) {
      return res.status(401).json({ error: 'Usuário inválido ou inativo.' });
    }

    req.admin = { ...admin, role: admin.role || 'admin' };
    req.authType = 'admin';
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};

module.exports = authMiddleware;
