import React from 'react';

// Human-facing message per backend error code
const ERROR_CODE_MESSAGES = {
  COMPILER_NOT_CONFIGURED: {
    label: 'Compiler Not Configured',
    message: 'This problem is not fully configured for the selected language. Please contact the administrator.',
  },
  COMPILER_NOT_SUPPORTED: {
    label: 'Compiler Unavailable',
    message: 'The compiler for this language is no longer available. Please contact the administrator.',
  },
  UNSUPPORTED_LANGUAGE: {
    label: 'Invalid Language',
    message: 'This language is not supported for this problem.',
  },
  NOT_FOUND: {
    label: 'Access Denied',
    message: 'This problem was not found or you do not have access to it.',
  },
};

// Helper to classify execution result
function classifyExecution(result) {
  if (!result) return { type: 'empty', label: 'No output', icon: '◌' };

  const { status, exit_code, error, stdout, errorCode } = result;

  // Backend-classified errors take precedence over generic exit-code guessing
  if (errorCode && ERROR_CODE_MESSAGES[errorCode]) {
    return {
      type: 'config_error',
      label: ERROR_CODE_MESSAGES[errorCode].label,
      message: ERROR_CODE_MESSAGES[errorCode].message,
      icon: '✕',
    };
  }

  if (status === 'timeout' || exit_code === 124) {
    return { type: 'timeout', label: 'Execution Timed Out', icon: '✕' };
  }

  if (status === 'compile_error' || error?.includes('Compilation')) {
    return { type: 'compile_error', label: 'Compilation Error', icon: '✕' };
  }

  if (exit_code === 137 || exit_code === 139 || error?.includes('killed')) {
    return { type: 'runtime_error', label: 'Runtime Error', icon: '✕' };
  }

  if (status === 'success' && exit_code === 0) {
    return { type: 'success', label: 'Execution Successful', icon: '✓' };
  }

  if (error || exit_code !== 0) {
    return { type: 'runtime_error', label: 'Runtime Error', icon: '✕' };
  }

  return { type: 'success', label: 'Execution Successful', icon: '✓' };
}

// Helper to format memory value
function formatMemory(memoryKb) {
  if (memoryKb == null) return '—';
  const mb = memoryKb / 1024;
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${memoryKb} KB`;
}

export default function ExecutionOutput({ result, isRunning }) {
  if (isRunning) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.icon}>◌</span>
          <span style={styles.label}>Running...</span>
        </div>
        <div style={styles.spinner} />
      </div>
    );
  }

  if (!result) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.icon}>◌</span>
          <span style={styles.label}>Run your code to see the output</span>
        </div>
      </div>
    );
  }

  const classification = classifyExecution(result);

  if (classification.type === 'config_error') {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={{ ...styles.icon, color: '#f59e0b' }}>{classification.icon}</span>
          <span style={styles.label}>{classification.label}</span>
        </div>
        <div style={styles.content}>
          <p style={styles.message}>{classification.message}</p>
        </div>
      </div>
    );
  }

  if (classification.type === 'timeout') {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={{ ...styles.icon, color: '#f59e0b' }}>{classification.icon}</span>
          <span style={styles.label}>{classification.label}</span>
        </div>
        <div style={styles.content}>
          <p style={styles.message}>
            The program exceeded the allowed execution time.
          </p>
          {result.time && (
            <div style={styles.metadata}>
              <span>Execution time: {result.time}s</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (classification.type === 'compile_error') {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={{ ...styles.icon, color: '#ef4444' }}>{classification.icon}</span>
          <span style={styles.label}>{classification.label}</span>
        </div>
        <div style={styles.content}>
          {result.output && (
            <div style={styles.outputSection}>
              <h4 style={styles.outputTitle}>Compiler Output</h4>
              <pre style={styles.pre}>{result.output}</pre>
            </div>
          )}
          {result.error && (
            <div style={styles.errorSection}>
              <h4 style={styles.errorTitle}>Error</h4>
              <pre style={styles.pre}>{result.error}</pre>
            </div>
          )}
        </div>
        {result.exit_code !== undefined && (
          <div style={styles.metadata}>
            <span>Exit Code: {result.exit_code}</span>
          </div>
        )}
      </div>
    );
  }

  if (classification.type === 'runtime_error') {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={{ ...styles.icon, color: '#ef4444' }}>{classification.icon}</span>
          <span style={styles.label}>{classification.label}</span>
        </div>
        <div style={styles.content}>
          {result.output && (
            <div style={styles.outputSection}>
              <h4 style={styles.outputTitle}>Output</h4>
              <pre style={styles.pre}>{result.output}</pre>
            </div>
          )}
          {result.error && (
            <div style={styles.errorSection}>
              <h4 style={styles.errorTitle}>Error</h4>
              <pre style={styles.pre}>{result.error}</pre>
            </div>
          )}
        </div>
        <div style={styles.metadata}>
          <span>Exit Code: {result.exit_code ?? '—'}</span>
          {result.time && <span>Execution time: {result.time}s</span>}
        </div>
      </div>
    );
  }

  // Success case
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={{ ...styles.icon, color: '#10b981' }}>{classification.icon}</span>
        <span style={styles.label}>{classification.label}</span>
      </div>
      <div style={styles.content}>
        {result.output !== null && result.output !== undefined && result.output !== '' ? (
          <div style={styles.outputSection}>
            <h4 style={styles.outputTitle}>Output</h4>
            <pre style={styles.pre}>{result.output}</pre>
          </div>
        ) : (
          <p style={styles.message}>No output produced.</p>
        )}
      </div>
      <div style={styles.metadata}>
        <span>Status: {result.status ?? 'success'}</span>
        <span>Exit Code: {result.exit_code ?? '0'}</span>
        {result.time && <span>Execution: {result.time}s</span>}
        {result.total && <span>Total: {result.total}s</span>}
        {result.memory && <span>Memory: {formatMemory(result.memory)}</span>}
        {result.signal && <span>Signal: {result.signal}</span>}
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: 'var(--bg-app)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '16px',
    marginTop: 'var(--space-2)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  icon: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  label: {
    fontWeight: '600',
    fontSize: '14px',
  },
  content: {
    marginBottom: '12px',
  },
  message: {
    color: '#6b7280',
    margin: 0,
  },
  outputSection: {
    marginBottom: '12px',
  },
  outputTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginTop: 0,
    marginBottom: '4px',
  },
  errorTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#ef4444',
    textTransform: 'uppercase',
    marginTop: 0,
    marginBottom: '4px',
  },
  pre: {
    margin: 0,
    padding: '12px',
    background: '#1f2937',
    color: '#f3f4f6',
    borderRadius: '6px',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  metadata: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    fontSize: '12px',
    color: '#6b7280',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '12px',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid transparent',
    borderTop: '2px solid var(--primary-color)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};
