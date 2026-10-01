import React, { useState } from 'react';
import { runFreeConsoleCode } from '../../api/student';
import './FreeConsole.css';
import CompilerSelector from '../../components/CompilerSelector';
import { Home, Code2, Terminal, MoreHorizontal, X, User, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const getExecutionOutput = (result) => {
  if (!result) return '';
  const val = result.stdout ?? result.output ?? result.compile_output ?? result.error ?? result.stderr ?? '';
  return typeof val === 'string' ? val : String(val);
};

export default function FreeConsole() {
  const [selectedCompilerId, setSelectedCompilerId] = useState('python-3.14');
  const [code, setCode] = useState('print("Hello, PEC Student")\n');
  const [stdin, setStdin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const navigate = useNavigate();

  const handleCompilerChange = (compilerId) => {
    if (compilerId === selectedCompilerId) return;
    setSelectedCompilerId(compilerId);
    setCode('');
    setResult(null);
    setError(null);
  };

  const handleRun = async () => {
    if (loading) return;
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

  return (
    <div className="free-console-container">
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
              <CompilerSelector selectedId={selectedCompilerId} onChange={handleCompilerChange} />
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

      {/* Mobile Bottom Navigation */}
      <nav className="bottom-nav">
        <button aria-label="Home" onClick={() => navigate('/student/dashboard')}>
          <Home size={24} />
        </button>
        <button aria-label="Practice" onClick={() => navigate('/student/practice')}>
          <Code2 size={24} />
        </button>
        <button aria-label="Free Console" className="active" onClick={() => navigate('/student/freeconsole')}>
          <Terminal size={24} />
        </button>
        <button aria-label="More" onClick={() => setIsMoreOpen(true)}>
          <MoreHorizontal size={24} />
        </button>
      </nav>

      {/* More Sheet */}
      {isMoreOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }} onClick={() => setIsMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>More Options</h3>
              <button onClick={() => setIsMoreOpen(false)} style={{ background: 'none', border: 'none' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={() => { navigate('/student/performance'); setIsMoreOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#f5f5f7', border: 'none', borderRadius: '8px', textAlign: 'left' }}>
                <BarChart2 size={18} /> Performance
              </button>
              <button onClick={() => { navigate('/student/profile'); setIsMoreOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#f5f5f7', border: 'none', borderRadius: '8px', textAlign: 'left' }}>
                <User size={18} /> Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
