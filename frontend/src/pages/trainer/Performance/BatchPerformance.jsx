import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBatchPerformance } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function BatchPerformance() {
  const { batchId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await getBatchPerformance(batchId);
        setData(res.data?.data);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load performance');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [batchId]);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!data) return <p>No data.</p>;

  const { totalStudents, activeStudents, totalProblems, totalSubmissions, solvedProblems, progress } = data;

  return (
    <div>
      <h2>Batch Performance</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Total Students</h3>
          <p>{totalStudents}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Active Students</h3>
          <p>{activeStudents}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Total Problems</h3>
          <p>{totalProblems}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Total Submissions</h3>
          <p>{totalSubmissions}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Solved Problems</h3>
          <p>{solvedProblems}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Progress</h3>
          <p>{progress}%</p>
        </div>
      </div>
      <div style={{ marginTop: '2rem' }}>
        <Link to={`/trainer/batches/${batchId}`}>Back to Batch Details</Link>
      </div>
    </div>
  );
}
