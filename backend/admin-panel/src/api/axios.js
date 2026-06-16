import axios from 'axios';

const rawApiUrl = import.meta.env.VITE_API_URL || '/api';

const normalizeApiBaseUrl = (url) => {
  if (!url || url === '/api') {
    return '/api';
  }

  // Erro comum: apontar para http://localhost:3000/api — o backend não usa /api nas rotas.
  if (/^https?:\/\//i.test(url) && url.replace(/\/+$/, '').endsWith('/api')) {
    return url.replace(/\/api\/?$/, '');
  }

  return url;
};

const API_BASE_URL = normalizeApiBaseUrl(rawApiUrl);
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');

      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const loginPath = `${base}/login`;

      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
