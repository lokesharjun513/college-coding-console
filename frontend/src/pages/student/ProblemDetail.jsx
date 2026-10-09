import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { getStudentProblem, runStudentTests, runStudentProblem, createSubmission } from '../../api/student';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import ExecutionPanel from '../../components/student/ExecutionPanel';
import './ProblemDetail.css';

export default function ProblemDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [runCustomInput, setRunCustomInput] = useState(false);
  const [isProblemPanelOpen, setIsProblemPanelOpen] = useState(true);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState('tests');
  const [mobileView, setMobileView] = useState('problem');
  const editorRef = useRef(null);

  const fetchProblem = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getStudentProblem(id);
      const p = res.data.data;
      setProblem(p);
      const defaultLang = p.allowedLanguages?.[0] || 'python';
      setSelectedLanguage(defaultLang);
      setCode((p.starterCode && p.starterCode[defaultLang]) || '');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load this problem.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProblem();
  }, [fetchProblem]);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setIsResultsOpen(true);
    setActiveResultTab('tests');
    setMobileView('results');
    try {
      if (runCustomInput) {
        // Run code with custom input stdin via same run endpoint
        const res = await runStudentProblem(id, { language: selectedLanguage, code, input: customInput });
        setResult({ type: 'customRun', data: res.data.data });
      } else {
        // Run code against public test cases
        const res = await runStudentTests(id, { language: selectedLanguage, code });
        setResult({ type: 'run', data: res.data.data });
      }
    } catch (err) {
      setResult({ type: 'error', data: err.response?.data || { message: 'Run failed' } });
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setResult(null);
    setIsResultsOpen(true);
    setActiveResultTab('submission');
    setMobileView('results');
    try {
      const res = await createSubmission({ problemId: id, language: selectedLanguage, code });
      setResult({ type: 'submit', data: res.data.data });
    } catch (err) {
      setResult({ type: 'error', data: err.response?.data || { message: 'Submission failed' } });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="container" style={{ padding: '60px', textAlign: 'center' }}><Spinner /></div>;
  if (error) return <div className="problem-detail-container problem-detail-error" role="alert"><p>{error}</p><Link to="/student/practice">Back to Practice</Link></div>;
  if (!problem) return <div className="container">Problem not found.</div>;

  return (
    <div className={`problem-detail-container mobile-view-${mobileView} ${!isProblemPanelOpen ? 'problem-detail-container--collapsed' : ''} ${!isResultsOpen ? 'problem-detail-container--results-closed' : ''}`}>
      <nav className="mobile-workspace-nav" aria-label="Workspace sections">
        <button type="button" className={mobileView === 'problem' ? 'is-active' : ''} onClick={() => { setMobileView('problem'); setIsProblemPanelOpen(true); }} aria-current={mobileView === 'problem' ? 'page' : undefined}>Problem</button>
        <button type="button" className={mobileView === 'code' ? 'is-active' : ''} onClick={() => { setMobileView('code'); setIsProblemPanelOpen(false); }} aria-current={mobileView === 'code' ? 'page' : undefined}>Code</button>
        <button type="button" className={mobileView === 'results' ? 'is-active' : ''} onClick={() => { setMobileView('results'); setIsProblemPanelOpen(false); setIsResultsOpen(true); }} aria-current={mobileView === 'results' ? 'page' : undefined}>Results</button>
      </nav>
      {isProblemPanelOpen && (
        <div className="problem-panel">
          <div className="problem-breadcrumb">
            <Link to="/student/practice">Practice</Link> &gt; <span>Problem</span>
          </div>
          <div className="problem-header-meta">
            <h2>{problem.title}</h2>
            <div className="meta-badges">
              <span className="badge difficulty">{problem.difficulty}</span>
              <span className="badge topic">{problem.topic}</span>
            </div>
          </div>

          <div className="problem-content">
            <section className="problem-section">
              <h3 className="problem-section__title">Description</h3>
              <div className="problem-section__content">
                <p>{problem.description}</p>
              </div>
            </section>

            {problem.examples && problem.examples.length > 0 && (
              <section className="problem-section">
                <h3 className="problem-section__title">Examples</h3>
                <div className="problem-section__content">
                  {problem.examples.map((ex, i) => (
                    <div key={i} className="example-item">
                      <div className="example-header">
                        <strong>Example {i + 1}</strong>
                      </div>
                      <div className="read-only-section">
                        <strong>Input</strong>
                        <pre className="read-only-box">{ex.input}</pre>
                      </div>
                      <div className="read-only-section">
                        <strong>Output</strong>
                        <pre className="read-only-box">{ex.output}</pre>
                      </div>
                      {ex.explanation && (
                        <div className="read-only-section">
                          <strong>Explanation</strong>
                          <pre className="read-only-box">{ex.explanation}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {problem.inputFormat && <section className="problem-section"><h3 className="problem-section__title">Input Format</h3><div className="problem-section__content"><p>{problem.inputFormat}</p></div></section>}
            {problem.outputFormat && <section className="problem-section"><h3 className="problem-section__title">Output Format</h3><div className="problem-section__content"><p>{problem.outputFormat}</p></div></section>}

             {problem.constraints && String(problem.constraints).trim().length > 0 && (
              <section className="problem-section">
                <h3 className="problem-section__title">Constraints</h3>
                <div className="problem-section__content">
                  <div className="read-only-section">
                     <pre className="read-only-box">{problem.constraints}</pre>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className="problem-panel-toggle"
        onClick={() => setIsProblemPanelOpen(!isProblemPanelOpen)}
        aria-label={isProblemPanelOpen ? 'Collapse problem statement' : 'Expand problem statement'}
        aria-expanded={isProblemPanelOpen}
      >
        {isProblemPanelOpen ? '◀' : '▶'}
      </button>

      <div className={`coding-panel ${!isProblemPanelOpen ? 'coding-panel--expanded' : ''}`}>
        <div className="editor-area">
          <div className="editor-toolbar">
            <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}>
              {(problem.allowedLanguages || []).map(lang => <option key={lang} value={lang}>{lang}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={handleRun} disabled={running}>Run</Button>
              <Button onClick={handleSubmit} disabled={submitting} variant="primary">Submit</Button>
            </div>
          </div>
          <div className="monaco-wrapper">
            <Editor
              height="100%"
              language={selectedLanguage}
              value={code}
              theme="vs-dark"
              onMount={handleEditorDidMount}
              onChange={setCode}
              options={{ fontSize: 14, minimap: { enabled: false } }}
            />
          </div>
          <div className="run-controls">
            <label className="run-custom-input-label">
              <input
                type="checkbox"
                checked={runCustomInput}
                onChange={(e) => setRunCustomInput(e.target.checked)}
              />
              Run Custom Input
            </label>
          </div>
          {runCustomInput && (
            <div className="custom-input-section">
              <label htmlFor="custom-input">Custom Input</label>
              <textarea
                id="custom-input"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Optional stdin for Run"
                rows={4}
              />
            </div>
          )}
        </div>
        <button type="button" className="results-panel-toggle" onClick={() => setIsResultsOpen((open) => !open)} aria-label={isResultsOpen ? 'Close results panel' : 'Open results panel'} aria-expanded={isResultsOpen}>
          {isResultsOpen ? '◀' : '▶'}
        </button>
        {isResultsOpen && <ExecutionPanel result={result} isRunning={running || submitting} problem={problem} activeTab={activeResultTab} onActiveTabChange={setActiveResultTab} />}
      </div>
    </div>
  );
}
