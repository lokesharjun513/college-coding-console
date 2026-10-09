import PropTypes from 'prop-types';
import Button from './Button';

/**
 * EmptyState – displays a message when there is no data.
 * Optionally shows a primary action button.
 */
export default function EmptyState({ message, actionLabel, onAction, title, description, children }) {
  const containerStyle = {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-text-muted)',
  };

  return (
    <div style={containerStyle}>
      {title && <h3 style={{ marginBottom: 'var(--space-2)' }}>{title}</h3>}
      {description && <p style={{ marginBottom: 'var(--space-4)' }}>{description}</p>}
      {message && <p style={{ fontSize: 'var(--font-size-body)', marginBottom: 'var(--space-4)' }}>{message}</p>}
      {children}
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

EmptyState.propTypes = {
  message: PropTypes.string,
  actionLabel: PropTypes.string,
  onAction: PropTypes.func,
  title: PropTypes.string,
  description: PropTypes.string,
  children: PropTypes.node,
};
