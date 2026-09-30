import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAdminTestCases, createAdminTestCase, updateAdminTestCase, deleteAdminTestCase } from '../../api/admin';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';

export default function TestCasesList() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Form state
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [sampleExplanation, setSampleExplanation] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editInput, setEditInput] = useState('');
  const [editOutput, setEditOutput] = useState('');
  const [editHidden, setEditHidden] = useState(false);
  const [editExplanation, setEditExplanation] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminTestCases(problemId);
      setTestCases(res.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load test cases');
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createAdminTestCase(problemId, {
        input,
        expectedOutput: output,
        isHidden,
        sampleExplanation,
      });
      setToast({ message: 'Test case added', type: 'success' });
      setInput('');
      setOutput('');
      setIsHidden(false);
      setSampleExplanation('');
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to add', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (tc) => {
    setEditingId(tc.id);
    setEditInput(tc.input);
    setEditOutput(tc.expectedOutput);
    setEditHidden(tc.isHidden);
    setEditExplanation(tc.sampleExplanation || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditInput('');
    setEditOutput('');
    setEditHidden(false);
    setEditExplanation('');
  };

  const handleUpdate = async (testCaseId) => {
    setSaving(true);
    try {
      await updateAdminTestCase(problemId, testCaseId, {
        input: editInput,
        expectedOutput: editOutput,
        isHidden: editHidden,
        sampleExplanation: editExplanation,
      });
      setToast({ message: 'Test case updated', type: 'success' });
      cancelEdit();
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Update failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (testCaseId) => {
    if (!window.confirm('Delete this test case?')) return;
    try {
      await deleteAdminTestCase(problemId, testCaseId);
      setToast({ message: 'Test case deleted', type: 'success' });
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Delete failed', type: 'error' });
    }
  };

  return (
    <>
      <PageHeader
        title="Test Cases"
        description="Manage test cases for this problem"
        actions={
          <Button variant="secondary" onClick={() => navigate(`/admin/problems/${problemId}`)}>
            ← Back to Problem
          </Button>
        }
      />
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {loading && <Spinner />}
      {error && <div style={{ color: 'var(--color-danger)' }}>{error}</div>}
      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Add form */}
          <Card elevation="card">
            <h3 style={{ marginTop: 0, fontSize: 'var(--text-md)', fontWeight: 600 }}>Add Test Case</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <label htmlFor="tc-input" style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>Input *</label>
                <textarea
                  id="tc-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  rows={3}
                  required
                  style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}
                />
              </div>
              <div>
                <label htmlFor="tc-output" style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>Expected Output *</label>
                <textarea
                  id="tc-output"
                  value={output}
                  onChange={e => setOutput(e.target.value)}
                  rows={3}
                  required
                  style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input
                  id="tc-hidden"
                  type="checkbox"
                  checked={isHidden}
                  onChange={e => setIsHidden(e.target.checked)}
                />
                <label htmlFor="tc-hidden" style={{ cursor: 'pointer' }}>Hidden (not shown to students)</label>
              </div>
              <div>
                <label htmlFor="tc-explanation" style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>Explanation</label>
                <textarea
                  id="tc-explanation"
                  value={sampleExplanation}
                  onChange={e => setSampleExplanation(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Test Case'}</Button>
              </div>
            </form>
          </Card>

          {/* List */}
          {testCases.length === 0 ? (
            <EmptyState message="No test cases. Add at least one test case for this problem." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {testCases.map((tc, idx) => (
                <Card key={tc.id} elevation="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <strong style={{ fontSize: 'var(--text-sm)' }}>
                      Test Case {idx + 1}
                      {tc.isHidden && <span style={{ marginLeft: '0.5rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>(hidden)</span>}
                    </strong>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      {editingId === tc.id ? (
                        <>
                          <Button size="sm" onClick={() => handleUpdate(tc.id)} disabled={saving}>Save</Button>
                          <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => startEdit(tc)} ariaLabel="Edit">Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => handleDelete(tc.id)} ariaLabel="Delete">Delete</Button>
                        </>
                      )}
                    </div>
                  </div>
                  {editingId === tc.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div>
                        <label htmlFor={`edit-input-${tc.id}`} style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>Input</label>
                        <textarea
                          id={`edit-input-${tc.id}`}
                          value={editInput}
                          onChange={e => setEditInput(e.target.value)}
                          rows={2}
                          style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}
                        />
                      </div>
                      <div>
                        <label htmlFor={`edit-output-${tc.id}`} style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>Expected Output</label>
                        <textarea
                          id={`edit-output-${tc.id}`}
                          value={editOutput}
                          onChange={e => setEditOutput(e.target.value)}
                          rows={2}
                          style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <input
                          id={`edit-hidden-${tc.id}`}
                          type="checkbox"
                          checked={editHidden}
                          onChange={e => setEditHidden(e.target.checked)}
                        />
                        <label htmlFor={`edit-hidden-${tc.id}`} style={{ cursor: 'pointer' }}>Hidden</label>
                      </div>
                      <div>
                        <label htmlFor={`edit-exp-${tc.id}`} style={{ display: 'block', fontWeight: 500, marginBottom: '0.25rem' }}>Explanation</label>
                        <textarea
                          id={`edit-exp-${tc.id}`}
                          value={editExplanation}
                          onChange={e => setEditExplanation(e.target.value)}
                          rows={2}
                          style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Input</span>
                        <pre style={{ background: 'var(--color-surface-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', marginTop: '0.25rem', overflowX: 'auto', fontSize: 'var(--text-sm)' }}>{tc.input}</pre>
                      </div>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Expected Output</span>
                        <pre style={{ background: 'var(--color-surface-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', marginTop: '0.25rem', overflowX: 'auto', fontSize: 'var(--text-sm)' }}>{tc.expectedOutput}</pre>
                      </div>
                      {tc.sampleExplanation && (
                        <div>
                          <span style={{ fontWeight: 500, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Explanation</span>
                          <p style={{ marginTop: '0.25rem', fontSize: 'var(--text-sm)' }}>{tc.sampleExplanation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}