import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getTrainerBatches, getBatchProblems } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

/**
 * TrainerProblems – aggregates problems across all of the trainer's batches.
 * Backend problems are batch-scoped, so we fan out over the batch list.
 */
export default function TrainerProblems() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problems, setProblems] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const batchesRes = await getTrainerBatches();
      const batches = batchesRes.data?.data || [];
      const perBatch = await Promise.all(
        batches.map((b) =>
          getBatchProblems(b.id)
            .then((res) => (res.data?.data || []).map((p) => ({ ...p, batch: b })))
            .catch(() => [])
        )
      );
      setProblems(perBatch.flat());
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load problems');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <h2>Problems</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={fetchData}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <h2>Problems</h2>
      {problems.length === 0 ? (
        <p>
          No problems found. Open a batch to create one.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Title</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Batch</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Difficulty</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Status</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Created At</th>
                <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p.id}>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.title}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                    <Link to={`/trainer/batches/${p.batch.id}`}>{p.batch.name}</Link>
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.difficulty}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.status}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                    <Link to={`/trainer/batches/${p.batch.id}/problems/${p.id}`}>View</Link>
                    <Link
                      to={`/trainer/batches/${p.batch.id}/problems/${p.id}/edit`}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
