import React from 'react';
import PropTypes from 'prop-types';

/**
 * Spinner — animated ring spinner using CSS.
 * Respects prefers-reduced-motion.
 */
export default function Spinner({ size = 20, className = '' }) {
  return (
    <span
      className={`spinner ${className}`}
      role="status"
      aria-label="Loading"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="spinner__track"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <circle
          className="spinner__arc"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="31.4 31.4"
        />
      </svg>
    </span>
  );
}

Spinner.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};
