import React, { useState } from 'react';
import { runFreeConsoleCode } from '../../api/student';
import './FreeConsole.css';

const getExecutionOutput = (result) => {
  if (!result) return '';
  const val = result.stdout ?? result.output ?? result.compile_output ?? result.error ?? result.stderr ?? '';
  return typeof val === 'string' ? val : String(val);
};

// Free-console languages (JavaScript intentionally excluded — no JS compiler available)
const CONSOLE_LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'typescript', label: 'TypeScript' },
];

const DEFAULT_CODE = {
  python: 'print("Hello, PEC Student")\n',
  c: '#include <stdio.h>\n\nint main() {\n    printf("Hello, PEC Student\\n");\n    return 0;\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, PEC Student" << std::endl;\n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, PEC Student");\n    }\n}\n',
  typescript: 'console.log("Hello, PEC Student");\n',
};

export default function FreeConsole() {
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [code, setCode] = useState(DEFAULT_CODE.python);
  const [stdin, setStdin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleLanguageChange = (lang) => {
    if (lang === selectedLanguage) return;
    setSelectedLanguage(lang);
    setCode(DEFAULT_CODE[lang] || '');
    setResult(null);
    setError(null);
  };

  const handleRun = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await runFreeConsoleCode({ code, language: selectedLanguage, input: stdin });
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

  return (
    <div className="free-console-container free-console">
      <header className="console-header">
        <div className="console-title-area">
          <h1>Free Console</h1>
        </div>
        <div className="console-status">
          <span className={`status-dot ${loading ? 'running' : ''}`}></span>
          {loading ? 'Running...' : 'Ready'}
        </div>
      </header>

      <main className="workspace">
        <div className="editor-area">
          <div className="toolbar">
            <div className="toolbar-left">
              <select
                value={selectedLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
              >
                {CONSOLE_LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="toolbar-right" style={{ display: 'flex', gap: '8px' }}>
              <button className="btn" style={{ background: '#333', color: '#fff' }} onClick={handleReset}>Reset</button>
              <button className="btn btn-primary" onClick={handleRun} disabled={loading}>
                {loading ? 'Running...' : 'Run Code'}
              </button>
            </div>
          </div>
          <textarea
            className="editor-textarea"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck="false"
            placeholder="Write your code here..."
          />
        </div>

        <div className="panels-grid">
          <div className="panel">
            <h3>Input</h3>
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Provide input..."
            />
          </div>
          <div className="panel">
            <h3>Output</h3>
            <pre className={status === 'error' ? 'error-text' : 'success-text'}>
              {loading ? 'Running your code...' : (outputText || error || 'Output will appear here.')}
            </pre>
            {result && (
              <div className="metrics-row" style={{ marginTop: '8px', fontSize: '0.8rem', color: '#666' }}>
                {result.time && <span>Runtime: {result.time}s | </span>}
                {result.memory && <span>Memory: {result.memory} KB</span>}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
