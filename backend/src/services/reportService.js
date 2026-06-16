const db = require('../../database/connection');
const Product = require('../models/Product');
const { isValidPaymentMethod } = require('../constants/paymentMethods');
const financialConfigService = require('./financialConfigService');
const employeeService = require('./employeeService');

const PAID_STATUSES = ['paid', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

const parseDateRange = (from, to) => {
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to ? new Date(to) : now;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Parâmetros "from" ou "to" inválidos. Use formato ISO (YYYY-MM-DD).');
  }

  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const getSalesReport = async ({ from, to } = {}) => {
  const { start, end } = parseDateRange(from, to);

  const summaryResult = await db.query(
    `SELECT
       COUNT(*)::int AS order_count,
       COALESCE(SUM(total_amount), 0)::float AS total_sales,
       COALESCE(AVG(total_amount), 0)::float AS average_ticket,
       COALESCE(SUM(cashback_used), 0)::float AS total_cashback_used
     FROM orders
     WHERE status = ANY($1::text[])
       AND created_at >= $2
       AND created_at <= $3`,
    [PAID_STATUSES, start, end]
  );

  const topProductsResult = await db.query(
    `SELECT
       p.id AS product_id,
       p.name AS product_name,
       SUM(oi.quantity)::int AS total_quantity,
       SUM(oi.quantity * oi.unit_price)::float AS total_revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     WHERE o.status = ANY($1::text[])
       AND o.created_at >= $2
       AND o.created_at <= $3
     GROUP BY p.id, p.name
     ORDER BY total_quantity DESC
     LIMIT 10`,
    [PAID_STATUSES, start, end]
  );

  const summary = summaryResult.rows[0];

  return {
    period: {
      from: start.toISOString(),
      to: end.toISOString()
    },
    orderCount: summary.order_count,
    totalSales: Number(summary.total_sales),
    averageTicket: Number(Number(summary.average_ticket).toFixed(2)),
    totalCashbackUsed: Number(summary.total_cashback_used),
    topProducts: topProductsResult.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      totalQuantity: row.total_quantity,
      totalRevenue: Number(row.total_revenue)
    }))
  };
};

