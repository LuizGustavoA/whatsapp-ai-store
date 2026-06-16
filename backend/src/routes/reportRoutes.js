const express = require('express');
const reportController = require('../controllers/reportController');
const { requireRole } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/sales', requireRole('admin'), reportController.getSales);
router.get('/dashboard', requireRole('admin'), reportController.getDashboard);
router.get('/financial-dashboard', requireRole('admin'), reportController.getFinancialDashboard);
router.put('/financial-config', requireRole('admin'), reportController.updateFinancialConfig);
router.post('/financial-config', requireRole('admin'), reportController.updateFinancialConfig);
router.get('/employees-dashboard', requireRole('admin'), reportController.getEmployeesDashboard);
router.get('/orders', requireRole('admin'), reportController.getOrders);
router.get('/orders/:id', requireRole('admin'), reportController.getOrderById);
router.patch('/orders/:id/status', requireRole('admin'), reportController.updateOrderStatus);

module.exports = router;
