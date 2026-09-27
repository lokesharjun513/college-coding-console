import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function TrainerLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="trainer-layout">
      <nav className="trainer-nav">
        <h3>Trainer</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><NavLink to="/trainer" end>Dashboard</NavLink></li>
          <li><NavLink to="/trainer/batches">Batches</NavLink></li>
        </ul>
        <button onClick={logout} style={{ marginTop: '1rem' }}>Logout</button>
      </nav>
      <main className="trainer-main">
        <Outlet />
      </main>
    </div>
  );
}
