import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getAdminSubmission } from '../../api/admin';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';

export default function SubmissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAdminSubmission(id);
        setData(res.data?.data || null);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load submission');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return <Spinner />;
  }

  if (error || !data) {
    return (
      <>
        <PageHeader
          title="Submission Details"
          description="View detailed submission information."
        />
        <div style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-4)' }}>{error || 'Submission not found'}</div>
        <Button variant="secondary" onClick={() => navigate('/admin/submissions')}>
          Back to Submissions
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Submission Details"
        description={`View detailed information for submission ${id}`}
        actions={
          <Button variant="secondary" onClick={() => navigate('/admin/submissions')}>
            Back to Submissions
          </Button>
        }
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div style={{ flex: '1 1 200px' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 500 }}>Student</h3>
          <p style={{ margin: 0 }}>
            {data.student ? `${data.student.name} (${data.student.email})` : 'N/A'}
          </p>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 500 }}>Problem</h3>
          <p style={{ margin: 0 }}>
            {data.problem ? (
              <Link to={`/admin/problems/${data.problem.id}`}>{data.problem.title}</Link>
            ) : (
              'N/A'
            )}
          </p>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 500 }}>Language</h3>
          <p style={{ margin: 0 }}>{data.language}</p>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 500 }}>Verdict</h3>
          <p
            style={{
              margin: 0,
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: data.verdict === 'ACCEPTED' ? 'var(--color-success)' : 'var(--color-danger)',
              color: '#fff',
              fontSize: 'var(--text-sm)',
            }}
          >
            {data.verdict}
          </p>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 500 }}>Runtime</h3>
          <p style={{ margin: 0 }}>{data.runtime != null ? `${data.runtime.toFixed(3)} s` : 'N/A'}</p>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 500 }}>Memory</h3>
          <p style={{ margin: 0 }}>{data.memory != null ? `${data.memory} KB` : 'N/A'}</p>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 500 }}>Submitted</h3>
          <p style={{ margin: 0 }}>{new Date(data.createdAt).toLocaleString()}</p>
        </div>
      </div>

      <h3>Submitted Code</h3>
      <pre
        style={{
          backgroundColor: 'var(--color-surface-secondary)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-md)',
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: '400px',
          fontSize: 'var(--text-sm)',
        }}
      >
        <code>{data.code}</code>
      </pre>

      <h3 style={{ marginTop: 'var(--space-5)' }}>Test Results</h3>
      {data.testResults && data.testResults.length > 0 ? (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--text-sm)',
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 'var(--space-2)', borderBottom: '1px solid var(--color-divider)' }}>Test Case</th>
              <th style={{ textAlign: 'left', padding: 'var(--space-2)', borderBottom: '1px solid var(--color-divider)' }}>Status</th>
              <th style={{ textAlign: 'left', padding: 'var(--space-2)', borderBottom: '1px solid var(--color-divider)' }}>Output</th>
              <th style={{ textAlign: 'left', padding: 'var(--space-2)', borderBottom: '1px solid var(--color-divider)' }}>Error</th>
            </tr>
          </thead>
          <tbody>
            {data.testResults.map((tc, idx) => (
              <tr key={idx}>
                <td style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--color-divider)' }}>{idx + 1}</td>
                <td style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--color-divider)' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: tc.passed ? 'var(--color-success)' : 'var(--color-danger)',
                      color: '#fff',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    {tc.passed ? 'Passed' : 'Failed'}
                  </span>
                </td>
                <td style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--color-divider)' }}>
                  <pre style={{ margin: 0, fontSize: 'var(--text-xs)', whiteSpace: 'pre-wrap' }}>{tc.output}</pre>
                </td>
                <td style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--color-divider)' }}>
                  <pre style={{ margin: 0, fontSize: 'var(--text-xs)', whiteSpace: 'pre-wrap' }}>{tc.error || ''}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>No test results available.</div>
      )}

      {data.executionResult && (
        <div style={{ marginTop: 'var(--space-5)' }}>
          <h3>Execution Result</h3>
          <pre
            style={{
              backgroundColor: 'var(--color-surface-secondary)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              overflowX: 'auto',
              maxHeight: '400px',
              fontSize: 'var(--text-sm)',
            }}
          >
            {JSON.stringify(data.executionResult, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}
