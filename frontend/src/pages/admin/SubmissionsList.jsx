/* eslint-disable-next-line no-unused-vars */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminSubmissions, deleteAdminSubmission } from '../../api/admin';
import '../../styles/pages/admin-trainers.css';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

export default function SubmissionsList() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const [language, setLanguage] = useState('');
  const [verdict, setVerdict] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: meta.page,
        limit: meta.limit,
      };
      if (language) params.language = language;
      if (verdict) params.verdict = verdict;

      const res = await getAdminSubmissions(params);
      setSubmissions(res.data?.data || []);
      setMeta(res.data?.meta || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load submissions');
      setToast({ message: err?.response?.data?.message || 'Failed to load submissions', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, language, verdict]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this submission? This action cannot be undone.')) return;
    try {
      await deleteAdminSubmission(id);
      setToast({ message: 'Submission deleted', type: 'success' });
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Delete failed', type: 'error' });
    }
  };

  const columns = [
    { key: 'studentName', header: 'Student' },
    { key: 'problemTitle', header: 'Problem' },
    { key: 'language', header: 'Language' },
    { key: 'verdict', header: 'Verdict' },
    { key: 'runtime', header: 'Runtime (s)' },
    { key: 'memory', header: 'Memory (KB)' },
    { key: 'createdAt', header: 'Submitted' },
    { key: 'actions', header: 'Actions' },
  ];

  const rows = submissions.map((s) => ({
    id: s.id,
    studentName: s.student ? s.student.name : '',
    problemTitle: s.problem ? s.problem.title : '',
    language: s.language,
    verdict: s.verdict,
    runtime: s.runtime != null ? s.runtime.toFixed(3) : '',
    memory: s.memory != null ? s.memory : '',
    createdAt: new Date(s.createdAt).toLocaleString(),
    actions: (
      <>
        <Link to={`/admin/submissions/${s.id}`}>
          <Button variant="secondary" size="sm" ariaLabel="View">View</Button>
        </Link>
        <Button
          variant="danger"
          size="sm"
          onClick={() => handleDelete(s.id)}
          ariaLabel="Delete"
          style={{ marginLeft: 'var(--space-2)' }}
        >
          Delete
        </Button>
      </>
    ),
  }));

  return (
    <>
      <PageHeader
        title="Submissions"
        description="View and manage all platform submissions."
      />
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="admin-trainers__select"
        >
          <option value="">All Languages</option>
          <option value="c">C</option>
          <option value="cpp">C++</option>
          <option value="java">Java</option>
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
        </select>
        <select
          value={verdict}
          onChange={(e) => setVerdict(e.target.value)}
          className="admin-trainers__select"
        >
          <option value="">All Verdicts</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="WRONG_ANSWER">Wrong Answer</option>
          <option value="COMPILATION_ERROR">Compilation Error</option>
          <option value="RUNTIME_ERROR">Runtime Error</option>
          <option value="TIME_LIMIT_EXCEEDED">Time Limit Exceeded</option>
          <option value="MEMORY_LIMIT_EXCEEDED">Memory Limit Exceeded</option>
          <option value="EXECUTION_ERROR">Execution Error</option>
        </select>
        {(language || verdict) && (
          <Button variant="secondary" size="sm" onClick={() => { setLanguage(''); setVerdict(''); }}>
            Clear Filters
          </Button>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {loading && <Spinner />}

      {error && <div style={{ color: 'var(--color-danger)' }}>{error}</div>}

      {!loading && !error && (
        <>
          {submissions.length === 0 ? (
            <EmptyState
              message="No submissions"
            />
          ) : (
            <div>
              <DataTable
                columns={columns}
                data={rows}
                loading={false}
                error={null}
                emptyMessage="No submissions available."
              />
              {/* Pagination */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'var(--space-4)',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                }}
              >
                <div>
                  Page {meta.page} of {meta.totalPages || 1}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={meta.page === 1}
                    onClick={() => setMeta((m) => ({ ...m, page: m.page - 1 }))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={meta.page >= meta.totalPages}
                    onClick={() => setMeta((m) => ({ ...m, page: m.page + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
