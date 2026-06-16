const kitchenService = require('../services/kitchenService');

const listOrders = async (req, res) => {
  try {
    const statuses = req.query.status
      ? req.query.status.split(',').map((s) => s.trim())
      : undefined;

    const orders = await kitchenService.listKitchenOrders(statuses);
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status, courier_name: courierName } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status é obrigatório.' });
    }

    const result = await kitchenService.updateOrderStatus(
      req.params.id,
      status,
      { courierName }
    );

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  listOrders,
  updateOrderStatus
};
