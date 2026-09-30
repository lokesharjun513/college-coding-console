import React from 'react';
import { Link } from 'react-router-dom';

export default function ProblemBreadcrumb({ crumbs }) {
  return (
    <nav aria-label="breadcrumb" style={{ marginBottom: 'var(--space-4)' }}>
      <ol style={{ display: 'flex', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
        {crumbs.map((c, idx) => (
          <li key={idx} style={{ display: 'flex', alignItems: 'center' }}>
            {c.onClick ? (
              <button
                type="button"
                onClick={c.onClick}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '500' }}
              >
                {c.label}
              </button>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>{c.label}</span>
            )}
            {idx < crumbs.length - 1 && <span style={{ margin: '0 var(--space-2)', color: 'var(--color-text-muted)' }}> / </span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
