const express = require('express');
const customerController = require('../controllers/customerController');
const { requireRole } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/', requireRole('admin'), customerController.getCustomers);
router.get('/:id/stats', requireRole('admin'), customerController.getCustomerStats);

module.exports = router;