const getOwnerDashboardReport = async () => {
  const financial = await getFinancialDashboardReport();
  const employeeOverview = await employeeService.getEmployeesDashboardOverview();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const [
    dailySalesResult,
    serviceTimeResult,
    tableTurnsResult,
    recurringResult,
    wasteResult
  ] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(total_amount) FILTER (
           WHERE created_at >= $2 AND created_at <= $3
         ), 0)::float AS today_revenue,
         COALESCE(SUM(total_amount) FILTER (
           WHERE created_at >= $4 AND created_at <= $5
         ), 0)::float AS yesterday_revenue
       FROM orders
       WHERE status = ANY($1::text[])
         AND created_at >= $6
         AND created_at <= $7`,
      [
        PAID_STATUSES,
        todayStart,
        todayEnd,
        yesterdayStart,
        yesterdayEnd,
        monthStart,
        monthEnd
      ]
    ),
    db.query(
      `SELECT
         COALESCE(o.order_type, 'whatsapp') AS channel,
         AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 60)::float AS avg_minutes
       FROM orders o
       WHERE o.status = ANY($1::text[])
         AND o.created_at >= $2
         AND o.created_at <= $3
         AND o.updated_at > o.created_at
         AND o.status IN ('ready', 'out_for_delivery', 'delivered')
       GROUP BY COALESCE(o.order_type, 'whatsapp')`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `SELECT
         COUNT(DISTINCT CASE
           WHEN o.order_type = 'local' THEN
             'local-' || COALESCE(o.table_number::text, o.id::text) || '-' ||
             COALESCE(o.order_date, o.created_at::date)::text
           ELSE NULL
         END)::int AS local_comandas,
         COUNT(*) FILTER (WHERE o.order_type = 'delivery')::int AS delivery_orders,
         COUNT(*) FILTER (WHERE o.order_type = 'whatsapp')::int AS whatsapp_orders
       FROM orders o
       WHERE o.status = ANY($1::text[])
         AND o.created_at >= $2
         AND o.created_at <= $3`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total_clients,
         COUNT(*) FILTER (WHERE order_count > 1)::int AS recurring_clients
       FROM (
         SELECT
           CASE
             WHEN o.order_type = 'local' THEN
               'mesa-' || COALESCE(o.table_number::text, o.display_name, o.id::text)
             ELSE COALESCE(c.phone_number, o.display_name, 'pedido-' || o.id::text)
           END AS client_key,
           COUNT(*)::int AS order_count
         FROM orders o
         LEFT JOIN conversations c ON c.id = o.conversation_id
         WHERE o.status = ANY($1::text[])
           AND o.created_at >= $2
           AND o.created_at <= $3
         GROUP BY 1
       ) clients`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `WITH modified_orders AS (
         SELECT o.id, o.total_amount
         FROM orders o
         WHERE o.status = ANY($1::text[])
           AND o.created_at >= $2
           AND o.created_at <= $3
           AND o.was_modified = true
       )
       SELECT
         COUNT(*)::int AS modified_orders,
         COALESCE(SUM(m.total_amount), 0)::float AS modified_revenue,
         COALESCE((
           SELECT SUM(oi.quantity * COALESCE(p.unit_cost, oi.unit_price * 0.35))
           FROM order_items oi
           INNER JOIN modified_orders mo ON mo.id = oi.order_id
           INNER JOIN products p ON p.id = oi.product_id
         ), 0)::float AS estimated_waste_cost
       FROM modified_orders m`,
      [PAID_STATUSES, monthStart, monthEnd]
    )
  ]);

  const grossRevenue = financial.kpis.grossRevenue;
  const payrollTotal = employeeOverview.kpis.payrollTotal || 0;
  const operationalProfit = financial.margins.operationalProfit;
  const estimatedNetProfit =
    operationalProfit != null
      ? Number((operationalProfit - payrollTotal).toFixed(2))
      : null;

  const breakEvenMonthly = financial.margins.breakEven?.monthly;
  const revenueTarget =
    financial.config?.goals?.monthlyRevenueTarget ?? breakEvenMonthly ?? null;
  const targetProgressPercent =
    revenueTarget != null && revenueTarget > 0
      ? Number(((grossRevenue / revenueTarget) * 100).toFixed(1))
      : null;

  const breakEvenProgressPercent =
    breakEvenMonthly != null && breakEvenMonthly > 0
      ? Number(((grossRevenue / breakEvenMonthly) * 100).toFixed(1))
      : null;

  const cmvFromSales = financial.margins.cmvFromSales;
  const cmvTargetPercent = financial.config?.cmv?.targetPercent;
  let cmvValue = null;

  if (cmvFromSales != null && cmvFromSales > 0) {
    cmvValue = cmvFromSales;
  } else if (cmvTargetPercent != null && grossRevenue > 0) {
    cmvValue = grossRevenue * (cmvTargetPercent / 100);
  } else if (
    financial.costs.cmvReal != null &&
    grossRevenue > 0 &&
    financial.costs.cmvReal <= grossRevenue
  ) {
    cmvValue = financial.costs.cmvReal;
  }

  const cmvPercent =
    cmvValue != null && grossRevenue > 0
      ? Number(((cmvValue / grossRevenue) * 100).toFixed(1))
      : null;
  const laborPercent = employeeOverview.kpis.laborCostPercent;
  const occupationalCosts = financial.costs.occupationalCosts || 0;
  const occupationalPercent =
    grossRevenue > 0 && occupationalCosts > 0
      ? Number(((occupationalCosts / grossRevenue) * 100).toFixed(1))
      : null;

  const bigThreeSum = [cmvPercent, laborPercent, occupationalPercent]
    .filter((value) => value != null)
    .reduce((sum, value) => sum + value, 0);

  const dailySales = dailySalesResult.rows[0];
  const tableTurns = tableTurnsResult.rows[0];
  const recurring = recurringResult.rows[0];
  const waste = wasteResult.rows[0] || {
    modified_orders: 0,
    modified_revenue: 0,
    estimated_waste_cost: 0
  };

  const serviceTimeMap = Object.fromEntries(
    serviceTimeResult.rows.map((row) => [row.channel, Number(row.avg_minutes)])
  );
  const serviceTimes = serviceTimeResult.rows.map((row) => Number(row.avg_minutes));
  const avgServiceTimeMinutes =
    serviceTimes.length > 0
      ? Number(
          (serviceTimes.reduce((sum, value) => sum + value, 0) / serviceTimes.length).toFixed(1)
        )
      : null;

  const channelTotalRevenue = financial.salesByChannel.reduce(
    (sum, row) => sum + row.revenue,
    0
  );
  const channelMix = financial.salesByChannel.map((row) => ({
    channel: row.channel,
    orderCount: row.orderCount,
    revenue: row.revenue,
    sharePercent:
      channelTotalRevenue > 0
        ? Number(((row.revenue / channelTotalRevenue) * 100).toFixed(1))
        : 0
  }));

  const recurringRate =
    recurring.total_clients > 0
      ? Number(((recurring.recurring_clients / recurring.total_clients) * 100).toFixed(1))
      : null;

  return {
    period: financial.period,
    survival: {
      grossRevenueAccumulated: grossRevenue,
      revenueTarget,
      targetProgressPercent,
      targetSource: financial.config?.goals?.monthlyRevenueTarget
        ? 'goal'
        : breakEvenMonthly
          ? 'break_even'
          : null,
      todayRevenue: Number(dailySales.today_revenue),
      yesterdayRevenue: Number(dailySales.yesterday_revenue),
      estimatedNetProfit,
      breakEvenMonthly,
      breakEvenProgressPercent,
      breakEvenReached: breakEvenProgressPercent != null && breakEvenProgressPercent >= 100,
      daysElapsed: financial.period.daysElapsed,
      daysInMonth: financial.period.daysInMonth || new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    },
    bigThree: {
      cmvPercent,
      cmvTargetRange: { min: 28, max: 35 },
      laborPercent,
      laborTargetRange: { min: 20, max: 26 },
      occupationalPercent,
      occupationalTargetRange: { max: 10 },
      combinedPercent: bigThreeSum > 0 ? Number(bigThreeSum.toFixed(1)) : null,
      criticalAlert: bigThreeSum > 70
    },
    operations: {
      localComandas: tableTurns.local_comandas,
      deliveryOrders: tableTurns.delivery_orders,
      whatsappOrders: tableTurns.whatsapp_orders,
      totalOrders: financial.kpis.orderVolume,
      avgTicketGeneral: financial.kpis.avgTicketPerComanda || financial.kpis.avgTicketPerOrder,
      avgServiceTimeMinutes,
      serviceTimeByChannel: {
        local: serviceTimeMap.local ?? null,
        delivery: serviceTimeMap.delivery ?? null,
        whatsapp: serviceTimeMap.whatsapp ?? null
      },
      wasteIndex: {
        modifiedOrders: waste.modified_orders,
        estimatedWasteValue: Number(Number(waste.estimated_waste_cost).toFixed(2)),
        modifiedRevenue: Number(waste.modified_revenue)
      }
    },
    channelsAndClients: {
      channelMix,
      averageRating: null,
      recurringCustomersRate: recurringRate,
      recurringCustomers: recurring.recurring_clients,
      totalCustomers: recurring.total_clients
    },
    dataNotes: {
      revenueTarget:
        revenueTarget == null
          ? 'Defina a meta mensal no Dashboard Financeiro ou configure custos para calcular o ponto de equilíbrio.'
          : financial.config?.goals?.monthlyRevenueTarget
            ? 'Meta mensal configurada em objetivos financeiros.'
            : 'Meta estimada pelo ponto de equilíbrio do mês.',
      estimatedNetProfit:
        estimatedNetProfit == null
          ? 'Configure CMV, custos fixos e funcionários para estimar o lucro líquido.'
          : 'Lucro operacional menos folha de pagamento do mês.',
      averageRating:
        'Integração com Google Maps, iFood ou feedback interno ainda não configurada.',
      wasteIndex:
        'Estimativa com base em pedidos modificados e custo dos produtos envolvidos.',
      serviceTime:
        'Tempo médio desde a criação do pedido até ficar pronto ou entregue (aproximação).'
    }
  };
};

