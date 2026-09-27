import { useEffect, useState } from 'react';
import api from '../api';

export default function Dashboard({ onLogout }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch user');
      }
    };
    fetchUser();
  }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Dashboard</h2>
      <button onClick={onLogout}>Logout</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {user ? (
        <pre>{JSON.stringify(user, null, 2)}</pre>
      ) : (
        <p>Loading user info...</p>
      )}
    </div>
  );
}
