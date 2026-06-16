const Customer = require('../models/Customer');

const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.findAllWithOrderCount();
    return res.json(customers);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getCustomerStats = async (req, res) => {
  try {
    const stats = await Customer.findStatsById(req.params.id);

    if (!stats) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getCustomers,
  getCustomerStats
};
