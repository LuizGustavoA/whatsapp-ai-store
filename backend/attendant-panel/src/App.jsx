import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute.jsx';
import PermissionRoute from './components/PermissionRoute/PermissionRoute.jsx';
import Login from './pages/Login/Login.jsx';
import Menu from './pages/Menu/Menu.jsx';
import Orders from './pages/Orders/Orders.jsx';
import CreateOrder from './pages/CreateOrder/CreateOrder.jsx';
import Conversations from './pages/Conversations/Conversations.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Navigate to="/orders" replace />
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
        path="/novo-pedido"
        element={
          <ProtectedRoute>
            <PermissionRoute permission="create_order">
              <CreateOrder />
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/conversations"
        element={
          <ProtectedRoute>
            <Conversations />
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
      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}
