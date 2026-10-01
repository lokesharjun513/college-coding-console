import axios from 'axios';

const apiBaseURL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.PUBLIC_API_URL ||
  'http://localhost:3000/api';

console.log('API BASE URL:', apiBaseURL);

const api = axios.create({
  baseURL: apiBaseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token');

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;