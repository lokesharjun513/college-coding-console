import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  createAdminProblem,
  getAdminProblem,
  updateAdminProblem,
  getAdminTestCases,
  createAdminTestCase,
  updateAdminTestCase,
  deleteAdminTestCase,
} from '../../api/admin';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import '../../styles/pages/admin-problems.css';

const LANG_OPTIONS = ['c', 'cpp', 'java', 'python', 'typescript', 'php', 'ruby', 'haskell', 'go', 'rust', 'csharp', 'fsharp'];

const EMPTY_TC = () => ({ input: '', expectedOutput: '', isHidden: false, sampleExplanation: '', order: 0 });

export default function ProblemEditor() {
  const { problemId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!problemId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Problem fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('EASY');
  const [constraints, setConstraints] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [batch, setBatch] = useState('');
  const [allowedLanguages, setAllowedLanguages] = useState([]);
  const [starterCode, setStarterCode] = useState({});

  // Test Cases
  const [testCasesLoading, setTestCasesLoading] = useState(false);
  const [testCases, setTestCases] = useState([]);
  const [tcIndex, setTcIndex] = useState(null); // index of test case being edited (null = add new)

  useEffect(() => {
    if (isEdit) {
      getAdminProblem(problemId)
        .then(res => {
          const p = res.data?.data;
          if (!p) return;
          setTitle(p.title || '');
          setDescription(p.description || '');
          setDifficulty(p.difficulty || 'EASY');
          setConstraints(p.constraints || '');
          setInputFormat(p.inputFormat || '');
          setOutputFormat(p.outputFormat || '');
          setStatus(p.status || 'DRAFT');
          setBatch(p.batch?.id || '');
          setAllowedLanguages(p.allowedLanguages || []);
          setStarterCode({ ...(p.starterCode || {}) });
        })
        .catch(err => setError(err?.response?.data?.message || 'Failed to load problem'))
        .finally(() => setLoading(false));

      // Load existing test cases
      setTestCasesLoading(true);
      getAdminTestCases(problemId)
        .then(res => setTestCases((res.data?.data || []).map(tc => ({
          id: tc.id,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isHidden: tc.isHidden,
          sampleExplanation: tc.sampleExplanation || '',
          order: tc.order,
        }))))
        .catch(() => setToast({ message: 'Failed to load test cases', type: 'error' }))
        .finally(() => setTestCasesLoading(false));
    }
  }, [problemId, isEdit]);

  const handleLanguageToggle = (lang) => {
    setAllowedLanguages(prev => {
      const next = prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang];
      // Keep a starter-code slot for every selected language
      setStarterCode(cur => {
        const sc = { ...cur };
        if (next.includes(lang) && sc[lang] === undefined) sc[lang] = '';
        return sc;
      });
      return next;
    });
  };

  // --- Test case editing helpers ---
  const updateTc = (field, value) => {
    setTestCases(prev => prev.map((tc, i) => (i === tcIndex ? { ...tc, [field]: value } : tc)));
  };

  const saveTestCases = async (targetProblemId, existingIds) => {
    // Build edits against the test cases in state
    const ops = [];
    testCases.forEach((tc) => {
      if (tc.id) {
        // Existing: PATCH with any changed values
        const payload = {
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isHidden: tc.isHidden,
          sampleExplanation: tc.sampleExplanation,
          order: tc.order,
        };
        ops.push({ kind: 'update', id: tc.id, payload });
      } else {
        // New: POST
        ops.push({
          kind: 'create',
          payload: {
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isHidden: tc.isHidden,
            sampleExplanation: tc.sampleExplanation,
            order: tc.order,
          },
        });
      }
    });
    // Delete any that were removed from state
    ops.push(...existingIds.filter(id => !testCases.some(tc => tc.id === id)).map(id => ({ kind: 'delete', id })));

    for (const op of ops) {
      if (op.kind === 'create') await createAdminTestCase(targetProblemId, op.payload);
      else if (op.kind === 'update') await updateAdminTestCase(targetProblemId, op.id, op.payload);
      else await deleteAdminTestCase(targetProblemId, op.id);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (allowedLanguages.length === 0) {
      setToast({ message: 'Select at least one language', type: 'error' });
      return;
    }
    if (testCases.length === 0) {
      setToast({ message: 'Add at least one test case', type: 'error' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        description,
        difficulty,
        constraints,
        inputFormat,
        outputFormat,
        status,
        allowedLanguages,
        starterCode,
        ...(batch ? { batch } : {}),
      };
      if (isEdit) {
        const existingIds = testCases.filter(tc => tc.id).map(tc => tc.id);
        await updateAdminProblem(problemId, payload);
        await saveTestCases(problemId, existingIds);
        setToast({ message: 'Problem updated', type: 'success' });
      } else {
        const res = await createAdminProblem(payload);
        const newId = res.data?.data?.id;
        await saveTestCases(newId, []);
        setToast({ message: 'Problem created', type: 'success' });
      }
      setTimeout(() => navigate('/admin/problems'), 1000);
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'var(--color-danger)' }}>{error}</div>;

  return (
    <div className="problem-editor">
      <PageHeader
        title={isEdit ? 'Edit Problem' : 'Create Problem'}
        description="Configure problem details, programming language, starter code, and test cases in one place"
        className="problem-editor__header"
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Card elevation="card">
        <form onSubmit={handleSubmit} className="problem-editor__form">
          {/* Title */}
          <div className="problem-editor__field">
            <label htmlFor="title" className="problem-editor__label">Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="problem-editor__input"
            />
          </div>
          {/* Description */}
          <div className="problem-editor__field">
            <label htmlFor="description" className="problem-editor__label">Description *</label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              required
              className="problem-editor__textarea"
            />
          </div>
          {/* Difficulty + Status row */}
          <div className="problem-editor__row">
            <div className="problem-editor__field">
              <label htmlFor="difficulty" className="problem-editor__label">Difficulty *</label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="problem-editor__select"
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div className="problem-editor__field">
              <label htmlFor="status" className="problem-editor__label">Status</label>
              <select
                id="status"
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="problem-editor__select"
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>
          {/* Batch */}
          <div className="problem-editor__field">
            <label htmlFor="batch" className="problem-editor__label">Batch ID (optional)</label>
            <input
              id="batch"
              type="text"
              value={batch}
              onChange={e => setBatch(e.target.value)}
              placeholder="MongoDB ObjectId"
              className="problem-editor__input"
            />
          </div>
          {/* Input/Output format */}
          <div className="problem-editor__row">
            <div className="problem-editor__field">
              <label htmlFor="inputFormat" className="problem-editor__label">Input Format</label>
              <textarea
                id="inputFormat"
                value={inputFormat}
                onChange={e => setInputFormat(e.target.value)}
                rows={2}
                className="problem-editor__textarea"
              />
            </div>
            <div className="problem-editor__field">
              <label htmlFor="outputFormat" className="problem-editor__label">Output Format</label>
              <textarea
                id="outputFormat"
                value={outputFormat}
                onChange={e => setOutputFormat(e.target.value)}
                rows={2}
                className="problem-editor__textarea"
              />
            </div>
          </div>
          {/* Constraints */}
          <div className="problem-editor__field">
            <label htmlFor="constraints" className="problem-editor__label">Constraints</label>
            <textarea
              id="constraints"
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              rows={3}
              className="problem-editor__textarea"
            />
          </div>
          {/* Allowed Languages */}
          <div className="problem-editor__field">
            <label className="problem-editor__label">Allowed Languages *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              {LANG_OPTIONS.map(lang => (
                <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allowedLanguages.includes(lang)}
                    onChange={() => handleLanguageToggle(lang)}
                  />
                  {lang}
                </label>
              ))}
            </div>
          </div>
          {/* Starter Code per language */}
          <div className="problem-editor__field">
            <label className="problem-editor__label">Starter Code (per language)</label>
            {allowedLanguages.length === 0 ? (
              <small style={{ color: 'var(--color-muted)' }}>Select languages above to configure starter code.</small>
            ) : (
              allowedLanguages.map(lang => (
                <div key={lang} style={{ marginBottom: 'var(--space-2)' }}>
                  <label className="problem-editor__label" style={{ marginBottom: '2px', textTransform: 'capitalize' }}>{lang}</label>
                  <textarea
                    value={starterCode[lang] || ''}
                    onChange={e => setStarterCode(cur => ({ ...cur, [lang]: e.target.value }))}
                    rows={4}
                    placeholder={`Starter code for ${lang}…`}
                    className="problem-editor__textarea"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              ))
            )}
          </div>

          {/* Test Cases */}
          <div className="problem-editor__field">
            <label className="problem-editor__label">Test Cases *</label>
            {testCasesLoading ? <Spinner /> : (
              <>
                {testCases.map((tc, i) => (
                  <div key={tc.id || `new-${i}`} style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: 'var(--space-3)',
                    marginBottom: 'var(--space-2)',
                    background: i === tcIndex ? 'var(--color-surface-alt, #f7f8fa)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                      <strong>Test Case {i + 1}{tc.isHidden ? ' (hidden)' : ''}</strong>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setTcIndex(i)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => {
                            setTestCases(prev => prev.filter((_, j) => j !== i));
                            if (tcIndex === i) setTcIndex(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', margin: '0' }}>
                      <strong>Input:</strong> {tc.input || '(empty)'}<br />
                      <strong>Expected:</strong> {tc.expectedOutput || '(empty)'}
                    </p>
                  </div>
                ))}
                {tcIndex !== null && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                    <div className="problem-editor__field">
                      <label className="problem-editor__label">Input</label>
                      <textarea
                        value={testCases[tcIndex]?.input || ''}
                        onChange={e => updateTc('input', e.target.value)}
                        rows={3}
                        className="problem-editor__textarea"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div className="problem-editor__field">
                      <label className="problem-editor__label">Expected Output</label>
                      <textarea
                        value={testCases[tcIndex]?.expectedOutput || ''}
                        onChange={e => updateTc('expectedOutput', e.target.value)}
                        rows={3}
                        className="problem-editor__textarea"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div className="problem-editor__field">
                      <label className="problem-editor__label">Sample Explanation</label>
                      <textarea
                        value={testCases[tcIndex]?.sampleExplanation || ''}
                        onChange={e => updateTc('sampleExplanation', e.target.value)}
                        rows={2}
                        className="problem-editor__textarea"
                      />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!testCases[tcIndex]?.isHidden}
                        onChange={e => updateTc('isHidden', e.target.checked)}
                      />
                      Hidden test case (not shown to students)
                    </label>
                    <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--space-2)' }}>
                      <Button type="button" variant="primary" onClick={() => setTcIndex(null)}>Done</Button>
                    </div>
                  </div>
                )}
                {testCases.length === 0 && (
                  <p style={{ color: 'var(--color-muted)' }}>No test cases yet. Add at least one to enable submissions.</p>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setTestCases(prev => [...prev, { ...EMPTY_TC(), order: prev.length }]);
                    setTcIndex(testCases.length);
                  }}
                >
                  + Add Test Case
                </Button>
              </>
            )}
          </div>

          {/* Submit */}
          <div className="problem-editor__actions">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button variant="secondary" onClick={() => navigate('/admin/problems')}>Cancel</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
