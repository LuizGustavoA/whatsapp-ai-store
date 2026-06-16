const express = require('express');
const deliveryController = require('../controllers/deliveryController');

const router = express.Router();

router.get('/', deliveryController.listDeliveries);
router.post('/', deliveryController.assignDelivery);
router.put('/:id/status', deliveryController.updateDeliveryStatus);

module.exports = router;
