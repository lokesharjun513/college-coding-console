import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBatchProblems, deleteProblem } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function ProblemsList() {
  const { batchId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problems, setProblems] = useState([]);

  const fetchData = async () => {
    try {
      const res = await getBatchProblems(batchId);
      setProblems(res.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load problems');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [batchId]);

  const handleDelete = async (problemId) => {
    if (!window.confirm('Archive this problem?')) return;
    try {
      await deleteProblem(batchId, problemId);
      await fetchData();
    } catch (err) {}
  };

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div>
      <h2>Problems</h2>
      <Link to={`/trainer/batches/${batchId}/problems/create`}>Create New Problem</Link>
      {problems.length === 0 ? (
        <p>No problems found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Title</th>
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
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.difficulty}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{p.status}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                  <Link to={`/trainer/batches/${batchId}/problems/${p.id}`}>View</Link>
                  <Link to={`/trainer/batches/${batchId}/problems/${p.id}/edit`} style={{ marginLeft: '0.5rem' }}>Edit</Link>
                  <button onClick={() => handleDelete(p.id)} style={{ marginLeft: '0.5rem', color: 'red' }}>Archive</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
