import React from 'react';
import PropTypes from 'prop-types';
import api from '../api';

/**
 * Simple dashboard component used for testing.
 * Expects an `onLogout` callback.
 */
export default function Dashboard({ onLogout }) {
  const [user, setUser] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
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

Dashboard.propTypes = {
  onLogout: PropTypes.func.isRequired,
};
