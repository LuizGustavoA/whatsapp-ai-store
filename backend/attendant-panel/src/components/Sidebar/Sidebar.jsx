import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import './Sidebar.css';

export default function Sidebar() {
  const { user, logout, hasPermission } = useAuth();

  return (
    <aside className="sidebar attendant-sidebar">
      <div className="sidebar-brand">
        <span>🍕</span>
        <div>
          <strong>AI Store</strong>
          <small>Painel Atendente</small>
        </div>
      </div>

      <nav className="sidebar-nav">
        {hasPermission('create_order') && (
          <NavLink to="/novo-pedido" className={({ isActive }) => (isActive ? 'active' : '')}>
            Novo pedido
          </NavLink>
        )}
        <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
          Pedidos
        </NavLink>
        <NavLink to="/conversations" className={({ isActive }) => (isActive ? 'active' : '')}>
          WhatsApp
        </NavLink>
        <NavLink to="/menu" className={({ isActive }) => (isActive ? 'active' : '')}>
          Cardápio
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <p>{user?.name}</p>
        <small>{user?.role}</small>
        <button type="button" onClick={logout}>
          Sair
        </button>
      </div>
    </aside>
  );
}
