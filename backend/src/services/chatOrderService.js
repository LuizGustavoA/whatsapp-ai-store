const db = require('../../database/connection');

const ACTIVE_STATUSES = ['pending', 'paid', 'preparing', 'ready', 'out_for_delivery'];

const STATUS_LABELS = {
  pending: 'Aguardando pagamento PIX',
  paid: 'Pagamento confirmado — aguardando início do preparo',
  preparing: 'Em preparo na cozinha',
  ready: 'Pronto para retirada ou entrega',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado'
};

const formatMinutesAgo = (createdAt) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));

  if (minutes < 1) {
    return 'agora há pouco';
  }

  if (minutes === 1) {
    return 'há 1 minuto';
  }

  if (minutes < 60) {
    return `há ${minutes} minutos`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (rest === 0) {
    return `há ${hours}h`;
  }

  return `há ${hours}h${rest}min`;
};

const findActiveOrderForConversation = async (conversationId) => {
  const result = await db.query(
    `SELECT
       o.*,
       COALESCE(
         json_agg(
           json_build_object(
             'product_name', p.name,
             'quantity', oi.quantity
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'
       ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.conversation_id = $1
       AND o.status = ANY($2::text[])
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT 1`,
    [conversationId, ACTIVE_STATUSES]
  );

  return result.rows[0] || null;
};

const findRecentOrdersForConversation = async (conversationId, limit = 3) => {
  const result = await db.query(
    `SELECT id, status, total_amount, daily_order_number, created_at
     FROM orders
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit]
  );

  return result.rows;
};

const buildOrderContextForAi = (order, estimatedPrepMinutes = 35) => {
  if (!order) {
    return 'Nenhum pedido em andamento no momento.';
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const itemLines = items
    .map((item) => `${item.quantity}x ${item.product_name}`)
    .join(', ');

  const minutesAgo = formatMinutesAgo(order.created_at);
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const orderLabel =
    order.daily_order_number != null ? `#${order.daily_order_number}` : `#${order.id}`;

  let timingHint = '';

  if (['paid', 'preparing'].includes(order.status)) {
    const elapsed = Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000);

    if (elapsed > estimatedPrepMinutes) {
      timingHint = ` Tempo decorrido (${elapsed} min) já passou da estimativa usual (${estimatedPrepMinutes} min) — trate reclamações de atraso com empatia.`;
    } else {
      timingHint = ` Tempo estimado de preparo: cerca de ${estimatedPrepMinutes} minutos.`;
    }
  }

  return [
    `Pedido ${orderLabel} (${minutesAgo})`,
    `Status: ${statusLabel}`,
    `Total: R$ ${Number(order.total_amount).toFixed(2)}`,
    itemLines ? `Itens: ${itemLines}` : null,
    timingHint.trim() || null
  ]
    .filter(Boolean)
    .join('\n');
};

const cancelPendingOrder = async (conversationId) => {
  const result = await db.query(
    `UPDATE orders
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE conversation_id = $1 AND status = 'pending'
     RETURNING *`,
    [conversationId]
  );

  if (result.rows.length === 0) {
    throw new Error('Não há pedido aguardando pagamento para cancelar.');
  }

  return result.rows[0];
};

const extractOrderNumber = (text) => {
  const value = String(text || '').trim();

  if (!value) {
    return null;
  }

  const patterns = [
    /pedido\s*#?\s*(\d{1,5})/i,
    /n[uú]mero\s*(?:do\s+pedido\s*)?#?\s*(\d{1,5})/i,
    /n\s*[º°o]\s*(\d{1,5})/i,
    /^#\s*(\d{1,5})$/,
    /^(\d{1,5})$/
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match) {
      const number = Number(match[1]);

      if (number > 0) {
        return number;
      }
    }
  }

  return null;
};

const mapOrderWithItems = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : []
  };
};

const findOrderForCustomerByNumber = async (phoneNumber, orderNumber) => {
  const result = await db.query(
    `SELECT
       o.*,
       COALESCE(
         json_agg(
           json_build_object(
             'product_name', p.name,
             'quantity', oi.quantity
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'
       ) AS items
     FROM orders o
     JOIN conversations c ON c.id = o.conversation_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE c.phone_number = $1
       AND (o.daily_order_number = $2 OR o.id = $2)
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT 1`,
    [phoneNumber, orderNumber]
  );

  return mapOrderWithItems(result.rows[0] || null);
};

const resolveOrderForStatus = async ({
  conversationId,
  phoneNumber,
  text,
  conversationStatus
}) => {
  const activeOrder = await findActiveOrderForConversation(conversationId);

  if (activeOrder) {
    return { order: activeOrder, lookupAttempted: false, lookupFound: true };
  }

  const orderNumber = extractOrderNumber(text);
  const shouldTryLookup =
    orderNumber != null ||
    conversationStatus === 'awaiting_order_number' ||
    conversationStatus === 'awaiting_order_lookup';

  if (!shouldTryLookup) {
    return { order: null, lookupAttempted: false, lookupFound: false };
  }

  if (orderNumber == null) {
    return { order: null, lookupAttempted: false, lookupFound: false };
  }

  const order = await findOrderForCustomerByNumber(phoneNumber, orderNumber);

  return {
    order,
    lookupAttempted: true,
    lookupFound: Boolean(order),
    orderNumber
  };
};

module.exports = {
  ACTIVE_STATUSES,
  STATUS_LABELS,
  findActiveOrderForConversation,
  findRecentOrdersForConversation,
  findOrderForCustomerByNumber,
  extractOrderNumber,
  resolveOrderForStatus,
  buildOrderContextForAi,
  cancelPendingOrder,
  formatMinutesAgo
};
