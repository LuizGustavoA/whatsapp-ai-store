import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from '../../constants/paymentMethods.js';
const formatCurrency = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (value) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Aguardando pagamento' },
  { value: 'paid', label: 'Aguardando preparo' },
  { value: 'preparing', label: 'Preparando' },
  { value: 'ready', label: 'Pronto' },
  { value: 'out_for_delivery', label: 'Em entrega' },
  { value: 'delivered', label: 'Entregue' }
];

const statusLabel = (value) =>
  STATUS_OPTIONS.find((option) => option.value === value)?.label || value;

const StatusBadge = ({ status }) => (
  <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>
);

const ORDER_TYPE_LABELS = {
  local: 'No local',
  delivery: 'Entrega',
  whatsapp: 'WhatsApp'
};

const orderTypeLabel = (value) => ORDER_TYPE_LABELS[value] || value || 'WhatsApp';

const formatOrderLabel = (order) =>
  order.displayName || order.customerName || (order.tableNumber ? `Mesa ${order.tableNumber}` : '—');

const getTodayDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

const addDaysToDate = (dateStr, days) => {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) {
    return '—';
  }

  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

const formatDailyNumber = (order) =>
  order.dailyOrderNumber != null ? `#${order.dailyOrderNumber}` : '—';

const FINISHED_STATUSES = ['ready', 'delivered'];

const ORDER_VIEWS = [
  { id: 'active', label: 'Em andamento' },
  { id: 'ready', label: 'Prontos' },
  { id: 'delivered', label: 'Entregues' },
  { id: 'completed', label: 'Concluídos' }
];

const canConfirmPayment = (order) =>
  ['ready', 'delivered'].includes(order.status) && !order.paymentConfirmed;

const STATUS_PERMISSION_MAP = {
  preparing: 'set_preparing',
  out_for_delivery: 'set_out_for_delivery'
};

const getAllowedStatusOptions = (currentStatus, hasPermission) =>
  STATUS_OPTIONS.filter((option) => {
    if (option.value === currentStatus) {
      return true;
    }

    const permissionKey = STATUS_PERMISSION_MAP[option.value];

    if (permissionKey) {
      return hasPermission(permissionKey);
    }

    return true;
  });

const canChangeOrderStatus = (order, hasPermission) =>
  getAllowedStatusOptions(order.status, hasPermission).length > 1;

