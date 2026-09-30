import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Toast – transient message that appears in the top‑right corner.
 */
export default function Toast({ message, type = 'info', duration = 5000 }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  const backgroundMap = {
    info: 'var(--color-accent)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-danger)',
  };

  if (!visible) return null;

  const style = {
    position: 'fixed',
    top: 'var(--space-5)',
    right: 'var(--space-5)',
    backgroundColor: backgroundMap[type],
    color: '#fff',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-sm)',
    zIndex: 2000,
    fontSize: 'var(--font-size-sm)',
  };

  return <div style={style}>{message}</div>;
}

Toast.propTypes = {
  message: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['info', 'success', 'warning', 'error']),
  duration: PropTypes.number,
};
