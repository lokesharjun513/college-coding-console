import React from 'react';
import PropTypes from 'prop-types';
import Spinner from './Spinner';
import '../../styles/components.css';

/**
 * Button – Reusable button with variant and loading state support.
 */
export default function Button({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  className = '',
  // Forward everything else (aria-label, title, data-*, aria-expanded, …) so
  // callers can keep icon-only buttons accessible.
  ...rest
}) {
  const classes = ['btn', `btn-${variant}`, `btn-${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={classes}
      aria-busy={loading}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner size={14} />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

Button.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  variant: PropTypes.oneOf(['primary', 'secondary', 'ghost', 'danger']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  loading: PropTypes.bool,
  className: PropTypes.string,
};