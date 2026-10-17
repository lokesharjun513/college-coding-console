import React, { useState, useRef } from 'react';
import DiagnosticSummary from '../common/DiagnosticSummary';
import './ExecutionPanel.css';

/** Ordered list drives both the tab strip and its arrow-key navigation. */
const RESULT_TABS = [
  { key: 'tests', label: 'Test Cases' },
  { key: 'output', label: 'Output' },
  { key: 'submission', label: 'Submission Result' },
];
const TABPANEL_ID = 'execution-tabpanel';
const tabId = (key) => `execution-tab-${key}`;

/**
 * The provider's own "I could not execute this" placeholder. It is a sentinel,
 * not a diagnostic: it arrives with `exit_code: -1` for EVERY failed run of the
 * languages that return no error text (measured live for python-3.14 and
 * openjdk-25 - syntax errors and runtime errors alike). Showing it to a student
 * as if it were a compiler message is misleading, so it is replaced with a
 * neutral explanation instead. Anything else in `error` is real and is shown.
 */
const PROVIDER_PLACEHOLDER = 'Internal error: code execution failed';

/** Matches the wording the Free Console already uses for the same situation. */
const AMBIGUOUS_FAILURE_MESSAGE =
  'The execution service could not run this program and returned no diagnostics, '
  + 'so the exact cause could not be determined.';

/**
 * True when the provider signalled "I would not run this" rather than "this
 * program failed". The provider reports execution time EXCLUDING compilation,
 * so a compile failure reports `time: "0"` and no stdout, while a program that
 * actually started either produced output or consumed CPU. This is the same
 * signal the backend uses to separate compile failures from runtime failures.
 */
function programActuallyRan({ output, time }) {
  if (typeof output === 'string' && output !== '') return true;
  const seconds = Number.parseFloat(time);
  return Number.isFinite(seconds) && seconds > 0;
}

/**
 * Classify a custom run (POST /api/student/problems/:id/run).
 *
 * That endpoint answers HTTP 200 with `success: true` EVEN WHEN THE PROGRAM
 * FAILED, so the HTTP status and the envelope's `success` flag both say
 * "fine". The only authoritative signals are the provider fields:
 *
 *   exit_code 0                       -> success
 *   exit_code -1                      -> ambiguous: no diagnostic available
 *   exit_code 1 + real error text      -> compilation failure or runtime failure,
 *                                         told apart by whether the program ran
 *   any other non-zero + error text    -> runtime failure
 *   non-zero, no error text            -> failure, cause unknown
 *
 * Previously this component decided success purely from `result.type`, which is
 * only 'error' when the HTTP request itself failed. Every in-band execution
 * failure - a Python syntax error included - therefore rendered as
 * "✓ Custom Execution Successful" next to "No output produced." and Exit Code -1.
 */
function classifyCustomRun(data) {
  const rawExit = data.exit_code;
  const exitCode = typeof rawExit === 'number' && Number.isFinite(rawExit) ? rawExit : undefined;
  const providerStatus = typeof data.status === 'string' ? data.status : '';
  const rawError = typeof data.error === 'string' ? data.error.trim() : '';
  const isPlaceholder = rawError === PROVIDER_PLACEHOLDER;
  const hasDiagnostic = rawError !== '' && !isPlaceholder;

  // Failure needs positive evidence: a non-zero exit code, or the provider saying
  // `status: "error"`. A response that carries neither is not evidence of failure,
  // and must not be turned into one - which also keeps a malformed or empty
  // payload from claiming the run failed when nothing said it did.
  const failed = (exitCode !== undefined && exitCode !== 0) || providerStatus === 'error';

  // A success with genuinely empty output is still a success.
  if (!failed) {
    return {
      succeeded: true,
      heading: '✓ Custom Execution Successful',
      diagnostic: null,
      showMetrics: true,
    };
  }

  if (!hasDiagnostic) {
    // Nothing to attribute and nothing to name. Say so rather than blaming the
    // compiler configuration or printing the provider's placeholder as if it
    // were a compiler message.
    return {
      succeeded: false,
      heading: '✕ Execution Failed',
      diagnostic: isPlaceholder ? AMBIGUOUS_FAILURE_MESSAGE : null,
      // "0" is the provider's placeholder for a run that never happened.
      showMetrics: false,
    };
  }

  // A real diagnostic survived. Whether the program ever started tells a
  // compilation failure from a runtime one; both are shown verbatim.
  const ran = programActuallyRan(data);
  return {
    succeeded: false,
    heading: ran ? '✕ Runtime Error' : '✕ Compilation Error',
    diagnostic: rawError,
    // Only real measurements: the provider zeroes time/memory for a run that
    // never happened, and those zeros are not a measurement of anything.
    showMetrics: ran,
  };
}

