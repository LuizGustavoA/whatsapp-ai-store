const assertStatusPermission = (req, status) => {
  if (status === 'preparing' && !req.employee.permissions.set_preparing) {
    const error = new Error('Você não tem permissão para alterar para preparando.');
    error.status = 403;
    throw error;
  }

  if (status === 'out_for_delivery' && !req.employee.permissions.set_out_for_delivery) {
    const error = new Error('Você não tem permissão para alterar para em entrega.');
    error.status = 403;
    throw error;
  }
};

const requireEmployee = (req, res, next) => {
  if (!req.employee) {
    return res.status(403).json({
      error: 'Acesso exclusivo para funcionários com login do painel atendente.'
    });
  }

  return next();
};

const requirePermission = (permissionKey) => (req, res, next) => {
  if (!req.employee) {
    return res.status(403).json({
      error: 'Acesso exclusivo para funcionários com login do painel atendente.'
    });
  }

  if (!req.employee.permissions?.[permissionKey]) {
    return res.status(403).json({
      error: 'Você não tem permissão para esta ação.'
    });
  }

  return next();
};

module.exports = {
  requireEmployee,
  requirePermission,
  assertStatusPermission
};
