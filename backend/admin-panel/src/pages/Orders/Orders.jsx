import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios.js';
import { paymentMethodLabel } from '../../constants/paymentMethods.js';

const formatCurrency = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const sortByArrival = (list) =>
  [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

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

const STATUS_FILTERS = [
  { value: 'pending', label: 'Aguardando pagamento' },
  { value: 'paid', label: 'Aguardando preparo' },
  { value: 'preparing', label: 'Preparando' },
  { value: 'ready', label: 'Prontos' },
  { value: 'out_for_delivery', label: 'Em entrega' },
  { value: 'delivered', label: 'Entregues' },
  { value: 'modified', label: 'Modificados' }
];

const statusLabel = (value) =>
  STATUS_OPTIONS.find((option) => option.value === value)?.label || value;

const StatusBadge = ({ status }) => (
  <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>
);

const emptyFilters = () => ({
  search: '',
  dailyNumber: '',
  date: '',
  hourFrom: '',
  hourTo: '',
  statusFilters: [],
  showDailyNumber: false
});

const getOrderDateKey = (order) => {
  if (order.orderDate) {
    return String(order.orderDate).slice(0, 10);
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(order.createdAt));
};

const getOrderTimeKey = (order) => {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(order.createdAt));

  const hour = parts.find((part) => part.type === 'hour')?.value || '00';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
};

const applyClientFilters = (list, currentFilters) => {
  let result = [...list];

  if (currentFilters.search.trim()) {
    const query = currentFilters.search.trim().toLowerCase();
    result = result.filter(
      (order) =>
        String(order.id).includes(query) ||
        String(order.dailyOrderNumber || '').includes(query) ||
        (order.customerName || '').toLowerCase().includes(query) ||
        (order.displayName || '').toLowerCase().includes(query) ||
        (order.phoneNumber || '').toLowerCase().includes(query)
    );
  }

  if (currentFilters.dailyNumber.trim()) {
    const dailyNumber = Number(currentFilters.dailyNumber);
    result = result.filter((order) => order.dailyOrderNumber === dailyNumber);
  }

  if (currentFilters.date) {
    result = result.filter((order) => getOrderDateKey(order) === currentFilters.date);
  }

  if (currentFilters.hourFrom) {
    result = result.filter((order) => getOrderTimeKey(order) >= currentFilters.hourFrom);
  }

  if (currentFilters.hourTo) {
    result = result.filter((order) => getOrderTimeKey(order) <= currentFilters.hourTo);
  }

  const statuses = currentFilters.statusFilters.filter((value) => value !== 'modified');
  const wantsModified = currentFilters.statusFilters.includes('modified');

  if (statuses.length || wantsModified) {
    result = result.filter((order) => {
      const matchesStatus = statuses.length > 0 && statuses.includes(order.status);
      const matchesModified = wantsModified && Boolean(order.wasModified);

      if (statuses.length && wantsModified) {
        return matchesStatus || matchesModified;
      }

      if (statuses.length) {
        return matchesStatus;
      }

      return matchesModified;
    });
  }

  return sortByArrival(result);
};

