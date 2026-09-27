import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleRoute({ allowedRoles, children }) {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) {
    return <div>Loading…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  const role = user?.role;
  if (!allowedRoles.includes(role)) {
    const dashboard = role === 'ADMIN' ? '/admin' : role === 'TRAINER' ? '/trainer' : role === 'STUDENT' ? '/student' : '/login';
    return <Navigate to={dashboard} replace />;
  }
  return children;
}
