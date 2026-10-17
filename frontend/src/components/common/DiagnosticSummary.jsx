// frontend/src/components/common/DiagnosticSummary.jsx
//
// Renders the structured part of a compiler diagnostic - category, line and
// column - ABOVE the compiler's original text, which is always shown in full and
// never rewritten.
//
// Used by both places a student runs code: the Free Console and the
// ProblemDetail/Practice execution panel. One component so the two cannot drift.
//
// It only ever reports a line or column the compiler actually printed. When the
// provider returned no usable diagnostic it renders nothing here and the caller
// shows `NO_DIAGNOSTIC_MESSAGE` instead.

import React from 'react';
import {
  primaryDiagnostic,
  severityLabel,
  isPlaceholderProviderError,
} from '../../utils/compilerDiagnostics';
import './DiagnosticSummary.css';

export default function DiagnosticSummary({ text, testId }) {
  // A placeholder sentinel is not a diagnostic, so nothing is derived from it.
  if (isPlaceholderProviderError(text)) return null;

  const diagnostic = primaryDiagnostic(text);
  if (!diagnostic) return null;

  const { severity, file, line, column, message } = diagnostic;
  // A compiler message with no location and no category change is just the text
  // below it; do not repeat it as a heading.
  const hasFields = severity || file || line !== null || column !== null;

  return (
    <div className={`diag-summary diag-summary--${severity === 'warning' || severity === 'note' ? 'warn' : 'error'}`} data-testid={testId}>
      {severity ? (
        <p className="diag-summary__category">
          <span className="diag-summary__badge">{severityLabel(severity)}</span>
          {file ? <span className="diag-summary__file">{file}</span> : null}
          {line !== null ? <span className="diag-summary__loc">Line {line}</span> : null}
          {column !== null ? <span className="diag-summary__loc">Column {column}</span> : null}
        </p>
      ) : null}
      {hasFields && message ? <p className="diag-summary__message">{message}</p> : null}
    </div>
  );
}
