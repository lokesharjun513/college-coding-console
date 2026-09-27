import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: '2rem' }}>
      <h2>Admin Dashboard</h2>
      <p>Welcome, {user?.name || 'Admin'}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