const formatDailyNumber = (order) =>
  order.dailyOrderNumber != null ? `#${order.dailyOrderNumber}` : '—';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [filters, setFilters] = useState(emptyFilters());

  const loadAllOrders = () => {
    setLoading(true);
    setError('');

    api
      .get('/reports/orders', { params: { sort: 'asc', limit: 500 } })
      .then((response) => {
        setOrders(sortByArrival(response.data.orders));
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Erro ao carregar pedidos.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAllOrders();
  }, []);

  const filteredOrders = useMemo(
    () => applyClientFilters(orders, filters),
    [orders, filters]
  );

  const handleClearFilters = () => {
    setFilters(emptyFilters());
  };

  const toggleStatusFilter = (value) => {
    setFilters((prev) => {
      const statusFilters = prev.statusFilters.includes(value)
        ? prev.statusFilters.filter((item) => item !== value)
        : [...prev.statusFilters, value];
      return { ...prev, statusFilters };
    });
  };

  const openOrderDetail = async (orderId) => {
    setDetailLoading(true);
    setSelectedOrder(null);

    try {
      const { data } = await api.get(`/reports/orders/${orderId}`);
      setSelectedOrder(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar detalhes do pedido.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedOrder(null);
  };

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    setError('');

    try {
      const { data } = await api.patch(`/reports/orders/${orderId}/status`, {
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
                  wasModified: data.wasModified,
                  modifiedAt: data.modifiedAt,
                  dailyOrderNumber: data.dailyOrderNumber,
                  orderDate: data.orderDate,
                  paymentMethod: data.paymentMethod
                }
              : order
          )
        )
      );

      if (selectedOrder?.id === orderId) {
        setSelectedOrder(data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const showDailyNumberColumn = filters.showDailyNumber || filters.dailyNumber.trim().length > 0;
  const tableColSpan = showDailyNumberColumn ? 10 : 9;

  if (loading && orders.length === 0) {
    return <p>Carregando pedidos...</p>;
  }

  return (
    <div>
      <h1 className="page-title">Pedidos</h1>
      <p className="page-subtitle">Ordem de chegada — quem pediu primeiro aparece na frente</p>

      {error && <p className="error-text">{error}</p>}

      <div className="panel orders-admin-filters">
        <h2 className="section-title">Filtros</h2>

        <div className="filters-grid">
          <div className="form-group">
            <label htmlFor="search">Buscar</label>
            <input
              id="search"
              type="search"
              placeholder="Nome, telefone ou ID interno..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label htmlFor="dailyNumber">Nº do pedido do dia</label>
            <input
              id="dailyNumber"
              type="number"
              min="1"
              placeholder="Ex: 5"
              value={filters.dailyNumber}
              onChange={(e) => setFilters((prev) => ({ ...prev, dailyNumber: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label htmlFor="date">Dia do pedido</label>
            <input
              id="date"
              type="date"
              value={filters.date}
              onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label htmlFor="hourFrom">Hora inicial</label>
            <input
              id="hourFrom"
              type="time"
              value={filters.hourFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, hourFrom: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label htmlFor="hourTo">Hora final</label>
            <input
              id="hourTo"
              type="time"
              value={filters.hourTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, hourTo: e.target.value }))}
            />
          </div>
        </div>

        <div className="status-filters">
          <span className="status-filters-label">Status / situação:</span>
          <div className="status-filters-grid">
            {STATUS_FILTERS.map((option) => (
              <label key={option.value} className="status-filter-chip">
                <input
                  type="checkbox"
                  checked={filters.statusFilters.includes(option.value)}
                  onChange={() => toggleStatusFilter(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="orders-filter-toggle">
          <input
            type="checkbox"
            checked={filters.showDailyNumber}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, showDailyNumber: event.target.checked }))
            }
          />
          <span>Mostrar número do pedido do dia na listagem</span>
        </label>

        <div className="filters-actions">
          <button type="button" className="btn-secondary" onClick={handleClearFilters}>
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="panel">
        <p className="orders-result-count">
          Exibindo {filteredOrders.length} de {orders.length} pedidos
          {filters.statusFilters.length > 0 && (
            <span className="orders-active-filters">
              {' '}
              — filtros de status ativos
            </span>
          )}
        </p>
        <table>
          <thead>
            <tr>
              <th>Fila</th>
              {showDailyNumberColumn && <th>Nº do dia</th>}
              <th>ID</th>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Total</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan}>
                  Nenhum pedido encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order, index) => (
                <tr key={order.id}>
                  <td className="order-position">{index + 1}º</td>
                  {showDailyNumberColumn && (
                    <td>
                      <strong className="daily-order-number">{formatDailyNumber(order)}</strong>
                    </td>
                  )}
                  <td>
                    {order.id}
                    {order.wasModified && <span className="modified-badge">Modificado</span>}
                  </td>
                  <td>{order.customerName || order.displayName || '—'}</td>
                  <td>{order.phoneNumber}</td>
                  <td>{formatCurrency(order.totalAmount)}</td>
                  <td>
                    <span className="payment-method-badge">
                      {paymentMethodLabel(order.paymentMethod)}
                    </span>
                    {order.paymentConfirmed && order.paymentMethod === 'dinheiro' && (
                      <small className="table-subtext">
                        Troco: {formatCurrency(order.changeAmount)}
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="status-cell">
                      <StatusBadge status={order.status} />
                      <select
                        className="status-select"
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(event) => handleStatusChange(order.id, event.target.value)}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => openOrderDetail(order.id)}
                    >
                      Ver pedido
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(detailLoading || selectedOrder) && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
            {detailLoading ? (
              <p>Carregando detalhes...</p>
            ) : (
              <>
                <h2>
                  Pedido {formatDailyNumber(selectedOrder)}
                  {selectedOrder.wasModified && (
                    <span className="modified-badge modified-badge-large">Modificado</span>
                  )}
                </h2>

                <div className="order-detail-meta">
                  {selectedOrder.dailyOrderNumber != null && (
                    <p>
                      <strong>Nº do dia:</strong> #{selectedOrder.dailyOrderNumber}
                      {selectedOrder.orderDate && (
                        <span> ({selectedOrder.orderDate.split('-').reverse().join('/')})</span>
                      )}
                    </p>
                  )}
                  <p>
                    <strong>ID interno:</strong> {selectedOrder.id}
                  </p>
                  <p>
                    <strong>Cliente:</strong> {selectedOrder.customerName || selectedOrder.displayName || '—'}
                  </p>
                  <p>
                    <strong>Telefone:</strong> {selectedOrder.phoneNumber}
                  </p>
                  <p>
                    <strong>Pagamento:</strong>{' '}
                    {paymentMethodLabel(selectedOrder.paymentMethod)}
                    {selectedOrder.paymentConfirmed && (
                      <span className="payment-confirmed-tag"> Confirmado</span>
                    )}
                  </p>
                  {selectedOrder.paymentMethod === 'dinheiro' && selectedOrder.paymentConfirmed && (
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
                  <p>
                    <strong>Status:</strong> <StatusBadge status={selectedOrder.status} />
                  </p>
                  <p>
                    <strong>Data:</strong> {formatDate(selectedOrder.createdAt)}
                  </p>
                  {selectedOrder.modifiedAt && (
                    <p>
                      <strong>Modificado em:</strong> {formatDate(selectedOrder.modifiedAt)}
                    </p>
                  )}
                </div>

                <h3 className="order-detail-title">Itens do pedido</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Qtd</th>
                      <th>Preço unit.</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.productName}
                          {item.notes && <small className="table-subtext">{item.notes}</small>}
                        </td>
                        <td>{item.quantity}</td>
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

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeDetail}>
                    Fechar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
