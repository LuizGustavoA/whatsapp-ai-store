import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute.jsx';
import Customers from './pages/Customers/Customers.jsx';
import Dashboard from './pages/Dashboard/Dashboard.jsx';
import Employees from './pages/Employees/Employees.jsx';
import EmployeesDashboard from './pages/EmployeesDashboard/EmployeesDashboard.jsx';
import FinancialDashboard from './pages/FinancialDashboard/FinancialDashboard.jsx';
import Login from './pages/Login/Login.jsx';
import Menu from './pages/Menu/Menu.jsx';
import Orders from './pages/Orders/Orders.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/financial-dashboard"
        element={
          <ProtectedRoute>
            <FinancialDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees"
        element={
          <ProtectedRoute>
            <Employees />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees-dashboard"
        element={
          <ProtectedRoute>
            <EmployeesDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <Orders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/menu"
        element={
          <ProtectedRoute>
            <Menu />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <Customers />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
