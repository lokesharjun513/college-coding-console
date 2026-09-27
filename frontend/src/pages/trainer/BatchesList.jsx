import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTrainerBatches } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function BatchesList() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getTrainerBatches();
        setBatches(res.data?.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load batches');
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
    <div>
      <h2>Batches</h2>
      {batches.length === 0 ? (
        <p>No batches found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Code</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Status</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Students</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id}>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{batch.name}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{batch.code}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{batch.status}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{batch.studentCount}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                  <Link to={`/trainer/batches/${batch.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