const getDashboardReport = getOwnerDashboardReport;


const listOrders = async (limit = 200, sort = 'desc', filters = {}) => {
  const orderDirection = sort === 'asc' ? 'ASC' : 'DESC';
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(`(
      CAST(o.id AS TEXT) ILIKE $${paramIndex}
      OR CAST(o.daily_order_number AS TEXT) ILIKE $${paramIndex}
      OR COALESCE(cust.name, o.display_name, '') ILIKE $${paramIndex}
      OR c.phone_number ILIKE $${paramIndex}
    )`);
    params.push(`%${filters.search.trim()}%`);
    paramIndex += 1;
  }

  if (filters.dailyNumber) {
    conditions.push(`o.daily_order_number = $${paramIndex}`);
    params.push(Number(filters.dailyNumber));
    paramIndex += 1;
  }

  if (filters.statuses?.length) {
    conditions.push(`o.status = ANY($${paramIndex}::text[])`);
    params.push(filters.statuses);
    paramIndex += 1;
  }

  if (filters.modified === true || filters.modified === 'true') {
    conditions.push('o.was_modified = true');
  }

  if (filters.date) {
    conditions.push(`COALESCE(o.order_date, o.created_at::date) = $${paramIndex}::date`);
    params.push(filters.date);
    paramIndex += 1;
  }

  if (filters.hourFrom) {
    conditions.push(`o.created_at::time >= $${paramIndex}::time`);
    params.push(filters.hourFrom);
    paramIndex += 1;
  }

  if (filters.hourTo) {
    conditions.push(`o.created_at::time <= $${paramIndex}::time`);
    params.push(filters.hourTo);
    paramIndex += 1;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitParam = paramIndex;
  params.push(Math.min(Number(limit) || 200, 500));

  const result = await db.query(
    `SELECT
       o.id,
       o.total_amount,
       o.status,
       o.order_type,
       o.table_number,
       o.display_name,
       o.was_modified,
       o.modified_at,
       o.order_date,
       o.daily_order_number,
       o.payment_method,
       o.payment_confirmed,
       o.amount_paid,
       o.change_amount,
       o.payment_confirmed_at,
       o.created_at,
       c.phone_number,
       cust.name AS customer_name,
       ae.name AS attendant_employee_name
     FROM orders o
     JOIN conversations c ON c.id = o.conversation_id
     LEFT JOIN customers cust ON cust.phone_number = c.phone_number
     LEFT JOIN employees ae ON ae.id = o.attendant_employee_id
     ${whereClause}
     ORDER BY o.created_at ${orderDirection}
     LIMIT $${limitParam}`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    totalAmount: Number(row.total_amount),
    status: row.status,
    orderType: row.order_type || 'whatsapp',
    tableNumber: row.table_number,
    displayName: row.display_name,
    wasModified: row.was_modified || false,
    modifiedAt: row.modified_at,
    orderDate: row.order_date,
    dailyOrderNumber: row.daily_order_number,
    paymentMethod: row.payment_method,
    paymentConfirmed: row.payment_confirmed || false,
    amountPaid: row.amount_paid != null ? Number(row.amount_paid) : null,
    changeAmount: row.change_amount != null ? Number(row.change_amount) : null,
    paymentConfirmedAt: row.payment_confirmed_at,
    phoneNumber: row.phone_number,
    customerName: row.customer_name || row.display_name,
    attendantEmployeeName: row.attendant_employee_name || null,
    createdAt: row.created_at
  }));
};

