const reportService = require('../services/reportService');
const financialConfigService = require('../services/financialConfigService');

const getSales = async (req, res, next) => {
  try {
    const report = await reportService.getSalesReport({
      from: req.query.from,
      to: req.query.to
    });

    return res.json(report);
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const report = await reportService.getDashboardReport();
    return res.json(report);
  } catch (err) {
    return next(err);
  }
};

const getFinancialDashboard = async (req, res, next) => {
  try {
    const report = await reportService.getFinancialDashboardReport();
    return res.json(report);
  } catch (err) {
    return next(err);
  }
};

const updateFinancialConfig = async (req, res, next) => {
  try {
    const config = await financialConfigService.saveConfig(req.body || {});
    const report = await reportService.getFinancialDashboardReport();
    return res.json({ config, report });
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

const getEmployeesDashboard = async (req, res, next) => {
  try {
    const report = await reportService.getEmployeesDashboardReport(req.query.employeeId);
    return res.json(report);
  } catch (err) {
    return next(err);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const sort = req.query.sort === 'desc' ? 'desc' : 'asc';
    const statuses = req.query.status
      ? req.query.status.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const orders = await reportService.listOrders(req.query.limit, sort, {
      search: req.query.search,
      statuses,
      modified: req.query.modified,
      date: req.query.date,
      hourFrom: req.query.hourFrom,
      hourTo: req.query.hourTo,
      dailyNumber: req.query.dailyNumber
    });

    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await reportService.getOrderDetail(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    return res.json(order);
  } catch (err) {
    return next(err);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status é obrigatório.' });
    }

    const order = await reportService.updateOrderStatus(req.params.id, status);
    return res.json(order);
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

module.exports = {
  getSales,
  getDashboard,
  getFinancialDashboard,
  updateFinancialConfig,
  getEmployeesDashboard,
  getOrders,
  getOrderById,
  updateOrderStatus
};
