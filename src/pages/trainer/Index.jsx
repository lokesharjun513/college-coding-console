import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function TrainerDashboard() {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: '2rem' }}>
      <h2>Trainer Dashboard</h2>
      <p>Welcome, {user?.name || 'Trainer'}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
