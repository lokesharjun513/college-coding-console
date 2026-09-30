import React from 'react';
import PropTypes from 'prop-types';
import { Mail } from 'lucide-react';
import '../../styles/auth.css';

/**
 * AuthInput – Accessible labeled text input for auth forms.
 *
 * @param {string}   id          - input id (required, used for label htmlFor)
 * @param {string}   label       - visible label text
 * @param {string}   type        - input type (default: 'text')
 * @param {string}   value       - controlled value
 * @param {function} onChange    - change handler
 * @param {string}   placeholder - placeholder text
 * @param {bool}     disabled    - disabled state
 * @param {bool}     hasError    - visually indicate error state
 * @param {string}   errorMsg    - error message (used with aria-describedby)
 * @param {string}   autoComplete - browser autocomplete hint
 * @param {bool}     showIcon    - show leading mail icon (default: true for email type)
 */
export default function AuthInput({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  hasError = false,
  errorMsg,
  autoComplete,
  showIcon = true,
}) {
  const inputClasses = [
    'auth-field__input',
    hasError ? 'auth-field__input--error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const describedBy = errorMsg ? `${id}-error` : undefined;

  return (
    <div className="auth-field">
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="auth-field__input-wrapper">
        {showIcon && type === 'email' && (
          <span className="auth-field__icon" aria-hidden="true">
            <Mail size={16} strokeWidth={2} />
          </span>
        )}
        <input
          id={id}
          type={type}
          className={inputClasses}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={describedBy}
        />
      </div>
      {errorMsg && hasError && (
        <p id={`${id}-error`} className="auth-field__error" aria-live="polite">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

AuthInput.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  type: PropTypes.string,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  hasError: PropTypes.bool,
  errorMsg: PropTypes.string,
  autoComplete: PropTypes.string,
  showIcon: PropTypes.bool,
};
