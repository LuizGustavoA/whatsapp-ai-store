const reportService = require('../services/reportService');
const { assertStatusPermission } = require('../middlewares/employeePanelMiddleware');

const getOrders = async (req, res, next) => {
  try {
    const statuses = req.query.status
      ? req.query.status.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const orders = await reportService.listOrders(req.query.limit, 'asc', {
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
    const { status, kitchen_employee_id: kitchenEmployeeId } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status é obrigatório.' });
    }

    assertStatusPermission(req, status);

    const order = await reportService.updateOrderStatus(req.params.id, status, {
      kitchenEmployeeId
    });
    return res.json(order);
  } catch (err) {
    err.status = err.status || 400;
    return next(err);
  }
};

const updateOrderItems = async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!items) {
      return res.status(400).json({ error: 'items é obrigatório.' });
    }

    const order = await reportService.updateOrderItems(req.params.id, items);
    return res.json(order);
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const {
      orderType,
      customerName,
      tableNumber,
      items,
      orderNotes,
      orderDate
    } = req.body;
    const attendantOrderService = require('../services/attendantOrderService');
    const order = await attendantOrderService.createManualOrder({
      orderType,
      customerName,
      tableNumber,
      items,
      orderNotes,
      orderDate,
      employeeId: req.employee.id
    });
    return res.status(201).json(order);
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

const confirmOrderPayment = async (req, res, next) => {
  try {
    const { paymentMethod, amountPaid } = req.body;

    if (!paymentMethod) {
      return res.status(400).json({ error: 'paymentMethod é obrigatório.' });
    }

    const order = await reportService.confirmOrderPayment(req.params.id, {
      paymentMethod,
      amountPaid
    });
    return res.json(order);
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

module.exports = {
  getOrders,
  getOrderById,
  updateOrderStatus,
  updateOrderItems,
  createOrder,
  confirmOrderPayment
};
