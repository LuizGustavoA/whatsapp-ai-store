const jwt = require('jsonwebtoken');
const employeePanelService = require('../services/employeePanelService');
const loggerService = require('../services/loggerService');

const JWT_EXPIRES_IN = '8h';

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Autenticação não configurada no servidor.' });
  }

  try {
    const employee = await employeePanelService.authenticateEmployee(username, password);
    const token = jwt.sign(
      {
        sub: employee.id,
        type: 'employee',
        username: employee.username
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await loggerService.info('Login funcionário painel atendente', {
      employeeId: employee.id,
      username: employee.username
    });

    return res.json({
      token,
      expiresIn: JWT_EXPIRES_IN,
      employee: employeePanelService.toAuthResponse(employee)
    });
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Credenciais inválidas.' });
  }
};

const me = async (req, res) => {
  return res.json({
    employee: employeePanelService.toAuthResponse(req.employee)
  });
};

module.exports = {
  login,
  me
};
