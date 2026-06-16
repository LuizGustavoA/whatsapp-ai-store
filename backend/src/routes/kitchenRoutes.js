const express = require('express');
const kitchenController = require('../controllers/kitchenController');

const router = express.Router();

router.get('/orders', kitchenController.listOrders);
router.put('/orders/:id/status', kitchenController.updateOrderStatus);

module.exports = router;
