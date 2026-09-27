import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function StudentLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="student-layout">
      <nav className="student-nav">
        <h3>Student</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><NavLink to="/student" end>Dashboard</NavLink></li>
          <li><NavLink to="/student/problems">Problems</NavLink></li>
          <li><NavLink to="/student/submissions">Submissions</NavLink></li>
          <li><NavLink to="/student/console">Free Console</NavLink></li>
        </ul>
        <button onClick={logout} style={{ marginTop: '1rem' }}>Logout</button>
      </nav>
      <main className="student-main">
        <Outlet />
      </main>
    </div>
  );
}
