import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProblem } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function ProblemDetails() {
  const { batchId, problemId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getProblem(batchId, problemId);
        setProblem(res.data?.data);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load problem');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [batchId, problemId]);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div>
      <h2>{problem.title}</h2>
      <p><strong>Difficulty:</strong> {problem.difficulty}</p>
      <p><strong>Status:</strong> {problem.status}</p>
      <p><strong>Description:</strong></p>
      <pre>{problem.description}</pre>
      <Link to={`/trainer/batches/${batchId}/problems/${problemId}/edit`}>Edit Problem</Link>
      <br />
      <Link to={`/trainer/batches/${batchId}/problems/${problemId}/testcases`}>View Test Cases</Link> |
        <Link to={`/trainer/batches/${batchId}/problems/${problemId}/performance`} style={{ marginLeft: '1rem' }}>View Performance</Link>
    </div>
  );
}
