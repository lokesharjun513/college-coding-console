import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getTrainerBatches } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function TrainerDashboard() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ totalBatches: 0, totalStudents: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getTrainerBatches();
        const batches = res.data?.data || [];
        const totalBatches = batches.length;
        const totalStudents = batches.reduce((sum, b) => sum + (b.studentCount || 0), 0);
        setStats({ totalBatches, totalStudents });
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Trainer Dashboard</h2>
      <p>Welcome, {user?.name || 'Trainer'}!</p>
      <button onClick={logout}>Logout</button>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: 1 }}>
          <h3>Total Batches</h3>
          <p>{stats.totalBatches}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: 1 }}>
          <h3>Total Students</h3>
          <p>{stats.totalStudents}</p>
        </div>
      </div>
    </div>
  );
}
