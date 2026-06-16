import { useEffect, useState } from 'react';
import api from '../../api/axios.js';

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

const STATUS_LABELS = {
  pending: 'Aguardando pagamento',
  paid: 'Aguardando preparo',
  preparing: 'Preparando',
  ready: 'Pronto',
  out_for_delivery: 'Em entrega',
  delivered: 'Entregue'
};

const statusLabel = (value) => STATUS_LABELS[value] || value;

const formatOrderNumber = (order) =>
  order.dailyOrderNumber != null ? `#${order.dailyOrderNumber}` : `#${order.id}`;

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerStats, setCustomerStats] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api
      .get('/customers')
      .then((response) => setCustomers(response.data))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar clientes.'))
      .finally(() => setLoading(false));
  }, []);

  const openCustomerStats = async (customerId) => {
    setSelectedCustomerId(customerId);
    setCustomerStats(null);
    setDetailLoading(true);
    setError('');

    try {
      const { data } = await api.get(`/customers/${customerId}/stats`);
      setCustomerStats(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar estatísticas do cliente.');
      setSelectedCustomerId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeCustomerStats = () => {
    setSelectedCustomerId(null);
    setCustomerStats(null);
  };

  if (loading) {
    return <p>Carregando clientes...</p>;
  }

  return (
    <div>
      <h1 className="page-title">Clientes</h1>
      <p className="page-subtitle">Resumo por cliente — clique para ver estatísticas</p>

      {error && !selectedCustomerId && <p className="error-text">{error}</p>}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Pedidos totais</th>
              <th>Gasto total</th>
              <th>Estatísticas</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum cliente cadastrado.</td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name || '—'}</td>
                  <td>{customer.phone_number}</td>
                  <td>{customer.order_count}</td>
                  <td>{formatCurrency(customer.total_spent || 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => openCustomerStats(customer.id)}
                    >
                      Ver estatísticas
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(detailLoading || customerStats) && (
        <div className="modal-overlay" onClick={closeCustomerStats}>
          <div
            className="modal-card modal-card-wide customer-stats-modal"
            onClick={(event) => event.stopPropagation()}
          >
            {detailLoading ? (
              <p>Carregando estatísticas...</p>
            ) : (
              <>
                <h2>{customerStats.name || 'Cliente'}</h2>
                <p className="customer-stats-phone">{customerStats.phoneNumber}</p>

                <div className="customer-stats-summary">
                  <div className="customer-stat-card">
                    <span className="customer-stat-label">Pedidos totais</span>
                    <strong>{customerStats.orderCount}</strong>
                  </div>
                  <div className="customer-stat-card">
                    <span className="customer-stat-label">Gasto total</span>
                    <strong>{formatCurrency(customerStats.totalSpent)}</strong>
                  </div>
                </div>

                <section className="customer-stats-section">
                  <h3 className="section-title">Últimos pedidos</h3>
                  {customerStats.lastOrders.length === 0 ? (
                    <p className="customer-stats-empty">Nenhum pedido registrado.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Pedido</th>
                          <th>Data</th>
                          <th>Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerStats.lastOrders.map((order) => (
                          <tr key={order.id}>
                            <td>{formatOrderNumber(order)}</td>
                            <td>{formatDate(order.createdAt)}</td>
                            <td>{formatCurrency(order.totalAmount)}</td>
                            <td>
                              <span className={`status-badge status-${order.status}`}>
                                {statusLabel(order.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>

                <section className="customer-stats-section">
                  <h3 className="section-title">Produtos favoritos</h3>
                  {customerStats.favoriteProducts.length === 0 ? (
                    <p className="customer-stats-empty">Sem produtos pedidos ainda.</p>
                  ) : (
                    <ul className="customer-stats-list">
                      {customerStats.favoriteProducts.map((product) => (
                        <li key={product.productName}>
                          <strong>{product.productName}</strong>
                          <span>{product.totalQuantity} un.</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="customer-stats-section">
                  <h3 className="section-title">Dias que mais pede</h3>
                  {customerStats.favoriteDays.length === 0 ? (
                    <p className="customer-stats-empty">Sem histórico de pedidos.</p>
                  ) : (
                    <ul className="customer-stats-list">
                      {customerStats.favoriteDays.map((day) => (
                        <li key={day.dayName}>
                          <strong>{day.dayName}</strong>
                          <span>
                            {day.orderCount} pedido{day.orderCount !== 1 ? 's' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {error && <p className="error-text">{error}</p>}

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeCustomerStats}>
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