const VALID_STATUSES = [
  'pending',
  'paid',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered'
];

const getOrderDetail = async (orderId) => {
  const orderResult = await db.query(
    `SELECT
       o.id,
       o.subtotal_amount,
       o.discount_amount,
       o.cashback_used,
       o.total_amount,
       o.status,
       o.order_type,
       o.table_number,
       o.display_name,
       o.order_notes,
       o.was_modified,
       o.modified_at,
       o.order_date,
       o.daily_order_number,
       o.payment_method,
       o.payment_confirmed,
       o.amount_paid,
       o.change_amount,
       o.payment_confirmed_at,
       o.created_at,
       c.phone_number,
       cust.name AS customer_name,
       ae.name AS attendant_employee_name
     FROM orders o
     JOIN conversations c ON c.id = o.conversation_id
     LEFT JOIN customers cust ON cust.phone_number = c.phone_number
     LEFT JOIN employees ae ON ae.id = o.attendant_employee_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    return null;
  }

  const order = orderResult.rows[0];

  const itemsResult = await db.query(
    `SELECT
       oi.id,
       oi.product_id,
       oi.quantity,
       oi.unit_price,
       oi.notes,
       p.name AS product_name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC`,
    [orderId]
  );

  return {
    id: order.id,
    subtotalAmount: Number(order.subtotal_amount),
    discountAmount: Number(order.discount_amount),
    cashbackUsed: Number(order.cashback_used),
    totalAmount: Number(order.total_amount),
    status: order.status,
    orderType: order.order_type || 'whatsapp',
    tableNumber: order.table_number,
    displayName: order.display_name,
    orderNotes: order.order_notes,
    wasModified: order.was_modified || false,
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
    items: itemsResult.rows.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      notes: item.notes || null,
      lineTotal: Number(item.unit_price) * item.quantity
    }))
  };
};

const updateOrderStatus = async (orderId, status, options = {}) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Status inválido. Use: ${VALID_STATUSES.join(', ')}`);
  }

  const order = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

  if (order.rows.length === 0) {
    throw new Error('Pedido não encontrado.');
  }

  const current = order.rows[0];

  if (current.status === status) {
    return getOrderDetail(orderId);
  }

  let kitchenEmployeeId = null;

  if (status === 'ready' && options.kitchenEmployeeId != null && options.kitchenEmployeeId !== '') {
    const employeeResult = await db.query(
      `SELECT id FROM employees WHERE id = $1 AND status = 'active'`,
      [Number(options.kitchenEmployeeId)]
    );

    if (employeeResult.rows.length === 0) {
      throw new Error('Funcionário de cozinha não encontrado ou inativo.');
    }

    kitchenEmployeeId = employeeResult.rows[0].id;
  }

  await db.query('BEGIN');

  try {
    if (status === 'out_for_delivery') {
      const existingDelivery = await db.query(
        `SELECT id FROM deliveries
         WHERE order_id = $1 AND status != 'delivered'
         ORDER BY created_at DESC
         LIMIT 1`,
        [orderId]
      );

      if (existingDelivery.rows.length === 0) {
        await db.query(
          `INSERT INTO deliveries (order_id, courier_name, status)
           VALUES ($1, $2, 'assigned')`,
          [orderId, 'Painel Admin']
        );
      }
    }

    if (status === 'delivered') {
      await db.query(
        `UPDATE deliveries
         SET status = 'delivered', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status != 'delivered'`,
        [orderId]
      );
    }

    await db.query(
      `UPDATE orders
       SET status = $2,
           kitchen_employee_id = CASE
             WHEN $3::int IS NOT NULL THEN $3::int
             ELSE kitchen_employee_id
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId, status, kitchenEmployeeId]
    );

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return getOrderDetail(orderId);
};

const recalculateOrderTotals = async (orderId, client = db) => {
  const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);

  if (orderResult.rows.length === 0) {
    throw new Error('Pedido não encontrado.');
  }

  const order = orderResult.rows[0];

  const itemsResult = await client.query(
    `SELECT COALESCE(SUM(quantity * unit_price), 0)::float AS subtotal
     FROM order_items
     WHERE order_id = $1`,
    [orderId]
  );

  const subtotal = Number(itemsResult.rows[0].subtotal);
  const cashbackUsed = Math.min(Number(order.cashback_used), subtotal);
  const totalAmount = Number(Math.max(subtotal - cashbackUsed, 0).toFixed(2));

  await client.query(
    `UPDATE orders
     SET subtotal_amount = $2,
         cashback_used = $3,
         discount_amount = $3,
         total_amount = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [orderId, subtotal, cashbackUsed, totalAmount]
  );
};

