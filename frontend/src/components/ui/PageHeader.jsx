import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * PageHeader – displays a title and optional breadcrumb.
 */
export default function PageHeader({ title, description, breadcrumb, actions }) {
  return (
    <header style={{ marginBottom: 'var(--space-5)' }}>
      {breadcrumb && (
        <nav
          aria-label="breadcrumb"
          style={{
            marginBottom: 'var(--space-2)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {breadcrumb}
        </nav>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <h1
            style={{
              fontSize: 'var(--font-size-3xl)',
              fontWeight: 'var(--font-weight-semibold)',
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              style={{
                marginTop: 'var(--space-2)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
      </div>
    </header>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  breadcrumb: PropTypes.node,
  actions: PropTypes.node,
};