const sortByArrival = (list) =>
  [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

export default function Orders() {
  const { hasPermission } = useAuth();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState(null);
  const [paymentFormMethod, setPaymentFormMethod] = useState('');
  const [paymentFormAmount, setPaymentFormAmount] = useState('');
  const [paymentFormError, setPaymentFormError] = useState('');
  const [savingItems, setSavingItems] = useState(false);
  const [newProductId, setNewProductId] = useState('');
  const [newQuantity, setNewQuantity] = useState(1);
  const [newItemNotes, setNewItemNotes] = useState('');
  const [orderView, setOrderView] = useState('active');
  const [workingDate, setWorkingDate] = useState(() => {
    return localStorage.getItem('attendant_working_date') || getTodayDate();
  });

  const activeOrders = useMemo(
    () => sortByArrival(orders.filter((order) => !FINISHED_STATUSES.includes(order.status))),
    [orders]
  );

  const readyOrders = useMemo(
    () =>
      sortByArrival(
        orders.filter((order) => order.status === 'ready' && !order.paymentConfirmed)
      ),
    [orders]
  );

  const deliveredOrders = useMemo(
    () =>
      sortByArrival(
        orders.filter((order) => order.status === 'delivered' && !order.paymentConfirmed)
      ),
    [orders]
  );

  const completedOrders = useMemo(
    () => sortByArrival(orders.filter((order) => order.paymentConfirmed)),
    [orders]
  );

  const visibleOrders = useMemo(() => {
    if (orderView === 'ready') {
      return readyOrders;
    }

    if (orderView === 'delivered') {
      return deliveredOrders;
    }

    if (orderView === 'completed') {
      return completedOrders;
    }

    return activeOrders;
  }, [orderView, activeOrders, readyOrders, deliveredOrders, completedOrders]);

  const viewCounts = {
    active: activeOrders.length,
    ready: readyOrders.length,
    delivered: deliveredOrders.length,
    completed: completedOrders.length
  };

  const cashChangePreview = useMemo(() => {
    if (!paymentModalOrder || paymentFormMethod !== 'dinheiro') {
      return null;
    }

    const paid = Number(paymentFormAmount);

    if (!Number.isFinite(paid) || paid <= 0) {
      return null;
    }

    return Math.max(0, paid - paymentModalOrder.totalAmount);
  }, [paymentModalOrder, paymentFormMethod, paymentFormAmount]);

  const loadOrders = useCallback(() => {
    setLoading(true);
    api
      .get('/attendant/orders', { params: { date: workingDate } })
      .then((response) => setOrders(sortByArrival(response.data.orders)))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar pedidos.'))
      .finally(() => setLoading(false));
  }, [workingDate]);

  useEffect(() => {
    localStorage.setItem('attendant_working_date', workingDate);
  }, [workingDate]);

  const loadProducts = useCallback(() => {
    api
      .get('/products')
      .then((response) => setProducts(response.data.filter((p) => p.is_active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadOrders();
    loadProducts();
  }, [loadOrders, loadProducts, workingDate]);

  const openOrderDetail = async (orderId, listOrder = null) => {
    setDetailLoading(true);
    setSelectedOrder(null);
    setEditItems([]);
    setNewProductId('');
    setNewQuantity(1);
    setNewItemNotes('');

    try {
      const { data } = await api.get(`/attendant/orders/${orderId}`);
      setSelectedOrder({
        ...data,
        attendantEmployeeName:
          data.attendantEmployeeName ?? listOrder?.attendantEmployeeName ?? null
      });
      setEditItems(
        data.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes || ''
        }))
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar detalhes do pedido.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedOrder(null);
    setEditItems([]);
  };

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    setError('');

    try {
      const { data } = await api.patch(`/attendant/orders/${orderId}/status`, {
        status: newStatus
      });

      setOrders((prev) =>
        sortByArrival(
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  status: data.status,
                  totalAmount: data.totalAmount,
                  customerName: data.customerName,
                  phoneNumber: data.phoneNumber,
                  paymentMethod: data.paymentMethod,
                  paymentConfirmed: data.paymentConfirmed,
                  amountPaid: data.amountPaid,
                  changeAmount: data.changeAmount
                }
              : order
          )
        )
      );

      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar status.');
      loadOrders();
    } finally {
      setUpdatingId(null);
    }
  };

  const openPaymentModal = (order) => {
    setPaymentModalOrder(order);
    setPaymentFormMethod('');
    setPaymentFormAmount('');
    setPaymentFormError('');
  };

  const closePaymentModal = () => {
    setPaymentModalOrder(null);
    setPaymentFormMethod('');
    setPaymentFormAmount('');
    setPaymentFormError('');
  };

  const handleConfirmPayment = async (event) => {
    event.preventDefault();

    if (!paymentModalOrder) {
      return;
    }

    if (!paymentFormMethod) {
      setPaymentFormError('Selecione a forma de pagamento.');
      return;
    }

    if (paymentFormMethod === 'dinheiro') {
      const paid = Number(paymentFormAmount);

      if (!Number.isFinite(paid) || paid < paymentModalOrder.totalAmount) {
        setPaymentFormError('Informe um valor recebido maior ou igual ao total do pedido.');
        return;
      }
    }

    setConfirmingPayment(true);
    setPaymentFormError('');
    setError('');

    try {
      const payload = { paymentMethod: paymentFormMethod };

      if (paymentFormMethod === 'dinheiro') {
        payload.amountPaid = Number(paymentFormAmount);
      }

      const { data } = await api.post(
        `/attendant/orders/${paymentModalOrder.id}/confirm-payment`,
        payload
      );

      setOrders((prev) =>
        sortByArrival(
          prev.map((order) =>
            order.id === data.id
              ? {
                  ...order,
                  paymentMethod: data.paymentMethod,
                  paymentConfirmed: data.paymentConfirmed,
                  amountPaid: data.amountPaid,
                  changeAmount: data.changeAmount
                }
              : order
          )
        )
      );

      if (selectedOrder?.id === data.id) {
        setSelectedOrder((prev) => ({ ...prev, ...data }));
      }

      closePaymentModal();
      setOrderView('completed');
    } catch (err) {
      setPaymentFormError(err.response?.data?.error || 'Erro ao confirmar pagamento.');
    } finally {
      setConfirmingPayment(false);
    }
  };

  const handleItemNotesChange = (index, notes) => {
    setEditItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, notes } : item))
    );
  };

  const handleQuantityChange = (index, quantity) => {
    const qty = Math.max(1, Number(quantity) || 1);
    setEditItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: qty } : item))
    );
  };

  const handleRemoveItem = (index) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    if (!newProductId) {
      return;
    }

    const product = products.find((p) => p.id === Number(newProductId));

    if (!product) {
      return;
    }

    const unitPrice =
      product.is_promotion && product.promotion_price != null
        ? Number(product.promotion_price)
        : Number(product.price);

    const existingIndex = editItems.findIndex(
      (item) => item.productId === product.id
    );

    if (existingIndex >= 0) {
      setEditItems((prev) =>
        prev.map((item, i) =>
          i === existingIndex
            ? {
                ...item,
                quantity: item.quantity + Number(newQuantity),
                notes: newItemNotes.trim() || item.notes
              }
            : item
        )
      );
    } else {
      setEditItems((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: Math.max(1, Number(newQuantity) || 1),
          unitPrice,
          notes: newItemNotes.trim()
        }
      ]);
    }

    setNewProductId('');
    setNewQuantity(1);
    setNewItemNotes('');
  };

  const handleSaveItems = async () => {
    if (!selectedOrder) {
      return;
    }

    if (editItems.length === 0) {
      setError('O pedido deve ter ao menos um item.');
      return;
    }

    setSavingItems(true);
    setError('');

    try {
      const { data } = await api.put(`/attendant/orders/${selectedOrder.id}/items`, {
        items: editItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes || null
        }))
      });

      setSelectedOrder((prev) => ({
        ...data,
        attendantEmployeeName: data.attendantEmployeeName ?? prev?.attendantEmployeeName ?? null
      }));
      setEditItems(
        data.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes || ''
        }))
      );

      setOrders((prev) =>
        sortByArrival(
          prev.map((order) =>
            order.id === data.id
              ? {
                  ...order,
                  totalAmount: data.totalAmount,
                  status: data.status,
                  wasModified: data.wasModified,
                  modifiedAt: data.modifiedAt
                }
              : order
          )
        )
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar itens do pedido.');
    } finally {
      setSavingItems(false);
    }
  };

  const editSubtotal = editItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  const canEditItems =
    selectedOrder &&
    selectedOrder.status !== 'delivered' &&
    hasPermission('create_order');

  const canReceivePayment = hasPermission('receive_payment');

  if (loading) {
    return <p>Carregando pedidos...</p>;
  }

  return (
    <div>
      <h1 className="page-title">Pedidos</h1>
      <p className="page-subtitle">
        {orderView === 'active' && 'Pedidos em andamento — ordem de chegada (mais antigo primeiro)'}
        {orderView === 'ready' && 'Pedidos prontos — confirme o pagamento para concluir'}
        {orderView === 'delivered' && 'Pedidos entregues — confirme o pagamento para concluir'}
        {orderView === 'completed' && 'Chamados concluídos — pagamento confirmado'}
      </p>

      {error && <p className="error-text">{error}</p>}

      <div className="orders-day-bar panel">
        <div className="orders-day-info">
          <strong>Dia dos pedidos:</strong> {formatDisplayDate(workingDate)}
        </div>
        <div className="orders-day-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setWorkingDate(getTodayDate())}
          >
            Hoje
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setWorkingDate(addDaysToDate(workingDate, 1))}
          >
            Próximo dia →
          </button>
          <div className="form-group orders-day-picker">
            <label htmlFor="workingDate">Alterar dia</label>
            <input
              id="workingDate"
              type="date"
              value={workingDate}
              onChange={(event) => setWorkingDate(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="orders-view-tabs panel">
        {ORDER_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`orders-view-tab ${orderView === view.id ? 'active' : ''}`}
            onClick={() => setOrderView(view.id)}
          >
            {view.label}
            {viewCounts[view.id] > 0 && (
              <span className="orders-view-count">{viewCounts[view.id]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Fila</th>
              <th>Nº do dia</th>
              <th>Identificação</th>
              <th>Tipo</th>
              <th>Total</th>
              {orderView === 'completed' && <th>Pagamento</th>}
              {orderView === 'completed' && <th>Troco</th>}
              {orderView !== 'completed' && <th>Status</th>}
              <th>Chegou em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 ? (
              <tr>
                <td colSpan={orderView === 'completed' ? 9 : 8}>
                  {orderView === 'active' && 'Nenhum pedido em andamento.'}
                  {orderView === 'ready' && 'Nenhum pedido pronto aguardando pagamento.'}
                  {orderView === 'delivered' && 'Nenhum pedido entregue aguardando pagamento.'}
                  {orderView === 'completed' && 'Nenhum chamado concluído.'}
                </td>
              </tr>
            ) : (
              visibleOrders.map((order, index) => (
                <tr key={order.id}>
                  <td className="order-position">{index + 1}º</td>
                  <td>
                    <strong className="daily-order-number">{formatDailyNumber(order)}</strong>
                  </td>
                  <td>{formatOrderLabel(order)}</td>
                  <td>
                    <span className="status-badge type-badge">{orderTypeLabel(order.orderType)}</span>
                  </td>
                  <td>{formatCurrency(order.totalAmount)}</td>
                  {orderView === 'completed' && (
                    <>
                      <td>{paymentMethodLabel(order.paymentMethod)}</td>
                      <td>
                        {order.paymentMethod === 'dinheiro'
                          ? formatCurrency(order.changeAmount)
                          : '—'}
                      </td>
                    </>
                  )}
                  {orderView !== 'completed' && (
                    <td>
                      <div className="status-cell">
                        <StatusBadge status={order.status} />
                        {order.wasModified && (
                          <span
                            className="modified-badge"
                            title={
                              order.modifiedAt
                                ? `Modificado em ${formatDate(order.modifiedAt)}`
                                : ''
                            }
                          >
                            Modificado
                          </span>
                        )}
                        <select
                          className="status-select"
                          value={order.status}
                          disabled={
                            updatingId === order.id || !canChangeOrderStatus(order, hasPermission)
                          }
                          onChange={(event) => handleStatusChange(order.id, event.target.value)}
                        >
                          {getAllowedStatusOptions(order.status, hasPermission).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  )}
                  <td>{formatDate(order.createdAt)}</td>
                  <td>
                    <div className="order-row-actions">
                      {canConfirmPayment(order) && canReceivePayment && (
                        <button
                          type="button"
                          className="btn-link payment-confirm-link"
                          onClick={() => openPaymentModal(order)}
                        >
                          Confirmar pagamento
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => openOrderDetail(order.id, order)}
                      >
                        {orderView === 'completed' ? 'Ver' : 'Gerenciar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {paymentModalOrder && (
        <div className="modal-overlay" onClick={closePaymentModal}>
          <div className="modal-card payment-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Confirmar pagamento</h2>
            <p className="payment-modal-subtitle">
              Pedido {formatDailyNumber(paymentModalOrder)} — {formatOrderLabel(paymentModalOrder)}
            </p>
            <p className="payment-modal-total">
              Total: <strong>{formatCurrency(paymentModalOrder.totalAmount)}</strong>
            </p>

            {paymentFormError && <p className="error-text">{paymentFormError}</p>}

            <form onSubmit={handleConfirmPayment}>
              <div className="form-group">
                <label>Forma de pagamento *</label>
                <div className="payment-method-grid">
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      className={`payment-method-card ${
                        paymentFormMethod === method.value ? 'selected' : ''
                      }`}
                      onClick={() => {
                        setPaymentFormMethod(method.value);
                        setPaymentFormError('');
                        if (method.value !== 'dinheiro') {
                          setPaymentFormAmount('');
                        }
                      }}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentFormMethod === 'dinheiro' && (
                <div className="form-group">
                  <label htmlFor="paymentFormAmount">Valor recebido (nota) *</label>
                  <input
                    id="paymentFormAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 100,00"
                    value={paymentFormAmount}
                    onChange={(event) => setPaymentFormAmount(event.target.value)}
                  />
                  {cashChangePreview != null && (
                    <p className="change-preview">
                      Troco: <strong>{formatCurrency(cashChangePreview)}</strong>
                    </p>
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closePaymentModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary inline" disabled={confirmingPayment}>
                  {confirmingPayment ? 'Confirmando...' : 'Confirmar pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(detailLoading || selectedOrder) && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
            {detailLoading ? (
              <p>Carregando detalhes...</p>
            ) : (
              <>
                <h2>
                  Pedido {formatDailyNumber(selectedOrder)}
                  <small className="order-internal-id">ID interno: {selectedOrder.id}</small>
                  {selectedOrder.wasModified && (
                    <span className="modified-badge modified-badge-large">
                      Pedido modificado
                      {selectedOrder.modifiedAt && (
                        <small> em {formatDate(selectedOrder.modifiedAt)}</small>
                      )}
                    </span>
                  )}
                </h2>

                <div className="order-detail-meta">
                  <p>
                    <strong>Identificação:</strong> {formatOrderLabel(selectedOrder)}
                  </p>
                  <p>
                    <strong>Tipo:</strong> {orderTypeLabel(selectedOrder.orderType)}
                  </p>
                  <p>
                    <strong>Anotado por:</strong>{' '}
                    {selectedOrder.attendantEmployeeName || '—'}
                  </p>
                  {selectedOrder.orderNotes && (
                    <p>
                      <strong>Observações:</strong> {selectedOrder.orderNotes}
                    </p>
                  )}
                  {selectedOrder.paymentConfirmed ? (
                    <>
                      <p>
                        <strong>Pagamento:</strong> {paymentMethodLabel(selectedOrder.paymentMethod)}
                      </p>
                      {selectedOrder.paymentMethod === 'dinheiro' && (
                        <>
                          <p>
                            <strong>Valor recebido:</strong>{' '}
                            {formatCurrency(selectedOrder.amountPaid)}
                          </p>
                          <p>
                            <strong>Troco:</strong> {formatCurrency(selectedOrder.changeAmount)}
                          </p>
                        </>
                      )}
                    </>
                  ) : canConfirmPayment(selectedOrder) && canReceivePayment ? (
                    <p>
                      <button
                        type="button"
                        className="btn-link payment-confirm-link"
                        onClick={() => openPaymentModal(selectedOrder)}
                      >
                        Confirmar pagamento
                      </button>
                    </p>
                  ) : null}
                  <p>
                    <strong>Status:</strong>{' '}
                    <span className={`status-badge status-${selectedOrder.status}`}>
                      {statusLabel(selectedOrder.status)}
                    </span>
                  </p>
                  <p>
                    <strong>Chegou em:</strong> {formatDate(selectedOrder.createdAt)}
                  </p>
                </div>

                <h3 className="order-detail-title">Itens do pedido</h3>

                {canEditItems ? (
                  <>
                    <table>
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Qtd</th>
                          <th>Detalhe</th>
                          <th>Preço unit.</th>
                          <th>Subtotal</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editItems.map((item, index) => (
                          <tr key={`${item.productId}-${index}`}>
                            <td>{item.productName}</td>
                            <td>
                              <input
                                type="number"
                                className="qty-input"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleQuantityChange(index, e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="notes-input"
                                placeholder="Detalhe..."
                                value={item.notes}
                                onChange={(e) => handleItemNotesChange(index, e.target.value)}
                              />
                            </td>
                            <td>{formatCurrency(item.unitPrice)}</td>
                            <td>{formatCurrency(item.unitPrice * item.quantity)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-link danger"
                                onClick={() => handleRemoveItem(index)}
                              >
                                Remover
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="add-item-row">
                      <div className="form-group">
                        <label htmlFor="newProduct">Adicionar produto</label>
                        <select
                          id="newProduct"
                          value={newProductId}
                          onChange={(e) => setNewProductId(e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="newQty">Qtd</label>
                        <input
                          id="newQty"
                          type="number"
                          className="qty-input"
                          min="1"
                          value={newQuantity}
                          onChange={(e) => setNewQuantity(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="newNotes">Detalhe</label>
                        <input
                          id="newNotes"
                          type="text"
                          placeholder="Observação..."
                          value={newItemNotes}
                          onChange={(e) => setNewItemNotes(e.target.value)}
                        />
                      </div>
                      <button type="button" className="btn-secondary" onClick={handleAddItem}>
                        Adicionar
                      </button>
                    </div>

                    <div className="order-detail-totals">
                      <p>Subtotal estimado: {formatCurrency(editSubtotal)}</p>
                      {selectedOrder.cashbackUsed > 0 && (
                        <p>Cashback usado: -{formatCurrency(selectedOrder.cashbackUsed)}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <table>
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Qtd</th>
                          <th>Detalhe</th>
                          <th>Preço unit.</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.productName}</td>
                            <td>{item.quantity}</td>
                            <td>{item.notes || '—'}</td>
                            <td>{formatCurrency(item.unitPrice)}</td>
                            <td>{formatCurrency(item.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="order-detail-totals">
                      {selectedOrder.cashbackUsed > 0 && (
                        <p>Cashback usado: -{formatCurrency(selectedOrder.cashbackUsed)}</p>
                      )}
                      <p>
                        <strong>Total: {formatCurrency(selectedOrder.totalAmount)}</strong>
                      </p>
                    </div>
                  </>
                )}

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeDetail}>
                    Fechar
                  </button>
                  {canEditItems && (
                    <button
                      type="button"
                      className="btn-primary inline"
                      disabled={savingItems}
                      onClick={handleSaveItems}
                    >
                      {savingItems ? 'Salvando...' : 'Salvar itens'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