const updateOrderItems = async (orderId, items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('O pedido deve ter ao menos um item.');
  }

  const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

  if (orderResult.rows.length === 0) {
    throw new Error('Pedido não encontrado.');
  }

  const order = orderResult.rows[0];

  if (order.status === 'delivered') {
    throw new Error('Não é possível alterar itens de um pedido já entregue.');
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

  await db.query('BEGIN');

  try {
    await db.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

    for (const item of normalizedItems) {
      const product = productMap.get(item.productId);
      const unitPrice = Product.getEffectivePrice(product);

      await db.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.productId, item.quantity, unitPrice, item.notes]
      );
    }

    await recalculateOrderTotals(orderId, db);

    await db.query(
      `UPDATE orders
       SET was_modified = true, modified_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId]
    );

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return getOrderDetail(orderId);
};

const updateOrderPaymentMethod = async (orderId, paymentMethod) => {
  if (!isValidPaymentMethod(paymentMethod)) {
    throw new Error('Forma de pagamento inválida. Use: debito, dinheiro, pix, credito, ifood ou outros.');
  }

  const order = await db.query('SELECT id FROM orders WHERE id = $1', [orderId]);

  if (order.rows.length === 0) {
    throw new Error('Pedido não encontrado.');
  }

  await db.query(
    `UPDATE orders
     SET payment_method = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [orderId, paymentMethod]
  );

  return getOrderDetail(orderId);
};

const PAYMENT_CONFIRMABLE_STATUSES = ['ready', 'delivered'];

