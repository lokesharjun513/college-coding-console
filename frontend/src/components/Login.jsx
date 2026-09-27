import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Redirect after successful login based on role
  React.useEffect(() => {
    if (user?.role) {
      const target = user.role === 'ADMIN' ? '/admin' : user.role === 'TRAINER' ? '/trainer' : '/student';
      navigate(target, { replace: true });
    }
  }, [user, navigate]);

  return (
    <div style={{ maxWidth: '400px', margin: 'auto', padding: '2rem' }}>
      <h2>Login</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email:</label><br />
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="password">Password:</label><br />
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
        </div>
        <button type="submit" style={{ marginTop: '1rem' }} disabled={loading}>
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}
