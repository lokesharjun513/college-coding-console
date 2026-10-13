import React from 'react';
import PropTypes from 'prop-types';

/**
 * Input – Accessible labeled text input.
 *
 * @param {string}   id          - input id (required, used for label htmlFor)
 * @param {string}   label       - visible label text
 * @param {string}   type        - input type (default: 'text')
 * @param {string}   value       - controlled value
 * @param {function} onChange    - change handler
 * @param {string}   placeholder - placeholder text
 * @param {bool}     disabled    - disabled state
 * @param {string}   className   - additional CSS classes
 */
export default function Input({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
}) {
  return (
    <div className="mb-4">
      <label
        className="block text-sm font-medium text-muted-foreground mb-2"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={`block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required
      />
    </div>
  );
}

Input.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  type: PropTypes.string,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};