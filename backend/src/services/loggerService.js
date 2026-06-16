const db = require('../../database/connection');

const writeLog = async (level, message, context = null) => {
  try {
    await db.query(
      `INSERT INTO system_logs (level, message, context)
       VALUES ($1, $2, $3)`,
      [level, message, context ? JSON.stringify(context) : null]
    );
  } catch (err) {
    console.error('Falha ao gravar log no banco:', err.message);
  }
};

const info = (message, context) => writeLog('info', message, context);
const warn = (message, context) => writeLog('warn', message, context);
const error = (message, context) => writeLog('error', message, context);

module.exports = {
  info,
  warn,
  error
};
