const express = require('express');
const router = express.Router();

// health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'backend-running'
  });
});

module.exports = router;