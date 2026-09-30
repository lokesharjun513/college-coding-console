import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStudentProblem, runStudentProblem, createSubmission } from '../../api/student';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Card from '../../components/ui/Card';
import CompilerSelector from '../../components/CompilerSelector';
import { LEGACY_TO_COMPILER, resolveStarterCode } from '../../utils/compilerMapping';
import '../../styles/components.css';

export default function ProblemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState('');
  const [selectedCompilerId, setSelectedCompilerId] = useState('');
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchProblem = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getStudentProblem(id);
      const p = res.data.data;
      setProblem(p);
      const defaultLegacy = p.supportedLanguages?.[0] || 'javascript';
      const defaultCompiler = LEGACY_TO_COMPILER[defaultLegacy] || '';
      setSelectedCompilerId(defaultCompiler);
      setCode(resolveStarterCode(p, defaultCompiler) || '');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load this problem. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProblem();
  }, [fetchProblem]);

  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    try {
      const res = await runStudentProblem(id, { compilerId: selectedCompilerId, code, input: '' });
      setOutput(res.data.data);
    } catch (err) {
      setOutput({ status: 'Error', output: err.response?.data?.message || 'Execution error' });
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setOutput(null);
    try {
      const res = await createSubmission({ problemId: id, compilerId: selectedCompilerId, code });
      const verdict = res.data.data?.verdict || 'SUBMITTED';
      setOutput({ status: `Verdict: ${verdict}`, output: 'Submission successful' });
      fetchProblem();
    } catch (err) {
      setOutput({ status: 'Error', output: err.response?.data?.message || 'Submission failed' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="container" style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>;
  if (error) return <div className="container" style={{ padding: '24px' }}><h2>{error}</h2><Button onClick={() => navigate('/student/problems')} style={{ marginTop: '16px' }}>Back to Problems</Button></div>;
  if (!problem) return <div className="container" style={{ padding: '24px' }}><h2>Problem not found</h2><Button onClick={() => navigate('/student/problems')} style={{ marginTop: '16px' }}>Back to Problems</Button></div>;

  return (
    <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', padding: '24px' }}>
      {/* Problem Statement */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <PageHeader title={problem.title} description={`${problem.difficulty} | ${problem.topic || 'General'}`} />
          <span className={`status-badge ${problem.progress === 'SOLVED' ? 'solved' : problem.progress === 'ATTEMPTED' ? 'attempted' : 'not-started'}`}>
            {problem.progress}
          </span>
        </div>
        <p style={{ marginTop: '12px', lineHeight: '1.6' }}>{problem.description}</p>

        {problem.inputFormat && (
          <Card style={{ marginTop: '16px' }}>
            <h3>Input Format</h3>
            <p>{problem.inputFormat}</p>
          </Card>
        )}

        {problem.outputFormat && (
          <Card style={{ marginTop: '16px' }}>
            <h3>Output Format</h3>
            <p>{problem.outputFormat}</p>
          </Card>
        )}

        {problem.constraints && (
          <Card style={{ marginTop: '16px' }}>
            <h3>Constraints</h3>
            <p>{problem.constraints}</p>
          </Card>
        )}

        {problem.examples && problem.examples.map((ex, i) => (
          <Card key={i} style={{ marginTop: '16px' }}>
            <h3>Example {i+1}</h3>
            <p><strong>Input:</strong> {ex.input}</p>
            <p><strong>Output:</strong> {ex.output}</p>
            {ex.explanation && <p><strong>Explanation:</strong> {ex.explanation}</p>}
          </Card>
        ))}
      </div>

      {/* Editor & Actions */}
      <div>
        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontWeight: 600 }}>Language:</label>
          <CompilerSelector
            selectedId={selectedCompilerId}
            onChange={(compilerId) => {
              setSelectedCompilerId(compilerId);
              // Resolve starter code for the selected compiler
              const starter = resolveStarterCode(problem, compilerId);
              setCode(starter);
            }}
            disabled={false}
          />
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ width: '100%', height: '400px', fontFamily: 'var(--font-mono)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
        />
        <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: '12px' }}>
          <Button onClick={handleRun} disabled={running}>{running ? 'Running...' : 'Run Code'}</Button>
          <Button onClick={handleSubmit} disabled={submitting} variant="primary">{submitting ? 'Submitting...' : 'Submit'}</Button>
        </div>
        {output && (
          <Card style={{ marginTop: 'var(--space-2)', background: 'var(--bg-app)' }}>
            <p><strong>{output.status}</strong></p>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '13px', marginTop: '8px' }}>{output.output}</pre>
          </Card>
        )}
      </div>
    </div>
  );
}
