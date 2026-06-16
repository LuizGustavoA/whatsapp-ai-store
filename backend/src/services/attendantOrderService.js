const db = require('../../database/connection');
const Product = require('../models/Product');
const Conversation = require('../../models/Conversation');
const Customer = require('../models/Customer');
const dailyOrderService = require('./dailyOrderService');

const VALID_ORDER_TYPES = ['delivery', 'local', 'whatsapp'];

const buildSyntheticPhone = (orderType, identifier) => {
  const prefix = { local: 'L', delivery: 'E', whatsapp: 'W' }[orderType] || 'P';
  const slug = String(identifier || 'X')
    .replace(/\W/g, '')
    .slice(0, 6)
    .toUpperCase();
  const suffix = Date.now().toString(36).slice(-6);
  return `${prefix}${slug}${suffix}`;
};

const mapOrderRow = (order, items) => ({
  id: order.id,
  subtotalAmount: Number(order.subtotal_amount),
  discountAmount: Number(order.discount_amount),
  cashbackUsed: Number(order.cashback_used),
  totalAmount: Number(order.total_amount),
  status: order.status,
  orderType: order.order_type,
  tableNumber: order.table_number,
  displayName: order.display_name,
  orderNotes: order.order_notes,
  wasModified: order.was_modified,
  modifiedAt: order.modified_at,
  orderDate: order.order_date,
  dailyOrderNumber: order.daily_order_number,
  paymentMethod: order.payment_method,
  paymentConfirmed: order.payment_confirmed || false,
  amountPaid: order.amount_paid != null ? Number(order.amount_paid) : null,
  changeAmount: order.change_amount != null ? Number(order.change_amount) : null,
  paymentConfirmedAt: order.payment_confirmed_at,
  phoneNumber: order.phone_number,
  customerName: order.customer_name || order.display_name,
  attendantEmployeeName: order.attendant_employee_name || null,
  createdAt: order.created_at,
  items: items.map((item) => ({
    id: item.id,
    productId: item.product_id,
    productName: item.product_name,
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    notes: item.notes || null,
    lineTotal: Number(item.unit_price) * item.quantity
  }))
});

const createManualOrder = async ({
  orderType,
  customerName,
  tableNumber,
  items,
  orderNotes,
  orderDate,
  employeeId
}) => {
  if (!VALID_ORDER_TYPES.includes(orderType)) {
    throw new Error('Tipo de pedido inválido. Use: delivery, local ou whatsapp.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Adicione ao menos um produto ao pedido.');
  }

  if (orderType === 'local') {
    if (!tableNumber?.trim()) {
      throw new Error('Informe o número da mesa.');
    }
  } else if (!customerName?.trim()) {
    throw new Error('Informe o nome do cliente.');
  }

  let attendantEmployeeId = null;

  if (employeeId != null && employeeId !== '') {
    const employeeResult = await db.query(
      `SELECT id FROM employees WHERE id = $1 AND status = 'active'`,
      [Number(employeeId)]
    );

    if (employeeResult.rows.length === 0) {
      throw new Error('Funcionário selecionado não encontrado ou inativo.');
    }

    attendantEmployeeId = employeeResult.rows[0].id;
  }

  const normalizedItems = items.map((item) => ({
    productId: Number(item.productId),
    quantity: Math.max(1, Number(item.quantity) || 1),
    notes: item.notes?.trim() || null
  }));

  const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
  const products = await Product.findActiveByIds(productIds);
  const productMap = new Map(products.map((product) => [product.id, product]));

  for (const item of normalizedItems) {
    if (!productMap.has(item.productId)) {
      throw new Error(`Produto ID ${item.productId} não encontrado ou inativo.`);
    }
  }

  const displayName =
    orderType === 'local'
      ? `Mesa ${tableNumber.trim()}`
      : customerName.trim();

  const phoneKey =
    orderType === 'local' ? `MESA_${tableNumber.trim()}` : displayName.replace(/\s+/g, '_');

  const syntheticPhone = buildSyntheticPhone(orderType, phoneKey);
  const conversation = await Conversation.findOrCreateByPhoneNumber(syntheticPhone);

  if (orderType !== 'local') {
    await Customer.findOrCreateByPhoneNumber(syntheticPhone);
    await db.query(
      `UPDATE customers SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE phone_number = $1`,
      [syntheticPhone, displayName]
    );
  }

  let subtotalAmount = 0;

  for (const item of normalizedItems) {
    const product = productMap.get(item.productId);
    const unitPrice = Product.getEffectivePrice(product);
    subtotalAmount += unitPrice * item.quantity;
  }

  await db.query('BEGIN');

  try {
    const businessDate = orderDate || dailyOrderService.formatDateInput();
    const { dailyOrderNumber } = await dailyOrderService.reserveDailyOrderNumber(businessDate, db);

    const orderResult = await db.query(
      `INSERT INTO orders (
         conversation_id, subtotal_amount, discount_amount, cashback_used,
         total_amount, status, order_type, table_number, display_name, order_notes,
         order_date, daily_order_number, attendant_employee_id
       )
       VALUES ($1, $2, 0, 0, $2, 'paid', $3, $4, $5, $6, $7::date, $8, $9)
       RETURNING *`,
      [
        conversation.id,
        subtotalAmount,
        orderType,
        orderType === 'local' ? tableNumber.trim() : null,
        displayName,
        orderNotes?.trim() || null,
        businessDate,
        dailyOrderNumber,
        attendantEmployeeId
      ]
    );

    const order = orderResult.rows[0];

    for (const item of normalizedItems) {
      const product = productMap.get(item.productId);
      const unitPrice = Product.getEffectivePrice(product);

      await db.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.productId, item.quantity, unitPrice, item.notes]
      );
    }

    await db.query('COMMIT');

    const detail = await db.query(
      `SELECT
         o.*,
         c.phone_number,
         cust.name AS customer_name,
         ae.name AS attendant_employee_name
       FROM orders o
       JOIN conversations c ON c.id = o.conversation_id
       LEFT JOIN customers cust ON cust.phone_number = c.phone_number
       LEFT JOIN employees ae ON ae.id = o.attendant_employee_id
       WHERE o.id = $1`,
      [order.id]
    );

    const itemsResult = await db.query(
      `SELECT oi.*, p.name AS product_name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [order.id]
    );

    return mapOrderRow(detail.rows[0], itemsResult.rows);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};

module.exports = {
  createManualOrder,
  VALID_ORDER_TYPES,
  mapOrderRow
};
