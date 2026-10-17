import React from 'react';

/**
 * LogViewer – renders raw compiler/execution logs with VS Code-like styling.
 *
 * Props:
 *   - log: string – raw log output (may contain line numbers, caret ^, pipe |,
 *     and "error:"/"warning:" markers).
 */
export default function LogViewer({ log }) {
  const lines = log ? log.split('\n') : [];

  const renderLine = (line, idx) => {
    const lower = line.toLowerCase();
    const isError = lower.includes('error:') || lower.includes('error');
    const isWarning = lower.includes('warning:') || lower.includes('warning');

    const lineClass = isError
      ? 'text-red-400 font-bold'
      : isWarning
      ? 'text-yellow-400 font-bold'
      : '';

    // Split on caret ^ and pipe |
    const segments = line.split(/(\^+|\|)/g);

    return (
      <div key={idx} className={`${lineClass} whitespace-pre`}>
        {segments.map((seg, i) => {
          if (seg.startsWith('^')) {
            return (
              <span key={i} className="text-green-400 font-bold">
                {seg}
              </span>
            );
          }
          if (seg === '|') {
            return (
              <span key={i} className="text-gray-500">
                {seg}
              </span>
            );
          }
          const coordMatch = seg.match(/^(\s*\d+:\d+):/);
          if (coordMatch) {
            const coord = coordMatch[0];
            const rest = seg.slice(coord.length);
            return (
              <React.Fragment key={i}>
                <span className="text-blue-400">{coord}</span>
                <span>{rest}</span>
              </React.Fragment>
            );
          }
          return <span key={i}>{seg}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="bg-black text-gray-100 p-4 rounded-lg overflow-auto font-mono text-sm">
      {lines.map((line, idx) => renderLine(line, idx))}
    </div>
  );
}
