import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: '2rem' }}>
      <h2>Student Dashboard</h2>
      <p>Welcome, {user?.name || 'Student'}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
