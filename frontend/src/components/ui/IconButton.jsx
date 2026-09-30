import React from 'react';
import PropTypes from 'prop-types';
import Icon from './Icon';

/**
 * IconButton – button that contains only an icon.
 * Accessible via aria-label.
 */
export default function IconButton({ name, onClick, disabled, size = 20, ariaLabel }) {
  const style = {
    background: 'transparent',
    border: 'none',
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'background-color var(--motion-fast) var(--motion-ease)',
  };

  const hoverStyle = {
    backgroundColor: 'var(--color-elevated)',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={style}
      onMouseEnter={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, hoverStyle);
      }}
      onMouseLeave={(e) => {
        Object.assign(e.currentTarget.style, { background: 'transparent' });
      }}
    >
      <Icon name={name} size={size} />
    </button>
  );
}

IconButton.propTypes = {
  name: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  size: PropTypes.number,
  ariaLabel: PropTypes.string.isRequired,
};
