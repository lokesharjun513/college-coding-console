import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProblemPerformance } from '../../../api/trainer';
import Spinner from '../../../components/ui/Spinner';

export default function ProblemPerformance() {
  const { problemId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await getProblemPerformance(problemId);
        setData(res.data?.data);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load problem performance');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [problemId]);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!data) return <p>No data.</p>;

  const { totalSubmissions, solvedCount, studentProgress } = data;

  return (
    <div>
      <h2>Problem Performance</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Total Submissions</h3>
          <p>{totalSubmissions}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Solved Count</h3>
          <p>{solvedCount}</p>
        </div>
      </div>
      <h3>Student Progress</h3>
      {studentProgress.length === 0 ? (
        <p>No student attempts.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Student ID</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Attempts</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Solved</th>
            </tr>
          </thead>
          <tbody>
            {studentProgress.map(sp => (
              <tr key={sp.id}>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{sp.id}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{sp.attempts}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{sp.solved ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <div style={{ marginTop: '2rem' }}>
        <Link to="/trainer">Back to Dashboard</Link>
      </div>
    </div>
  );
}
