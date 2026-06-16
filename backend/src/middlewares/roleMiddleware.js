const requireRole = (...roles) => (req, res, next) => {
  const role = req.admin?.role || 'admin';

  if (!roles.includes(role)) {
    return res.status(403).json({ error: 'Acesso não autorizado para este perfil.' });
  }

  return next();
};

module.exports = { requireRole };
