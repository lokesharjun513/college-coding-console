import React, { useState } from 'react';
import { runFreeConsoleCode } from '../../api/student';
import './FreeConsole.css';
import CompilerSelector from '../../components/CompilerSelector';

// Robust normalizer selecting the first non-empty execution output field
const getExecutionOutput = (result) => {
  if (!result) return '';
  const val =
    result.stdout ??
    result.output ??
    result.compile_output ??
    result.error ??
    result.stderr ??
    '';
  return typeof val === 'string' ? val : String(val);
};

export default function FreeConsole() {
  const [selectedCompilerId, setSelectedCompilerId] = useState('python-3.14');
  const [code, setCode] = useState('print("Hello, PEC Student")\n');
  const [stdin, setStdin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCompilerChange = (compilerId) => {
    if (compilerId === selectedCompilerId) return;
    setSelectedCompilerId(compilerId);
    setCode(''); // clear on change
    setResult(null);
    setError(null);
  };

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await runFreeConsoleCode({ code, compilerId: selectedCompilerId, input: stdin });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to execute code');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCode('');
    setStdin('');
    setResult(null);
    setError(null);
  };

  const outputText = getExecutionOutput(result);
  const status = result?.status || (result?.success ? 'success' : error ? 'error' : null);

  const getStatusBadge = (st, success) => {
    switch (st) {
      case 'success':
        return <span className="status-badge success">Success</span>;
      case 'compile_error':
        return <span className="status-badge error">Compile Error</span>;
      case 'runtime_error':
        return <span className="status-badge error">Runtime Error</span>;
      case 'timeout':
        return <span className="status-badge warning">Timeout</span>;
      case 'compiler_unavailable':
        return <span className="status-badge warning">Compiler Unavailable</span>;
      default:
        return success ? <span className="status-badge success">Success</span> : <span className="status-badge error">Error</span>;
    }
  };

  return (
    <div className="free-console-container">
      {/* Header */}
      <header className="console-header">
        <div className="console-title-area">
          <h1>🖥️ Student Free Console</h1>
          <p>Experiment with multi-language code execution in a sandboxed environment.</p>
        </div>
        <div className="console-actions">
          <button className="reset-btn" onClick={handleReset}>Reset Code</button>
          <button className="run-btn" onClick={handleRun} disabled={loading}>
            {loading ? 'Executing...' : '▶ Run Code'}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="console-workspace">
        {/* Left pane: Editor & Input */}
        <div className="editor-pane">
          <div className="pane-header">
            <div className="language-selector">
              <label>Language:</label>
              <CompilerSelector selectedId={selectedCompilerId} onChange={handleCompilerChange} />
            </div>
            <span className="file-name">{selectedCompilerId.split('-')[0]}.txt</span>
          </div>

          <div className="code-editor-wrapper">
            <textarea
              className="code-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck="false"
              placeholder="Write your code here..."
            />
          </div>

          <div className="stdin-section">
            <label className="stdin-label">Standard Input (stdin):</label>
            <textarea
              className="stdin-textarea"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Provide input for your program if needed..."
              rows={3}
            />
          </div>
        </div>

        {/* Right pane: Execution Output */}
        <div className="output-pane">
          <div className="output-header-bar">
            <h3>OUTPUT</h3>
            <div className="output-meta-group">
              {result && (
                <span className="metadata-text">
                  {result.exitCode !== undefined && `Exit code: ${result.exitCode}`}
                  {result.time && `     ${result.time}s`}
                </span>
              )}
              {getStatusBadge(status, result?.success)}
            </div>
          </div>

          <div className="output-content-area">
            {loading && (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Compiling and executing code...</p>
              </div>
            )}

            {error && !result && (
              <div className="error-banner">
                <strong>Error:</strong> {error}
              </div>
            )}

            {!loading && !result && !error && (
              <div className="empty-output">
                <span>⚡</span>
                <p>Click &quot;Run Code&quot; to compile and execute your program.</p>
              </div>
            )}

            {result && (
              <div className="output-scroll-container">
                {status === 'success' && outputText === '' ? (
                  <div className="no-output-message">
                    Program executed successfully.<br />
                    No output was produced.
                  </div>
                ) : (
                  <pre className={`output-pre ${status === 'compile_error' || status === 'runtime_error' || !result.success ? 'error-text' : 'success-text'}`}>
                    {outputText || result.error || '(No output)'}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
