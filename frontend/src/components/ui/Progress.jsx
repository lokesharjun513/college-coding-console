import React from 'react';
import PropTypes from 'prop-types';

/**
 * Progress – simple progress bar.
 *
 * @param {number} value - progress value (0-100)
 * @param {string} className - additional CSS classes
 */
export default function Progress({ value, className = '' }) {
  return (
    <div className={`w-full rounded-full h-2.5 ${className}`}>
      <div
        className={`h-full rounded-full transition-all`}
        style={{ width: `${value}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin="0"
        aria-valuemax="100"
      ></div>
    </div>
  );
}

Progress.propTypes = {
  value: PropTypes.number.isRequired,
  className: PropTypes.string,
};