import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios.js';

const emptyForm = {
  name: '',
  description: '',
  price: '',
  unit_cost: '',
  category: '',
  is_promotion: false,
  promotion_price: '',
  is_active: true
};

const formatCurrency = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatPercent = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return `${Number(value).toFixed(1)}%`;
};

const getEffectivePrice = (form) => {
  if (form.is_promotion && form.promotion_price !== '') {
    return Number(form.promotion_price);
  }

  return Number(form.price);
};

const getProfitMetrics = (form) => {
  const salePrice = getEffectivePrice(form);
  const unitCost = form.unit_cost === '' ? null : Number(form.unit_cost);

  if (unitCost == null || Number.isNaN(unitCost) || Number.isNaN(salePrice)) {
    return {
      unitCost: null,
      totalCost: null,
      profitPerUnit: null,
      totalProfit: null,
      marginPercent: null
    };
  }

  const profitPerUnit = Number((salePrice - unitCost).toFixed(2));
  const totalCost = Number(unitCost.toFixed(2));
  const totalProfit = profitPerUnit;
  const marginPercent =
    salePrice > 0 ? Number(((profitPerUnit / salePrice) * 100).toFixed(1)) : null;

  return {
    unitCost,
    totalCost,
    profitPerUnit,
    totalProfit,
    marginPercent
  };
};

export default function Menu() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const formMetrics = useMemo(() => getProfitMetrics(form), [form]);

  const loadProducts = useCallback(() => {
    setLoading(true);
    api
      .get('/products')
      .then((response) => setProducts(response.data))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar produtos.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      unit_cost: product.unit_cost != null ? String(product.unit_cost) : '',
      category: product.category || '',
      is_promotion: product.is_promotion,
      promotion_price: product.promotion_price != null ? String(product.promotion_price) : '',
      is_active: product.is_active
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
      category: form.category.trim() || null,
      is_promotion: form.is_promotion,
      promotion_price: form.is_promotion ? Number(form.promotion_price) : null,
      is_active: form.is_active
    };

    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
      } else {
        await api.post('/products', payload);
      }

      closeForm();
      loadProducts();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Erro ao salvar produto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja remover este produto?')) {
      return;
    }

    try {
      await api.delete(`/products/${id}`);
      loadProducts();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao remover produto.');
    }
  };

  if (loading) {
    return <p>Carregando cardápio...</p>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Cardápio</h1>
        <button type="button" className="btn-secondary" onClick={openCreateForm}>
          + Novo produto
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="panel menu-table-panel">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th>Custo/un.</th>
              <th>Lucro/un.</th>
              <th>Margem</th>
              <th>Promoção</th>
              <th>Ativo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={9}>Nenhum produto cadastrado.</td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    {product.description && (
                      <small className="table-subtext">{product.description}</small>
                    )}
                  </td>
                  <td>{product.category || '—'}</td>
                  <td>
                    {product.is_promotion && product.promotion_price != null ? (
                      <>
                        <span className="promo-price">{formatCurrency(product.promotion_price)}</span>
                        <small className="table-subtext original-price">
                          {formatCurrency(product.price)}
                        </small>
                      </>
                    ) : (
                      formatCurrency(product.price)
                    )}
                  </td>
                  <td>{formatCurrency(product.unit_cost)}</td>
                  <td>{formatCurrency(product.profitPerUnit)}</td>
                  <td>{formatPercent(product.marginPercent)}</td>
                  <td>
                    {product.is_promotion ? (
                      <span className="status-badge promo-badge">Promoção</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${product.is_active ? 'active-badge' : 'inactive-badge'}`}>
                      {product.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button type="button" className="btn-link" onClick={() => openEditForm(product)}>
                      Editar
                    </button>
                    <button type="button" className="btn-link danger" onClick={() => handleDelete(product.id)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-card menu-form-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{editingId ? 'Editar produto' : 'Novo produto'}</h2>

            {formError && <p className="error-text">{formError}</p>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Nome *</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} required />
              </div>

              <div className="form-group">
                <label htmlFor="description">Descrição</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="price">Preço de venda (R$) *</label>
                  <input
                    id="price"
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="unit_cost">Custo/un. (R$)</label>
                  <input
                    id="unit_cost"
                    name="unit_cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_cost}
                    onChange={handleChange}
                    placeholder="Custo de produção por unidade"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="category">Categoria</label>
                <input id="category" name="category" value={form.category} onChange={handleChange} />
              </div>

              <div className="menu-profit-panel">
                <h3>Rentabilidade por unidade</h3>
                <p className="menu-profit-hint">
                  Calculado com base no preço de venda
                  {form.is_promotion ? ' promocional' : ''} e no custo informado.
                </p>
                <div className="menu-profit-grid">
                  <div>
                    <span>Custo total</span>
                    <strong>{formatCurrency(formMetrics.totalCost)}</strong>
                  </div>
                  <div>
                    <span>Lucro/un.</span>
                    <strong>{formatCurrency(formMetrics.profitPerUnit)}</strong>
                  </div>
                  <div>
                    <span>Lucro total</span>
                    <strong>{formatCurrency(formMetrics.totalProfit)}</strong>
                  </div>
                  <div>
                    <span>Margem</span>
                    <strong>{formatPercent(formMetrics.marginPercent)}</strong>
                  </div>
                </div>
              </div>

              <div className="form-group toggle-group">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={form.is_active}
                    onChange={handleChange}
                  />
                  Produto ativo
                </label>
              </div>

              <div className="form-group toggle-group">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    name="is_promotion"
                    checked={form.is_promotion}
                    onChange={handleChange}
                  />
                  Ativar promoção
                </label>
              </div>

              {form.is_promotion && (
                <div className="form-group">
                  <label htmlFor="promotion_price">Preço promocional (R$) *</label>
                  <input
                    id="promotion_price"
                    name="promotion_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.promotion_price}
                    onChange={handleChange}
                    required
                  />
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary inline" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
