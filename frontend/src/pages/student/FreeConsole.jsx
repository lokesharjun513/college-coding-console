// frontend/src/pages/student/FreeConsole.jsx
//
// Free Console — /student/freeconsole, a sandboxed scratch pad.
//
// Execution goes through POST /student/console/run and nowhere else: the browser
// never contacts a compiler, and the language → compiler mapping is resolved
// server-side. The rate limiter, the 50,000-character code limit and the
// role guard all stay where they are.
//
// Two things this page deliberately does NOT do:
//   - it does not keep its own copy of the supported-language list. That list
//     comes from GET /student/console/languages, so the selector can never offer
//     a language the run endpoint would reject with a 400.
//   - it does not invent a runtime or memory figure. Both are shown only when the
//     executor actually reported them.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Editor, { loader } from '@monaco-editor/react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Play,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { getStudentConsoleLanguages, runFreeConsoleCode } from '../../api/student';
import DiagnosticSummary from '../../components/common/DiagnosticSummary';
import OneCompilerEmbed, { isOneCompilerEmbedEnabled } from './OneCompilerEmbed';
import './FreeConsole.css';

/**
 * Used only if the language endpoint is unreachable. This is a copy of the
 * server's list and is flagged as such in the UI when it is in play, so a stale
 * fallback is visible rather than silent.
 */
const FALLBACK_LANGUAGES = [
  { value: 'python', label: 'Python', file: 'main.py' },
  { value: 'c', label: 'C', file: 'main.c' },
  { value: 'cpp', label: 'C++', file: 'main.cpp' },
  { value: 'java', label: 'Java', file: 'Main.java' },
  { value: 'typescript', label: 'TypeScript', file: 'main.ts' },
];

/** Starter program per language. This is the page's own content, not a result. */
const STARTER_CODE = {
  python: 'print("Hello, student!")\n',
  c: '#include <stdio.h>\n\nint main() {\n    printf("Hello, student!\\n");\n    return 0;\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, student!" << std::endl;\n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, student!");\n    }\n}\n',
  typescript: 'console.log("Hello, student!");\n',
};

const DEFAULT_LANGUAGE = 'python';

/**
 * Classifies the console endpoint's own response.
 *
 * The shape here is this route's contract, which is deliberately NOT the
 * platform's `{ success, data }` envelope: a successful run answers 200 with the
 * execution report at the top level, and a rejected request answers 4xx/5xx with
 * the same fields.
 */
function classify(result) {
  if (!result) return { kind: 'idle', label: 'Idle' };

  const status = result.status;
  if (status === 'timeout') return { kind: 'timeout', label: 'Timed out' };
  if (status === 'rate_limited') return { kind: 'rate_limited', label: 'Rate limited' };
  if (status === 'compile_error') return { kind: 'compile', label: 'Compilation error' };
  if (status === 'runtime_error') return { kind: 'runtime', label: 'Runtime error' };
  if (status === 'invalid_request') return { kind: 'invalid', label: 'Rejected' };
  // The provider answered but could not run the program, so there is no
  // diagnostic to show and nothing to blame on the code.
  if (status === 'execution_failed') return { kind: 'unavailable', label: 'Execution failed' };
  if (status === 'compiler_unavailable') return { kind: 'unavailable', label: 'Service unavailable' };

  const exitCode = result.exitCode;
  if (result.success === true && (exitCode === 0 || exitCode === undefined || exitCode === null)) {
    return { kind: 'success', label: 'Success' };
  }
  if (result.error) return { kind: 'runtime', label: 'Runtime error' };
  return { kind: 'unknown', label: result.success ? 'Success' : 'Error' };
}

const STATUS_ICON = {
  idle: Circle,
  success: CheckCircle2,
  compile: XCircle,
  runtime: XCircle,
  timeout: Clock3,
  // Distinct from the program states: the service refused the request, so nothing
  // here says anything about the student's code.
  rate_limited: Clock3,
  invalid: AlertTriangle,
  unavailable: AlertTriangle,
  unknown: AlertTriangle,
};

