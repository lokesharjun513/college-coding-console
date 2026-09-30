import React from 'react';
import PropTypes from 'prop-types';
import Button from './Button';

/**
 * EmptyState – displays a message when there is no data.
 * Optionally shows a primary action button.
 */
export default function EmptyState({ message, actionLabel, onAction }) {
  const containerStyle = {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-text-muted)',
  };

  return (
    <div style={containerStyle}>
      <p style={{ fontSize: 'var(--font-size-body)', marginBottom: 'var(--space-4)' }}>{message}</p>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

EmptyState.propTypes = {
  message: PropTypes.string.isRequired,
  actionLabel: PropTypes.string,
  onAction: PropTypes.func,
};
