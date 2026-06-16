import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';

const formatCurrency = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ORDER_TYPES = [
  { value: 'local', label: 'No local', icon: '🪑', hint: 'Informe o número da mesa' },
  { value: 'delivery', label: 'Entrega', icon: '🛵', hint: 'Informe o nome do cliente' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬', hint: 'Informe o nome do cliente' }
];

const emptyCartItem = () => ({
  productId: '',
  quantity: 1,
  notes: ''
});

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const matchesProductSearch = (product, searchTerm) => {
  if (!searchTerm) {
    return true;
  }

  const query = normalizeText(searchTerm);
  return [product.name, product.category, product.description].some((field) =>
    normalizeText(field).includes(query)
  );
};

export default function CreateOrder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [orderType, setOrderType] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [cartItem, setCartItem] = useState(emptyCartItem());
  const [cart, setCart] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');

  const filteredProducts = useMemo(
    () => products.filter((product) => matchesProductSearch(product, productSearch)),
    [products, productSearch]
  );

  const menuProducts = useMemo(
    () => products.filter((product) => matchesProductSearch(product, menuSearch)),
    [products, menuSearch]
  );

  const showSearchResults = productSearch.trim().length > 0;

  const selectedProduct = products.find((p) => p.id === Number(cartItem.productId));

  const handleSelectProduct = (product) => {
    setCartItem((prev) => ({ ...prev, productId: String(product.id) }));
    setProductSearch('');
    setMenuSearch('');
    setMenuModalOpen(false);
    setError('');
  };

  const openMenuModal = () => {
    setMenuSearch('');
    setMenuModalOpen(true);
  };

  const loadProducts = useCallback(() => {
    setLoading(true);
    api
      .get('/products')
      .then((response) => setProducts(response.data.filter((p) => p.is_active)))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar produtos.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const needsName = orderType === 'delivery' || orderType === 'whatsapp';
  const needsTable = orderType === 'local';

  const getProductPrice = (product) =>
    product.is_promotion && product.promotion_price != null
      ? Number(product.promotion_price)
      : Number(product.price);

  const handleAddToCart = () => {
    if (!cartItem.productId) {
      setError('Selecione um produto.');
      return;
    }

    const product = products.find((p) => p.id === Number(cartItem.productId));

    if (!product) {
      return;
    }

    setError('');
    setCart((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        unitPrice: getProductPrice(product),
        quantity: Math.max(1, Number(cartItem.quantity) || 1),
        notes: cartItem.notes.trim()
      }
    ]);
    setCartItem(emptyCartItem());
    setProductSearch('');
  };

  const handleRemoveFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const resetForm = () => {
    setOrderType('');
    setCustomerName('');
    setTableNumber('');
    setOrderNotes('');
    setCart([]);
    setCartItem(emptyCartItem());
    setProductSearch('');
    setMenuSearch('');
    setMenuModalOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!orderType) {
      setError('Selecione o tipo do pedido (local, entrega ou WhatsApp).');
      return;
    }

    if (needsTable && !tableNumber.trim()) {
      setError('Informe o número da mesa.');
      return;
    }

    if (needsName && !customerName.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }

    if (cart.length === 0) {
      setError('Adicione ao menos um produto ao pedido.');
      return;
    }

    setSubmitting(true);

    try {
      const orderDate =
        localStorage.getItem('attendant_working_date') ||
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());

      const { data } = await api.post('/attendant/orders', {
        orderType,
        customerName: needsName ? customerName.trim() : null,
        tableNumber: needsTable ? tableNumber.trim() : null,
        orderNotes: orderNotes.trim() || null,
        orderDate,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes || null
        }))
      });

      setSuccess(
        `Pedido ${data.dailyOrderNumber != null ? `#${data.dailyOrderNumber}` : 'criado'} registrado com sucesso!`
      );
      resetForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p>Carregando...</p>;
  }

  return (
    <div>
      <h1 className="page-title">Novo pedido</h1>
      <p className="page-subtitle">
        Anotado por: <strong>{user?.name}</strong> ({user?.role})
      </p>

      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}

      <form onSubmit={handleSubmit}>
        <div className="panel create-order-section">
          <h2 className="section-title">1. Tipo do pedido</h2>
          <div className="order-type-grid">
            {ORDER_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`order-type-card ${orderType === type.value ? 'selected' : ''}`}
                onClick={() => {
                  setOrderType(type.value);
                  setError('');
                }}
              >
                <span className="order-type-icon">{type.icon}</span>
                <strong>{type.label}</strong>
                <small>{type.hint}</small>
              </button>
            ))}
          </div>

          {orderType && (
            <div className="order-type-fields">
              {needsTable && (
                <div className="form-group">
                  <label htmlFor="tableNumber">Número da mesa *</label>
                  <input
                    id="tableNumber"
                    type="text"
                    inputMode="numeric"
                    placeholder="Ex: 12"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                  />
                </div>
              )}

              {needsName && (
                <div className="form-group">
                  <label htmlFor="customerName">Nome do cliente *</label>
                  <input
                    id="customerName"
                    type="text"
                    placeholder="Nome para identificar o pedido"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {orderType && (
          <div className="panel create-order-section">
            <h2 className="section-title">2. Produtos do pedido</h2>

            <div className="product-search-section">
              <div className="product-picker-row">
                <div className="form-group product-search-field">
                  <label htmlFor="productSearch">Pesquisar produto</label>
                  <input
                    id="productSearch"
                    type="search"
                    placeholder="Ex: agua, pizza, calabresa..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    autoComplete="off"
                  />
                  {showSearchResults && (
                    <ul className="product-search-dropdown">
                      {filteredProducts.length === 0 ? (
                        <li className="product-search-empty">Nenhum produto encontrado.</li>
                      ) : (
                        filteredProducts.slice(0, 8).map((product) => (
                          <li key={product.id}>
                            <button
                              type="button"
                              className="product-search-item"
                              onClick={() => handleSelectProduct(product)}
                            >
                              <span className="product-search-name">{product.name}</span>
                              {product.category && (
                                <span className="product-search-category">{product.category}</span>
                              )}
                              <span className="product-search-price">
                                {formatCurrency(getProductPrice(product))}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>

                <button type="button" className="btn-secondary open-menu-btn" onClick={openMenuModal}>
                  📋 Abrir cardápio
                </button>
              </div>

              {selectedProduct ? (
                <p className="selected-product-label">
                  Selecionado: <strong>{selectedProduct.name}</strong> —{' '}
                  {formatCurrency(getProductPrice(selectedProduct))}
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setCartItem((prev) => ({ ...prev, productId: '' }))}
                  >
                    Trocar
                  </button>
                </p>
              ) : (
                <p className="product-picker-hint">
                  Pesquise pelo nome ou abra o cardápio para escolher o produto.
                </p>
              )}
            </div>

            {menuModalOpen && (
              <div className="modal-overlay" onClick={() => setMenuModalOpen(false)}>
                <div
                  className="modal-card modal-card-wide menu-modal"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="menu-modal-header">
                    <h2>Cardápio</h2>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => setMenuModalOpen(false)}
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="form-group">
                    <input
                      type="search"
                      placeholder="Buscar no cardápio (ex: agua, pizza)..."
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      autoComplete="off"
                      autoFocus
                    />
                  </div>

                  <ul className="product-search-results menu-modal-list">
                    {menuProducts.length === 0 ? (
                      <li className="product-search-empty">Nenhum produto encontrado.</li>
                    ) : (
                      menuProducts.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            className={`product-search-item ${
                              Number(cartItem.productId) === product.id ? 'selected' : ''
                            }`}
                            onClick={() => handleSelectProduct(product)}
                          >
                            <span className="product-search-name">{product.name}</span>
                            {product.category && (
                              <span className="product-search-category">{product.category}</span>
                            )}
                            <span className="product-search-price">
                              {formatCurrency(getProductPrice(product))}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}

            <div className="add-product-form">
              <div className="form-group qty-field">
                <label htmlFor="quantity">Qtd</label>
                <input
                  id="quantity"
                  type="number"
                  min="1"
                  className="qty-input"
                  value={cartItem.quantity}
                  onChange={(e) =>
                    setCartItem((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                />
              </div>

              <button type="button" className="btn-secondary" onClick={handleAddToCart}>
                + Adicionar
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="itemNotes">Detalhe / observação deste item</label>
              <textarea
                id="itemNotes"
                rows={2}
                placeholder="Ex: sem cebola, ponto da carne, etc."
                value={cartItem.notes}
                onChange={(e) => setCartItem((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            {cart.length > 0 && (
              <div className="cart-list">
                <h3 className="cart-title">Itens anotados ({cart.length})</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Qtd</th>
                      <th>Detalhe</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => (
                      <tr key={`${item.productId}-${index}`}>
                        <td>{item.productName}</td>
                        <td>{item.quantity}</td>
                        <td>{item.notes || '—'}</td>
                        <td>{formatCurrency(item.unitPrice * item.quantity)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-link danger"
                            onClick={() => handleRemoveFromCart(index)}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="cart-total">
                  Total parcial: <strong>{formatCurrency(cartTotal)}</strong>
                </p>
              </div>
            )}
          </div>
        )}

        {orderType && cart.length > 0 && (
          <div className="panel create-order-section">
            <h2 className="section-title">3. Observações gerais (opcional)</h2>
            <div className="form-group">
              <textarea
                rows={2}
                placeholder="Alguma informação extra sobre o pedido..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
              />
            </div>

            <div className="create-order-actions">
              <button type="button" className="btn-secondary" onClick={() => navigate('/orders')}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary inline" disabled={submitting}>
                {submitting ? 'Enviando...' : 'Confirmar pedido'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
