import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTrainerBatch } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

import { Link } from 'react-router-dom';
export default function BatchDetails() {
  const { batchId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batch, setBatch] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getTrainerBatch(batchId);
        setBatch(res.data?.data);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load batch');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [batchId]);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div>
      <h2>{batch.name} ({batch.code})</h2>
        <Link to={`/trainer/batches/${batch.id}/students`}>View Students</Link> |
        <Link to={`/trainer/batches/${batch.id}/performance`} style={{ marginLeft: '1rem' }}>View Performance</Link> |
        <Link to={`/trainer/batches/${batch.id}/problems`} style={{ marginLeft: '1rem' }}>View Problems</Link>
      <p><strong>Description:</strong> {batch.description}</p>
      <p><strong>Status:</strong> {batch.status}</p>
      <p><strong>Dates:</strong> {new Date(batch.startDate).toLocaleDateString()} - {new Date(batch.endDate).toLocaleDateString()}</p>
      <p><strong>Trainer:</strong> {batch.trainer?.name}</p>
      <p><strong>Students:</strong> {batch.studentCount}</p>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <button disabled>Edit Batch</button>
        <button disabled style={{ color: 'red' }}>Delete Batch</button>
      </div>
    </div>
  );
}
