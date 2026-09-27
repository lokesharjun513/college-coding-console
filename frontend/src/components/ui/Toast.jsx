import React from 'react';

export default function Toast({ message, type = 'info' }) {
  const bg = type === 'error' ? 'var(--color-danger)' : type === 'success' ? 'var(--color-success)' : 'var(--color-primary)';
  return (
    <div style={{ background: bg, color: 'white', padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', position: 'fixed', top: 'var(--space-md)', right: 'var(--space-md)' }}>
      {message}
    </div>
  );
}
