import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getStudentPerformance } from '../../../api/trainer';
import Spinner from '../../../components/ui/Spinner';

export default function StudentPerformance() {
  const { studentId, batchId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await getStudentPerformance(studentId, batchId);
        setData(res.data?.data);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load student performance');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [studentId, batchId]);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!data) return <p>No data.</p>;

  const { name, email, attemptedCount, solvedCount, totalSubmissions } = data;

  return (
    <div>
      <h2>Student Performance</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Name</h3>
          <p>{name}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Email</h3>
          <p>{email}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Attempted Problems</h3>
          <p>{attemptedCount}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Solved Problems</h3>
          <p>{solvedCount}</p>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '1rem', flex: '1 1 200px' }}>
          <h3>Total Submissions</h3>
          <p>{totalSubmissions}</p>
        </div>
      </div>
      <div style={{ marginTop: '2rem' }}>
        <Link to={`/trainer/batches/${batchId}`}>Back to Batch Details</Link>
      </div>
    </div>
  );
}