/** The console endpoint reports both camelCase and snake_case output fields. */
function readOutput(result) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = result?.[key];
      if (value !== undefined && value !== null && value !== '') {
        return typeof value === 'string' ? value : String(value);
      }
    }
    return '';
  };
  return {
    output: pick('output', 'stdout'),
    errors: pick('error', 'stderr', 'compile_output'),
  };
}

export default function FreeConsole() {
  const [languages, setLanguages] = useState([]);
  const [languagesStale, setLanguagesStale] = useState(false);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);

  const [code, setCode] = useState(STARTER_CODE[DEFAULT_LANGUAGE]);
  const [stdin, setStdin] = useState('');
  const [dirty, setDirty] = useState(false);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [requestError, setRequestError] = useState(null);
  const [pendingLanguage, setPendingLanguage] = useState(null);

  // Supersession guard. Re-armed in the effect BODY: React 18 StrictMode unmounts
  // and remounts components in development, and a cleanup-only flag stays false
  // and silently discards the response.
  const requestId = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    loader.init().then((monaco) => {
      monaco.editor.defineTheme('student-console-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#151A23',
          'editor.foreground': '#CCD0D5',
          'editor.lineNumberForeground': '#9FA0B5',
          'editorCursor.foreground': '#2F7EDA',
          'editorIndentGuide.background': '#2C3545',
          'editor.lineHighlightBackground': '#1B2230',
        },
      });
    });
  }, []);

  // The selector is driven by the server's own list.
  useEffect(() => {
    let active = true;
    getStudentConsoleLanguages()
      .then((response) => {
        if (!active) return;
        const list = Array.isArray(response?.data?.data) && response.data.data.length
          ? response.data.data
          : FALLBACK_LANGUAGES;
        setLanguages(list);
        // A fallback means the endpoint did not answer; say so rather than let a
        // possibly-stale list look authoritative.
        setLanguagesStale(list === FALLBACK_LANGUAGES);
        // Never leave the selection on a language the server will not run.
        setLanguage((current) => (list.some((l) => l.value === current) ? current : list[0]?.value ?? DEFAULT_LANGUAGE));
      })
      .catch(() => {
        if (!active) return;
        setLanguages(FALLBACK_LANGUAGES);
        setLanguagesStale(true);
      });
    return () => { active = false; };
  }, []);

  const current = languages.find((l) => l.value === language);
  const fileName = current?.file || 'main.txt';

  const handleCodeChange = useCallback((value) => {
    setCode(value ?? '');
    setDirty((value ?? '') !== (STARTER_CODE[language] ?? ''));
  }, [language]);

  const run = useCallback(async () => {
    if (running) return;
    requestId.current += 1;
    const ticket = requestId.current;
    setRunning(true);
    setResult(null);
    setRequestError(null);
    try {
      const response = await runFreeConsoleCode({ code, language, input: stdin });
      if (!mounted.current || ticket !== requestId.current) return;
      setResult(response.data ?? null);
    } catch (err) {
      if (!mounted.current || ticket !== requestId.current) return;
      // A rejected request still carries a report on the body; show that when it
      // is there, and fall back to the transport message otherwise.
      const body = err?.response?.data;
      const httpStatus = err?.response?.status;
      // Both throttling paths mean the same thing to the student and are shown as
      // such. Either the provider answered 429 (the console route reports
      // `status: 'rate_limited'`) or this app's own code-execution limiter
      // answered 429 (a bare `{ message, code: 'RATE_LIMIT_EXCEEDED' }` with no
      // `status`), which previously fell through to the generic transport-failure
      // panel and was badged "Service unavailable".
      const throttled =
        httpStatus === 429 || body?.code === 'RATE_LIMIT_EXCEEDED' || body?.status === 'rate_limited';

      if (throttled) {
        setResult({
          ...(body && typeof body === 'object' ? body : {}),
          status: 'rate_limited',
          success: false,
          exitCode: null,
          output: '',
          error: body?.error || body?.message || 'Too many code executions. Please wait before running again.',
        });
      } else if (body && typeof body === 'object' && (body.status || body.error)) {
        setResult({ ...body, __requestFailed: true });
      } else {
        setRequestError(body?.message || err?.message || 'Could not reach the code execution service.');
      }
    } finally {
      if (mounted.current && ticket === requestId.current) setRunning(false);
    }
  }, [code, language, stdin, running]);

  const reset = useCallback(() => {
    setCode(STARTER_CODE[language] ?? '');
    setStdin('');
    setDirty(false);
    setResult(null);
    setRequestError(null);
  }, [language]);

  const clearOutput = useCallback(() => {
    setResult(null);
    setRequestError(null);
  }, []);

  const requestLanguageChange = (event) => {
    const next = event.target.value;
    if (next === language) return;
    setPendingLanguage(next);
  };

  const confirmLanguageChange = () => {
    if (!pendingLanguage) return;
    // Switching languages replaces the buffer, so any run still in flight was
    // started against a buffer and a language that are no longer on screen.
    // Bumping the ticket makes that response discard itself through the
    // supersession check in `run` instead of landing as a stale report: without
    // this, confirming the dialog mid-run paints the previous language's output
    // under the new language's editor and file tab.
    requestId.current += 1;
    // The superseded request's own `finally` will not release the running flag,
    // because its ticket no longer matches, so it is released here instead.
    setRunning(false);
    setLanguage(pendingLanguage);
    setCode(STARTER_CODE[pendingLanguage] ?? '');
    setDirty(false);
    setResult(null);
    setRequestError(null);
    setPendingLanguage(null);
  };

  const cancelLanguageChange = () => setPendingLanguage(null);

  const classification = requestError ? { kind: 'unavailable', label: 'Service unavailable' } : classify(result);
  const StatusIcon = STATUS_ICON[classification.kind] || Circle;
  const { output, errors } = readOutput(result);
  const hasReport = Boolean(result);

  return (
    <main className="fc-page">
      <div className="fc-inner">
        <nav className="student-breadcrumb" aria-label="Breadcrumb">
          <Link className="student-breadcrumb__link" to="/student">Student</Link>
          <span className="student-breadcrumb__separator" aria-hidden="true">/</span>
          <span className="student-breadcrumb__current" aria-current="page">Free Console</span>
        </nav>

        {/* The breadcrumb names the page and the workspace is the focus, so there
            is no visible title block duplicating it. The heading stays in the
            document for screen readers and for the document outline. */}
        <h1 className="fc-visually-hidden">Free Console</h1>

        {/* One row, one control height: the language select, Reset and Run all
            share a baseline instead of the select sitting below a stacked
            label. */}
        <div className="fc-toolbar">
          <label className="fc-field" htmlFor="fc-language">
            <span className="fc-field__label">Language</span>
            <select
              id="fc-language"
              className="fc-select"
              value={language}
              onChange={requestLanguageChange}
            >
              {languages.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <div className="fc-toolbar__spacer" />

          <button type="button" className="fc-button" onClick={reset}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset
          </button>

          <button
            type="button"
            className="fc-button fc-button--primary"
            onClick={run}
            disabled={running}
            aria-busy={running}
          >
            <Play size={14} aria-hidden="true" />
            {running ? 'Running…' : 'Run code'}
          </button>
        </div>

        {languagesStale ? (
          <p className="fc-notice" role="status">
            The language list could not be loaded, so a built-in list is being used. One of these
            languages may no longer be available.
          </p>
        ) : null}

        <div className="fc-workspace">
          <section className="fc-pane" aria-label="Code editor">
            {/* Filename only: a terminal icon and a second language badge would
                just restate the selector in the toolbar. */}
            <header className="fc-pane__bar">
              <span className="fc-pane__filename">{fileName}{dirty ? ' •' : ''}</span>
            </header>
            <div className="fc-editor">
              <Editor
                height="100%"
                language={language}
                value={code}
                onChange={handleCodeChange}
                theme="student-console-dark"
                options={{
                  automaticLayout: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  tabSize: 4,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </div>
          </section>

          <div className="fc-column">
            <section className="fc-pane" aria-label="Execution output">
              <header className="fc-pane__bar">
                <span
                  className={`fc-status fc-status--${classification.kind}`}
                  role={classification.kind === 'success' ? 'status' : undefined}
                >
                  <StatusIcon size={13} aria-hidden="true" />
                  {running ? 'Running' : classification.label}
                </span>
                {hasReport || requestError ? (
                  <button
                    type="button"
                    className="fc-button fc-button--ghost fc-button--small"
                    onClick={clearOutput}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    Clear
                  </button>
                ) : null}
              </header>

              <div className="fc-output" aria-live="polite">
                {running ? (
                  <p className="fc-output__empty">Executing…</p>
                ) : requestError ? (
                  <div className="fc-report" role="alert">
                    <p className="fc-report__title">Could not run your code</p>
                    <p className="fc-report__message">{requestError}</p>
                    <button type="button" className="fc-button fc-button--primary fc-button--small" onClick={run}>
                      Try again
                    </button>
                  </div>
                ) : !hasReport ? (
                  <p className="fc-output__empty">Run your code to see its output here.</p>
                ) : (
                  <>
                    {output ? <pre className="fc-output__stdout">{output}</pre> : null}
                    {errors ? (
                      <>
                        {/* Structured category / line / column, when the compiler
                            printed them. Renders nothing when the provider gave no
                            real diagnostic, so a Python or Java failure still shows
                            only the honest message below. */}
                        <DiagnosticSummary text={errors} testId="fc-diagnostic" />
                        {/* The compiler's own text, verbatim and untruncated. */}
                        <pre className="fc-output__stderr">{errors}</pre>
                      </>
                    ) : null}
                    {!output && !errors ? <p className="fc-output__empty">The program produced no output.</p> : null}
                  </>
                )}
              </div>

              {hasReport || requestError ? (
                <footer className="fc-meta">
                  {result?.status ? <span>Status: {result.status}</span> : null}
                  {result?.exitCode !== undefined && result?.exitCode !== null ? (
                    <span>Exit code: {result.exitCode}</span>
                  ) : null}
                  {/* Shown only when the executor actually measured them. */}
                  {result?.time ? <span>Runtime: {result.time}s</span> : null}
                  {result?.memory ? <span>Memory: {result.memory} KB</span> : null}
                </footer>
              ) : null}
            </section>

            <section className="fc-pane" aria-label="Program input">
              <header className="fc-pane__bar">
                <span className="fc-pane__title">Standard input</span>
                <span className="fc-pane__badge">Optional</span>
              </header>
              <label className="fc-visually-hidden" htmlFor="fc-stdin">Standard input</label>
              <textarea
                id="fc-stdin"
                className="fc-stdin"
                value={stdin}
                onChange={(event) => setStdin(event.target.value)}
                placeholder="Passed to your program's stdin"
                spellCheck={false}
              />
            </section>
          </div>
        </div>

        {/* Changing language replaces the buffer, so it is confirmed first. */}
        {pendingLanguage ? (
          <div className="fc-confirm" role="dialog" aria-modal="true" aria-labelledby="fc-confirm-title">
            <div className="fc-confirm__card">
              <h2 className="fc-confirm__title" id="fc-confirm-title">Change programming language?</h2>
              <p className="fc-confirm__body">
                Switching to {languages.find((l) => l.value === pendingLanguage)?.label || pendingLanguage} replaces the
                editor contents with that language&apos;s starter program.
              </p>
              <div className="fc-confirm__actions">
                <button type="button" className="fc-button" onClick={cancelLanguageChange}>
                  Cancel
                </button>
                <button type="button" className="fc-button fc-button--primary" onClick={confirmLanguageChange}>
                  Change language
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* TEMPORARY EXPERIMENT. Additive only, and rendered below the console so
            the two editors — which both carry a language selector, a stdin box and
            a Run button — stay visually separate. Leaving
            VITE_USE_ONECOMPILER_TEST_EMBED unset renders nothing here and restores
            this page exactly as it was. */}
        {isOneCompilerEmbedEnabled() ? <OneCompilerEmbed /> : null}
      </div>
    </main>
  );
}