const deliveryService = require('../services/deliveryService');

const listDeliveries = async (req, res) => {
  try {
    const deliveries = await deliveryService.listDeliveries(req.query.status);
    return res.json(deliveries);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const assignDelivery = async (req, res) => {
  try {
    const { order_id: orderId, courier_name: courierName } = req.body;

    if (!orderId || !courierName) {
      return res.status(400).json({ error: 'order_id e courier_name são obrigatórios.' });
    }

    const result = await deliveryService.assignDelivery({ orderId, courierName });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const updateDeliveryStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status é obrigatório.' });
    }

    const result = await deliveryService.updateDeliveryStatus(req.params.id, status);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  listDeliveries,
  assignDelivery,
  updateDeliveryStatus
};
