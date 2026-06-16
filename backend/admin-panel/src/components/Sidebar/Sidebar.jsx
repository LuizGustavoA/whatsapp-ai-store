import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import './Sidebar.css';

const DASHBOARD_ROUTES = [
  { to: '/', label: 'Visão Geral', end: true },
  { to: '/financial-dashboard', label: 'Financeiro' },
  { to: '/employees-dashboard', label: 'Funcionários' }
];

const isDashboardPath = (pathname) =>
  pathname === '/' ||
  pathname === '/financial-dashboard' ||
  pathname === '/employees-dashboard';

export default function Sidebar() {
  const { admin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dashboardOpen, setDashboardOpen] = useState(() => isDashboardPath(location.pathname));

  useEffect(() => {
    if (isDashboardPath(location.pathname)) {
      setDashboardOpen(true);
    }
  }, [location.pathname]);

  const handleDashboardToggle = () => {
    const nextOpen = !dashboardOpen;
    setDashboardOpen(nextOpen);

    if (nextOpen && !isDashboardPath(location.pathname)) {
      navigate('/');
    }
  };

  const dashboardActive = isDashboardPath(location.pathname);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span>🍕</span>
        <div>
          <strong>AI Store</strong>
          <small>Painel Admin</small>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-nav-group">
          <button
            type="button"
            className={`sidebar-nav-parent${dashboardActive ? ' active' : ''}${dashboardOpen ? ' open' : ''}`}
            onClick={handleDashboardToggle}
            aria-expanded={dashboardOpen}
          >
            <span>Dashboard</span>
            <span className="sidebar-nav-chevron" aria-hidden="true">
              ▾
            </span>
          </button>

          {dashboardOpen && (
            <div className="sidebar-nav-sub">
              {DASHBOARD_ROUTES.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <NavLink to="/employees" className={({ isActive }) => (isActive ? 'active' : '')}>
          Funcionários
        </NavLink>
        <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
          Pedidos
        </NavLink>
        <NavLink to="/menu" className={({ isActive }) => (isActive ? 'active' : '')}>
          Cardápio
        </NavLink>
        <NavLink to="/customers" className={({ isActive }) => (isActive ? 'active' : '')}>
          Clientes
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <p>{admin?.name || admin?.username}</p>
        <button type="button" onClick={logout}>
          Sair
        </button>
      </div>
    </aside>
  );
}