export default function ExecutionPanel({ result, isRunning, problem, activeTab: controlledTab, onActiveTabChange }) {
  const [internalTab, setInternalTab] = useState('tests');
  const activeTab = controlledTab || internalTab;
  const [expandedTest, setExpandedTest] = useState(null);
  const tabRefs = useRef({});

  const setActiveTab = (tab) => {
    setInternalTab(tab);
    onActiveTabChange?.(tab);
  };

  // Roving-tabindex arrow navigation (WAI-ARIA tabs pattern): the strip is a
  // single tab stop and Arrow/Home/End move selection and focus together.
  const onTabKeyDown = (event) => {
    const index = RESULT_TABS.findIndex((t) => t.key === activeTab);
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % RESULT_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + RESULT_TABS.length) % RESULT_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = RESULT_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextKey = RESULT_TABS[nextIndex].key;
    setActiveTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  };

  const publicTestCases = (problem?.examples || []).map((ex, i) => ({
    key: i,
    input: ex.input,
    expectedOutput: ex.output,
  }));
  const publicCount = publicTestCases.length;

  const isRun = result?.type === 'run';
  const isSubmit = result?.type === 'submit';
  const runResults = isRun ? (result.data?.results || []) : null;
  const subResults = isSubmit ? (result.data?.testResults || []) : null;
  const hiddenCount = isSubmit ? Math.max(0, subResults.length - publicCount) : null;

  const visiblePassed = isRun
    ? runResults.filter(r => r.passed).length
    : isSubmit
      ? subResults.slice(0, publicCount).filter(r => r.passed).length
      : 0;
  const hiddenPassed = isSubmit
    ? subResults.slice(publicCount).filter(r => r.passed).length
    : 0;
  const totalCount = isSubmit ? publicCount + hiddenCount : publicCount;
  const totalPassed = isSubmit ? visiblePassed + hiddenPassed : visiblePassed;

  const toggleExpand = (i) => setExpandedTest(expandedTest === i ? null : i);

  const publicStatus = (i) => {
    if (isRun && runResults[i]) return runResults[i].passed ? 'pass' : 'fail';
    if (isSubmit && subResults[i]) return subResults[i].passed ? 'pass' : 'fail';
    return null;
  };

  const hiddenRows = hiddenCount === null ? [] : Array.from({ length: hiddenCount }, (_, k) => k);
  const hiddenStatus = (k) => (isSubmit && subResults[publicCount + k] ? (subResults[publicCount + k].passed ? 'pass' : 'fail') : null);

  const renderTabContent = () => {
    if (activeTab === 'tests') {
      const headerState = isRun || isSubmit
        ? `${totalPassed} / ${totalCount}`
        : `0 / ${totalCount}`;

      return (
        <div className="test-cases-container">
          <div className="test-cases-header">
            <span>Test Cases</span>
            <span className="summary">{headerState}</span>
          </div>

          <div className="tc-section-label">Visible Test Cases</div>
          <div className="test-results-list">
            {publicTestCases.map((tc, i) => {
              const st = publicStatus(i);
              const isExpanded = expandedTest === i;
              return (
                <div key={i} className={`test-case-row ${st ? `state-${st}` : 'state-neutral'}`}>
                  <div
                    className="row-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(i)}
                    aria-expanded={isExpanded}
                  >
                    <span className={`status-icon ${st || 'pending'}`}>
                      {st === 'pass' ? '✓' : st === 'fail' ? '✕' : '○'}
                    </span>
                    <span className="title">Test Case {i + 1}</span>
                    <span className="substatus">
                      {st === 'pass' ? 'Passed' : st === 'fail' ? 'Failed' : 'Not Run'}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="row-content">
                      <div className="read-only-section">
                        <strong>Input</strong>
                        <pre className="read-only-box">{tc.input}</pre>
                      </div>
                      <div className="read-only-section">
                        <strong>Expected Output</strong>
                        <pre className="read-only-box">{tc.expectedOutput}</pre>
                      </div>
                      {(isRun || isSubmit) && (
                        <div className="read-only-section">
                          <strong>Your Output</strong>
                          <pre className={`read-only-box ${(isRun ? runResults[i]?.error : subResults[i]?.error) ? 'error' : ''}`}>
                            {
                              (isRun ? (runResults[i]?.error || runResults[i]?.output) : (subResults[i]?.error || subResults[i]?.output)) || 'No output'
                            }
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="tc-section-label">Hidden Test Cases</div>
          <div className="test-results-list">
            {hiddenCount === null ? (
              <div className="test-case-row state-locked">
                <div className="row-header">
                  <span className="status-icon lock">🔒</span>
                  <span className="title">Hidden Test Cases</span>
                  <span className="substatus">Not Run</span>
                </div>
              </div>
            ) : (
              hiddenRows.map((k) => {
                const st = hiddenStatus(k);
                return (
                  <div key={k} className={`test-case-row hidden ${st ? `state-${st}` : 'state-neutral'}`}>
                    <div className="row-header">
                      <span className={`status-icon lock ${st || ''}`}>
                        {st === 'pass' ? '✓' : st === 'fail' ? '✕' : '🔒'}
                      </span>
                      <span className="title">Hidden Test Case {k + 1}</span>
                      <span className="substatus">
                        {st === 'pass' ? 'Passed' : st === 'fail' ? 'Failed' : 'Not Run'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    if (activeTab === 'output') {
      if (!result) return <div className="text-muted">Run your code to view output.</div>;

      const isCustom = result.type === 'customRun';
      const isRequestError = result.type === 'error';
      const outputData = result.data || {};

      // Each result type comes from a different endpoint with a different
      // verdict vocabulary, so each is read on its own terms rather than through
      // one shared guess.
      let succeeded = true;
      let heading = isCustom ? '✓ Custom Execution Successful' : '✓ Execution Successful';
      let diagnostic = null;
      let showMetrics = true;
      let showExitCode = true;

      if (isRequestError) {
        // Only set when the HTTP request itself failed (4xx/5xx).
        succeeded = false;
        heading = '✕ Execution Failed';
        diagnostic = outputData.message || 'The execution request was rejected.';
        showMetrics = false;
        showExitCode = false;
      } else if (isSubmit) {
        // POST /api/student/submissions answers 201 and returns a verdict the
        // backend already computed from the provider's fields.
        const verdict = outputData.verdict;
        succeeded = verdict === 'ACCEPTED';
        heading = succeeded ? '✓ Execution Successful' : `✕ ${verdict || 'Execution Failed'}`;
        const firstFailed = (outputData.testResults || []).find((t) => !t.passed);
        diagnostic = succeeded ? null : (firstFailed?.error || null);
        showMetrics = false;
        showExitCode = false;
      } else if (isRun) {
        // POST /api/student/problems/:id/run-tests returns 'FINISHED' when every
        // row ran, otherwise the fatal verdict that stopped it.
        const runStatus = outputData.status;
        succeeded = runStatus === 'FINISHED';
        heading = succeeded ? '✓ Execution Successful' : `✕ ${runStatus || 'Execution Failed'}`;
        const firstFailed = (outputData.results || []).find((r) => !r.passed);
        diagnostic = succeeded ? null : (firstFailed?.error || null);
        showMetrics = false;
        showExitCode = false;
      } else if (isCustom) {
        const verdict = classifyCustomRun(outputData);
        succeeded = verdict.succeeded;
        heading = verdict.heading;
        diagnostic = verdict.diagnostic;
        showMetrics = verdict.showMetrics;
      }

      const stdout = typeof outputData.output === 'string' ? outputData.output
        : (typeof outputData.stdout === 'string' ? outputData.stdout : '');
      const stderr = typeof outputData.stderr === 'string' ? outputData.stderr : '';

      return (
        <div className={`execution-output ${succeeded ? 'success' : 'error'}`}>
          <div className="status-header">{heading}</div>
          {isCustom && (
            <div className="output-section">
              <strong>Custom Input</strong>
              <pre className="read-only-box">{outputData.input || 'No input provided.'}</pre>
            </div>
          )}
          {diagnostic && (
            <div className="output-section">
              <strong>{succeeded ? 'Output' : 'Error Details'}</strong>
              {/* Category / line / column when the compiler printed them.
                  Renders nothing for a Python or Java failure, where the
                  provider supplies no real diagnostic. */}
              <DiagnosticSummary text={diagnostic} testId="execution-diagnostic" />
              {/* The compiler's own text, verbatim and untruncated. */}
              <pre className="output-box">{diagnostic}</pre>
            </div>
          )}
          {!diagnostic && (stdout !== '' || stderr !== '') && (
            <div className="output-section">
              <strong>Output</strong>
              <pre className="output-box">{stdout || stderr}</pre>
            </div>
          )}
          {!diagnostic && stdout === '' && stderr === '' && succeeded && (
            <div className="output-section">
              <strong>Output</strong>
              <pre className="output-box">The program produced no output.</pre>
            </div>
          )}
          {(showExitCode || showMetrics) && (
            <div className="metadata-grid">
              {showExitCode && outputData.exit_code !== undefined && outputData.exit_code !== null && (
                <div><strong>Exit Code</strong><br />{outputData.exit_code}</div>
              )}
              {showExitCode && outputData.signal !== undefined && outputData.signal !== null && (
                <div><strong>Signal</strong><br />{outputData.signal}</div>
              )}
              {showMetrics && outputData.time !== undefined && outputData.time !== null && (
                <div><strong>Execution</strong><br />{outputData.time}s</div>
              )}
              {showMetrics && outputData.memory !== undefined && outputData.memory !== null && (
                <div><strong>Memory</strong><br />{outputData.memory} KB</div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'submission') {
      if (!result || !isSubmit) {
        return <div className="text-muted">No submission yet.</div>;
      }
      const accepted = result.data?.verdict === 'ACCEPTED';
      return (
        <div className="submission-verdict">
          <div className={`verdict-status ${accepted ? 'pass' : 'fail'}`}>
            {accepted ? '✓ Accepted' : `✕ ${result.data?.verdict || 'Wrong Answer'}`}
          </div>
          <div style={{ marginTop: '12px', fontSize: '14px', color: '#555663' }}>
            <div style={{ padding: '6px 0' }}>{visiblePassed} / {publicCount} Public Tests Passed</div>
            <div style={{ padding: '6px 0' }}>{hiddenPassed} / {hiddenCount ?? 0} Hidden Tests Passed</div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="execution-panel">
      <div className="tabs" role="tablist" aria-label="Execution results" onKeyDown={onTabKeyDown}>
        {RESULT_TABS.map(({ key, label }) => (
          <button
            key={key}
            ref={(el) => { tabRefs.current[key] = el; }}
            id={tabId(key)}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={TABPANEL_ID}
            tabIndex={activeTab === key ? 0 : -1}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="panel-content"
        role="tabpanel"
        id={TABPANEL_ID}
        aria-labelledby={tabId(activeTab)}
      >
        {isRunning ? <div className="text-muted">Executing...</div> : renderTabContent()}
      </div>
    </div>
  );
}
