const loggerService = require('../services/loggerService');

const errorLogger = (err, req, res, next) => {
  loggerService.error(err.message, {
    stack: err.stack,
    method: req.method,
    path: req.originalUrl
  });

  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  return res.status(status).json({
    error: status === 500 ? 'Erro interno do servidor.' : err.message
  });
};

module.exports = errorLogger;
