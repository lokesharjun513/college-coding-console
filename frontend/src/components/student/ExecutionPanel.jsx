import React, { useState } from 'react';
import './ExecutionPanel.css';

export default function ExecutionPanel({ result, isRunning, problem, activeTab: controlledTab, onActiveTabChange }) {
  const [internalTab, setInternalTab] = useState('tests');
  const activeTab = controlledTab || internalTab;
  const [expandedTest, setExpandedTest] = useState(null);

  const setActiveTab = (tab) => {
    setInternalTab(tab);
    onActiveTabChange?.(tab);
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
                          <pre className="read-only-box">
                            {(isRun ? runResults[i]?.output : subResults[i]?.output) || 'No output'}
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
      const isError = result.type === 'error';
      const outputData = isCustom ? result.data : result.data;

      return (
        <div className={`execution-output ${isError ? 'error' : 'success'}`}>
          <div className="status-header">
            {isError ? '✕ Runtime Error' : isCustom ? '✓ Custom Execution Successful' : '✓ Execution Successful'}
          </div>
          {isCustom && (
            <div className="output-section">
              <strong>Custom Input</strong>
              <pre className="read-only-box">{result.data?.input || 'No input provided.'}</pre>
            </div>
          )}
          <div className="output-section">
            <strong>Output</strong>
            <pre className="output-box">{outputData?.output || outputData?.stdout || outputData?.stderr || 'No output produced.'}</pre>
          </div>
          <div className="metadata-grid">
            {outputData?.exit_code !== undefined && <div><strong>Exit Code</strong><br />{outputData.exit_code}</div>}
            {outputData?.time !== undefined && <div><strong>Execution</strong><br />{outputData.time}ms</div>}
            {outputData?.memory !== undefined && <div><strong>Memory</strong><br />{outputData.memory} KB</div>}
          </div>
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
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={activeTab === 'tests'} onClick={() => setActiveTab('tests')}>Test Cases</button>
        <button role="tab" aria-selected={activeTab === 'output'} onClick={() => setActiveTab('output')}>Output</button>
        <button role="tab" aria-selected={activeTab === 'submission'} onClick={() => setActiveTab('submission')}>Submission Result</button>
      </div>
      <div className="panel-content" role="tabpanel">{isRunning ? <div className="text-muted">Executing...</div> : renderTabContent()}</div>
    </div>
  );
}
