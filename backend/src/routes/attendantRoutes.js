const express = require('express');
const attendantController = require('../controllers/attendantController');
const employeeAuthController = require('../controllers/employeeAuthController');
const authMiddleware = require('../middlewares/authMiddleware');
const {
  requireEmployee,
  requirePermission
} = require('../middlewares/employeePanelMiddleware');

const router = express.Router();

router.post('/login', employeeAuthController.login);
router.get('/me', authMiddleware, requireEmployee, employeeAuthController.me);

router.use(authMiddleware, requireEmployee);

const chatController = require('../controllers/chatController');

router.get('/conversations', chatController.listConversations);
router.get('/conversations/:id', chatController.getConversation);
router.post('/conversations/:id/reply', chatController.replyToConversation);
router.patch('/conversations/:id/resume-bot', chatController.resumeBot);

router.get('/orders', attendantController.getOrders);
router.post('/orders', requirePermission('create_order'), attendantController.createOrder);
router.get('/orders/:id', attendantController.getOrderById);
router.patch('/orders/:id/status', attendantController.updateOrderStatus);
router.post(
  '/orders/:id/confirm-payment',
  requirePermission('receive_payment'),
  attendantController.confirmOrderPayment
);
router.put('/orders/:id/items', requirePermission('create_order'), attendantController.updateOrderItems);

module.exports = router;
