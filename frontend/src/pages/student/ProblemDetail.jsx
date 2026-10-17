import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import Editor, { loader } from '@monaco-editor/react';
import { Play, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
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

  // Define the same dark editor theme Free Console uses so the code surface is
  // visually identical across the student area instead of Monaco's stock vs-dark.
  useEffect(() => {
    loader.init().then((monaco) => {
      monaco.editor.defineTheme('student-console-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#151A23',
          'editor.foreground': '#CCD0D5',
          'editorLineNumber.foreground': '#9FA0B5',
          'editorCursor.foreground': '#2F7EDA',
          'editorIndentGuide.background1': '#2C3545',
          'editor.lineHighlightBackground': '#1B2230',
        },
      });
    });
  }, []);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  // Collapsing/expanding a pane animates the grid for ~300ms. Monaco's
  // automaticLayout is throttled, so nudge a relayout once the transition
  // settles and the editor never keeps a stale width for a frame.
  useEffect(() => {
    const timer = setTimeout(() => editorRef.current?.layout?.(), 320);
    return () => clearTimeout(timer);
  }, [isProblemPanelOpen, isResultsOpen]);

  // `selectedLanguage` is the problem's own language key (e.g. 'python') taken
  // from `allowedLanguages`. The server resolves the compiler from it via
  // `problem.compilers.get(language)`; sending a compiler id (e.g. 'python-3.14')
  // fails the `allowedLanguages.includes(language)` guard with a 400, so the raw
  // key is the only value these endpoints accept.
  const handleRun = async () => {
    if (running || submitting) return;
    setRunning(true);
    setResult(null);
    setIsResultsOpen(true);
    // A custom-input run reports through the Output tab; a test run through Tests.
    setActiveResultTab(runCustomInput ? 'output' : 'tests');
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
      // The Tests/Submission tabs never render a request error, so a failed run
      // would otherwise look like the button did nothing. The Output tab shows it.
      setActiveResultTab('output');
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (running || submitting) return;
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
      setActiveResultTab('output');
    } finally {
      setSubmitting(false);
    }
  };

  // A batch-assigned problem belongs to the Assigned Problems list; a global
  // one belongs to Practice. Sending a student back to the wrong list used to
  // dump every global-practice student onto the assigned-problems page. Before
  // the statement has loaded there is no scope to read, so the assigned list is
  // the default destination.
  const backHref = problem?.scope === 'GLOBAL' ? '/student/practice' : '/student/problems';
  const backLabel = problem?.scope === 'GLOBAL' ? 'Back to Practice' : 'Back to Assigned Problems';

  if (loading) return <div className="container" style={{ padding: '60px', textAlign: 'center' }}><Spinner /></div>;
  if (error) return <div className="problem-detail-container problem-detail-error" role="alert"><p>{error}</p><Link to={backHref}>{backLabel}</Link></div>;
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
          <header className="problem-panel__bar">
            <nav className="problem-breadcrumb" aria-label="Breadcrumb">
              <Link className="problem-breadcrumb__link" to={backHref}>{backLabel}</Link>
              <span className="problem-breadcrumb__sep" aria-hidden="true">/</span>
              <span className="problem-breadcrumb__current" aria-current="page">Problem</span>
            </nav>
            {problem.difficulty && (
              <span className="pd-difficulty" data-difficulty={String(problem.difficulty).toLowerCase()}>
                {problem.difficulty}
              </span>
            )}
          </header>

          <div className="problem-panel__body">
          <div className="problem-header-meta">
            <h2>{problem.title}</h2>
            {problem.topic && (
              <div className="meta-badges">
                <span className="pd-tag">{problem.topic}</span>
              </div>
            )}
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
        </div>
      )}

      <button
        type="button"
        className="problem-panel-toggle"
        onClick={() => setIsProblemPanelOpen(!isProblemPanelOpen)}
        aria-label={isProblemPanelOpen ? 'Collapse problem description' : 'Expand problem description'}
        title={isProblemPanelOpen ? 'Collapse problem description' : 'Expand problem description'}
        aria-expanded={isProblemPanelOpen}
      >
        {isProblemPanelOpen ? <ChevronLeft size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
      </button>

      <div className={`coding-panel ${!isProblemPanelOpen ? 'coding-panel--expanded' : ''}`}>
        <div className="editor-area">
          <div className="editor-toolbar">
            <label className="pd-field" htmlFor="pd-language">
              <span className="pd-field__label">Language</span>
              <select id="pd-language" value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}>
                {(problem.allowedLanguages || []).map(lang => <option key={lang} value={lang}>{lang}</option>)}
              </select>
            </label>
            <div className="pd-actions">
              <Button
                onClick={handleRun}
                disabled={running || submitting}
                loading={running}
                variant="secondary"
                aria-label="Run"
              >
                <Play size={14} aria-hidden="true" />
                Run
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || running}
                loading={submitting}
                variant="primary"
                aria-label="Submit"
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                Submit
              </Button>
            </div>
          </div>
          <div className="monaco-wrapper">
            <Editor
              height="100%"
              language={selectedLanguage}
              value={code}
              theme="student-console-dark"
              onMount={handleEditorDidMount}
              onChange={setCode}
              options={{
                automaticLayout: true,
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                tabSize: 4,
                padding: { top: 12, bottom: 12 },
              }}
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
        <button type="button" className="results-panel-toggle" onClick={() => setIsResultsOpen((open) => !open)} aria-label={isResultsOpen ? 'Collapse results panel' : 'Expand results panel'} title={isResultsOpen ? 'Collapse results panel' : 'Expand results panel'} aria-expanded={isResultsOpen}>
          {isResultsOpen ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
        </button>
        {isResultsOpen && <ExecutionPanel result={result} isRunning={running || submitting} problem={problem} activeTab={activeResultTab} onActiveTabChange={setActiveResultTab} />}
      </div>
    </div>
  );
}
