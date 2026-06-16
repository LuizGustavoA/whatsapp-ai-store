import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios.js';

const formatCurrency = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Menu() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProducts = useCallback(() => {
    setLoading(true);
    api
      .get('/products')
      .then((response) => setProducts(response.data))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar cardápio.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  if (loading) {
    return <p>Carregando cardápio...</p>;
  }

  return (
    <div>
      <h1 className="page-title">Cardápio</h1>
      <p className="readonly-notice">
        Visualização do cardápio — alterações são feitas apenas pelo administrador.
      </p>

      {error && <p className="error-text">{error}</p>}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th>Promoção</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum produto cadastrado.</td>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