const confirmOrderPayment = async (orderId, { paymentMethod, amountPaid }) => {
  if (!isValidPaymentMethod(paymentMethod)) {
    throw new Error('Forma de pagamento inválida. Use: debito, dinheiro, pix, credito, ifood ou outros.');
  }

  const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);

  if (orderResult.rows.length === 0) {
    throw new Error('Pedido não encontrado.');
  }

  const order = orderResult.rows[0];

  if (order.payment_confirmed) {
    throw new Error('Pagamento deste pedido já foi confirmado.');
  }

  if (!PAYMENT_CONFIRMABLE_STATUSES.includes(order.status)) {
    throw new Error('Só é possível confirmar pagamento de pedidos prontos ou entregues.');
  }

  let parsedAmountPaid = null;
  let changeAmount = null;

  if (paymentMethod === 'dinheiro') {
    parsedAmountPaid = Number(amountPaid);

    if (!Number.isFinite(parsedAmountPaid) || parsedAmountPaid <= 0) {
      throw new Error('Informe o valor recebido em dinheiro.');
    }

    if (parsedAmountPaid < Number(order.total_amount)) {
      throw new Error('O valor recebido deve ser maior ou igual ao total do pedido.');
    }

    changeAmount = Number((parsedAmountPaid - Number(order.total_amount)).toFixed(2));
  }

  await db.query(
    `UPDATE orders
     SET payment_method = $2,
         payment_confirmed = true,
         amount_paid = $3,
         change_amount = $4,
         payment_confirmed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [orderId, paymentMethod, parsedAmountPaid, changeAmount]
  );

  return getOrderDetail(orderId);
};

const DAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

const formatNoteCurrency = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const getFinancialDashboardReport = async () => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const daysElapsed = Math.max(1, now.getDate());
  const daysInMonth = monthEnd.getDate();

  const config = await financialConfigService.getConfig();

  const [summaryResult, channelResult, dailyResult, productsResult, paymentResult, comandaResult, cmvSalesResult] =
    await Promise.all([
    db.query(
      `SELECT
         COUNT(*)::int AS order_count,
         COALESCE(SUM(total_amount), 0)::float AS gross_revenue,
         COALESCE(SUM(discount_amount + cashback_used), 0)::float AS tracked_deductions,
         COALESCE(AVG(total_amount), 0)::float AS average_ticket
       FROM orders
       WHERE status = ANY($1::text[])
         AND created_at >= $2
         AND created_at <= $3`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `SELECT
         COALESCE(o.order_type, 'whatsapp') AS channel,
         COUNT(*)::int AS order_count,
         COALESCE(SUM(o.total_amount), 0)::float AS revenue
       FROM orders o
       WHERE o.status = ANY($1::text[])
         AND o.created_at >= $2
         AND o.created_at <= $3
       GROUP BY COALESCE(o.order_type, 'whatsapp')
       ORDER BY revenue DESC`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `SELECT
         EXTRACT(DOW FROM o.created_at)::int AS dow,
         COUNT(*)::int AS order_count,
         COALESCE(SUM(o.total_amount), 0)::float AS revenue
       FROM orders o
       WHERE o.status = ANY($1::text[])
         AND o.created_at >= $2
         AND o.created_at <= $3
       GROUP BY EXTRACT(DOW FROM o.created_at)
       ORDER BY dow`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `SELECT
         p.id AS product_id,
         p.name AS product_name,
         p.unit_cost,
         SUM(oi.quantity)::int AS total_quantity,
         SUM(oi.quantity * oi.unit_price)::float AS total_revenue,
         AVG(oi.unit_price)::float AS avg_sale_price
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.status = ANY($1::text[])
         AND o.created_at >= $2
         AND o.created_at <= $3
       GROUP BY p.id, p.name, p.unit_cost
       ORDER BY total_quantity DESC
       LIMIT 15`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `SELECT
         CASE
           WHEN payment_method IS NULL THEN '__unassigned__'
           ELSE payment_method
         END AS payment_method,
         COALESCE(SUM(total_amount), 0)::float AS revenue
       FROM orders
       WHERE status = ANY($1::text[])
         AND created_at >= $2
         AND created_at <= $3
       GROUP BY 1`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `SELECT COALESCE(AVG(comanda_total), 0)::float AS avg_ticket_per_comanda
       FROM (
         SELECT
           CASE
             WHEN o.order_type = 'local' AND o.table_number IS NOT NULL THEN
               'local-' || o.table_number::text || '-' || COALESCE(o.order_date, o.created_at::date)::text
             ELSE 'order-' || o.id::text
           END AS comanda_key,
           SUM(o.total_amount)::float AS comanda_total
         FROM orders o
         WHERE o.status = ANY($1::text[])
           AND o.created_at >= $2
           AND o.created_at <= $3
         GROUP BY comanda_key
       ) comandas`,
      [PAID_STATUSES, monthStart, monthEnd]
    ),
    db.query(
      `SELECT COALESCE(SUM(oi.quantity * p.unit_cost), 0)::float AS cmv_from_sales
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.status = ANY($1::text[])
         AND o.created_at >= $2
         AND o.created_at <= $3
         AND p.unit_cost IS NOT NULL`,
      [PAID_STATUSES, monthStart, monthEnd]
    )
  ]);

  const summary = summaryResult.rows[0];
  const grossRevenue = Number(summary.gross_revenue);
  const trackedDeductions = Number(summary.tracked_deductions);

  const revenueByPayment = paymentResult.rows.reduce((acc, row) => {
    acc[row.payment_method] = Number(row.revenue);
    return acc;
  }, {});

  const salesDeductionsDetail = financialConfigService.calculateSalesDeductions(
    grossRevenue,
    trackedDeductions,
    revenueByPayment,
    config.salesTaxes
  );

  const netRevenue = Number((grossRevenue - salesDeductionsDetail.total).toFixed(2));
  const cmvReal = financialConfigService.calculateCmvReal(config.cmv);
  const cmvFromSales = Number(cmvSalesResult.rows[0].cmv_from_sales);
  const occupationalCosts = financialConfigService.calculateOccupationalCosts(config.occupational);
  const operatingExpenses = financialConfigService.calculateOperatingExpenses(config.operatingExpenses);
  const capex = config.capex.value;

  const cmvPercent =
    cmvReal != null && netRevenue > 0
      ? Number(((cmvReal / netRevenue) * 100).toFixed(1))
      : null;

  const effectiveMargin = financialConfigService.getEffectiveMarginMetrics(netRevenue, {
    cmvReal,
    cmvFromSales,
    cmvTargetPercent: config.cmv.targetPercent
  });

  const contributionMarginReais = effectiveMargin.marginReais;
  const contributionMarginPercent = effectiveMargin.marginPercent;

  const totalFixedCosts = (occupationalCosts || 0) + (operatingExpenses || 0);
  const breakEven = financialConfigService.calculateBreakEven({
    fixedCosts: totalFixedCosts,
    marginPercent: contributionMarginPercent,
    daysInMonth
  });

  const operationalProfit =
    contributionMarginReais != null
      ? Number((contributionMarginReais - (occupationalCosts || 0) - (operatingExpenses || 0)).toFixed(2))
      : null;

  const dailyCost =
    totalFixedCosts > 0 ? Number((totalFixedCosts / daysInMonth).toFixed(2)) : null;

  const dailyMap = new Map(
    dailyResult.rows.map((row) => [Number(row.dow), {
      orderCount: row.order_count,
      revenue: Number(row.revenue)
    }])
  );

  const dailyComparison = DAY_NAMES.map((dayName, index) => ({
    dayName,
    revenue: dailyMap.get(index)?.revenue || 0,
    cost: dailyCost,
    orderCount: dailyMap.get(index)?.orderCount || 0
  }));

  const products = productsResult.rows.map((row) => {
    const totalQuantity = row.total_quantity;
    const totalRevenue = Number(row.total_revenue);
    const avgSalePrice = Number(row.avg_sale_price);
    const unitCost = row.unit_cost != null ? Number(row.unit_cost) : null;
    const profitPerUnit =
      unitCost != null ? Number((avgSalePrice - unitCost).toFixed(2)) : null;
    const totalCost =
      unitCost != null ? Number((unitCost * totalQuantity).toFixed(2)) : null;
    const totalProfit =
      profitPerUnit != null ? Number((profitPerUnit * totalQuantity).toFixed(2)) : null;
    const markupPercent =
      profitPerUnit != null && avgSalePrice > 0
        ? Number(((profitPerUnit / avgSalePrice) * 100).toFixed(1))
        : null;

    return {
      productId: row.product_id,
      productName: row.product_name,
      totalQuantity,
      totalRevenue,
      avgSalePrice,
      unitCost,
      totalCost,
      profitPerUnit,
      totalProfit,
      markupPercent
    };
  });

  const topByVolume = [...products].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 10);
  const topByProfitability = [...products]
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10);

  const avgTicketPerComanda = Number(Number(comandaResult.rows[0].avg_ticket_per_comanda).toFixed(2));

  return {
    period: {
      label: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      from: monthStart.toISOString(),
      to: monthEnd.toISOString(),
      daysElapsed,
      daysInMonth
    },
    config,
    kpis: {
      grossRevenue,
      salesDeductions: salesDeductionsDetail.total,
      salesDeductionsBreakdown: salesDeductionsDetail,
      netRevenue,
      orderVolume: summary.order_count,
      avgDailyRevenue: Number((grossRevenue / daysElapsed).toFixed(2)),
      avgTicketPerOrder: Number(Number(summary.average_ticket).toFixed(2)),
      avgTicketPerComanda
    },
    costs: {
      cmvReal,
      cmvPercent,
      occupationalCosts,
      operatingExpenses,
      capex
    },
    margins: {
      contributionMargin: contributionMarginReais,
      contributionMarginPercent,
      contributionMarginSource: effectiveMargin.source,
      cmvFromSales: cmvFromSales > 0 ? cmvFromSales : null,
      dailyComparison,
      breakEven,
      operationalProfit
    },
    salesByChannel: channelResult.rows.map((row) => ({
      channel: row.channel,
      orderCount: row.order_count,
      revenue: Number(row.revenue)
    })),
    menuEngineering: {
      topByVolume,
      topByProfitability
    },
    dataNotes: {
      salesDeductions: (() => {
        const unassigned = salesDeductionsDetail.revenueByPayment?.__unassigned__ || 0;
        const hasTaxes = salesDeductionsDetail.taxDeductions > 0;

        if (hasTaxes && unassigned > 0 && config.salesTaxes.unassignedRate <= 0) {
          return (
            `Taxas aplicadas sobre vendas com forma de pagamento. ` +
            `${formatNoteCurrency(unassigned)} ainda sem pagamento informado — ` +
            `confirme no painel atendente ou configure "Taxa vendas sem pagamento".`
          );
        }

        if (!hasTaxes && grossRevenue > 0) {
          return (
            'Nenhuma taxa calculada: não há vendas em crédito, débito ou iFood no período, ' +
            'ou configure a taxa para vendas sem pagamento informado.'
          );
        }

        if (hasTaxes) {
          return 'Inclui descontos/cashback do sistema e taxas configuradas por forma de pagamento.';
        }

        return 'Configure taxas pelo botão Alterar em Deduções de Vendas.';
      })(),
      pendingCosts:
        cmvReal == null
          ? 'Configure CMV real, custos ocupacionais e despesas operacionais pelos botões Alterar.'
          : null,
      breakEven: (() => {
        if (breakEven.monthly != null) {
          if (effectiveMargin.source === 'target') {
            return 'Ponto de equilíbrio calculado com base no CMV % estimado configurado.';
          }

          if (effectiveMargin.source === 'sales') {
            return 'Ponto de equilíbrio calculado com base nos custos dos produtos vendidos.';
          }

          return 'Ponto de equilíbrio calculado com base no CMV real e custos fixos do mês.';
        }

        if (totalFixedCosts <= 0) {
          return 'Configure custos ocupacionais e despesas operacionais para calcular o ponto de equilíbrio.';
        }

        if (cmvReal != null && cmvReal > netRevenue) {
          return (
            'CMV de inventário (R$ ' +
            formatNoteCurrency(cmvReal) +
            ') está acima do faturamento líquido. Informe o CMV % estimado no botão Alterar do CMV Real.'
          );
        }

        return 'Configure CMV % estimado ou custos dos produtos no cardápio para calcular o ponto de equilíbrio.';
      })()
    }
  };
};

const getEmployeesDashboardReport = async (employeeId = null) => {
  const overview = await employeeService.getEmployeesDashboardOverview();
  const selectedEmployeeId = employeeId ? Number(employeeId) : null;

  let selectedEmployee = null;

  if (selectedEmployeeId) {
    selectedEmployee = await employeeService.getEmployeeDashboardProfile(selectedEmployeeId);
  } else if (overview.employees.length > 0) {
    selectedEmployee = await employeeService.getEmployeeDashboardProfile(overview.employees[0].id);
  }

  return {
    ...overview,
    selectedEmployee,
    dataNotes: {
      general: null,
      headcount: 'Headcount e folha vêm dos funcionários cadastrados na aba Funcionários.',
      performance:
        selectedEmployee?.performance == null &&
        selectedEmployee?.roleCategory === 'kitchen_assistant'
          ? 'Auxiliar de cozinha não possui métricas de pedidos.'
          : selectedEmployee?.performance == null &&
              ['salon', 'kitchen'].includes(selectedEmployee?.roleCategory)
            ? 'Vincule pedidos ao funcionário no painel atendente para alimentar produtividade.'
            : null
    }
  };
};

module.exports = {
  getSalesReport,
  getDashboardReport,
  getOwnerDashboardReport,
  getFinancialDashboardReport,
  getEmployeesDashboardReport,
  listOrders,
  getOrderDetail,
  updateOrderStatus,
  updateOrderItems,
  updateOrderPaymentMethod,
  confirmOrderPayment,
  VALID_STATUSES
};
