import React, { useEffect, useState } from 'react';
import { getSubmissions } from '../../api/student';
import Spinner from '../../components/ui/Spinner';
import { Link } from 'react-router-dom';

export default function SubmissionsList() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await getSubmissions();
        setSubmissions(res.data?.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load submissions');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div>
      <h2>My Submissions</h2>
      {submissions.length === 0 ? (
        <p>No submissions yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Problem</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Language</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Verdict</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Submitted At</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{s.problem}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{s.language}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{s.verdict}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{new Date(s.createdAt).toLocaleString()}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                  <Link to={`/student/submissions/${s.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
