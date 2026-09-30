import React, { createContext, useState, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import api from '../api';

/**
 * AuthContext – provides authentication state and helpers.
 */
export const AuthContext = createContext(null);

/**
 * Hook to consume AuthContext.
 */
export const useAuth = () => useContext(AuthContext);

/**
 * AuthProvider – wraps the app and manages token/user state.
 */
export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const jwt = res.data?.token;
    if (jwt) {
      localStorage.setItem('token', jwt);
      setToken(jwt);
      // fetch user after login
      const meRes = await api.get('/auth/me');
      setUser(meRes.data?.user);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const restoreSession = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      setUser(res.data?.user);
    } catch (err) {
      // If unauthorized, clear token
      if (err?.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
    token,
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!token && !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
