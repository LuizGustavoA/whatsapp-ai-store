import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const AuthContext = createContext(null);

const STORAGE_TOKEN = 'attendant_token';
const STORAGE_USER = 'attendant_user';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(STORAGE_USER);

    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem(STORAGE_USER);
      return null;
    }
  });

  const login = (authToken, employeeData) => {
    localStorage.setItem(STORAGE_TOKEN, authToken);
    localStorage.setItem(STORAGE_USER, JSON.stringify(employeeData));
    setToken(authToken);
    setUser(employeeData);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
    setToken(null);
    setUser(null);
  };

  const hasPermission = useCallback(
    (permissionKey) => Boolean(user?.permissions?.[permissionKey]),
    [user]
  );

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      permissions: user?.permissions || {},
      hasPermission,
      login,
      logout
    }),
    [token, user, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }

  return context;
}
