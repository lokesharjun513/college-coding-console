import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Lock, Eye, EyeOff } from 'lucide-react';
import '../../styles/auth.css';

/**
 * PasswordInput – Labeled password input with show/hide toggle.
 *
 * @param {string}   id           - input id
 * @param {string}   label        - visible label text
 * @param {string}   value        - controlled value
 * @param {function} onChange      - change handler
 * @param {bool}     disabled     - disabled state
 * @param {bool}     hasError      - error state
 * @param {string}   errorMsg      - error message
 * @param {string}   autoComplete - browser autocomplete hint
 */
export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
  hasError = false,
  errorMsg,
  autoComplete = 'current-password',
}) {
  const [visible, setVisible] = useState(false);

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
        <span className="auth-field__icon" aria-hidden="true">
          <Lock size={16} strokeWidth={2} />
        </span>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={inputClasses}
          value={value}
          onChange={onChange}
          placeholder="Enter your password"
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="auth-field__password-toggle"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? (
            <EyeOff size={16} strokeWidth={2} />
          ) : (
            <Eye size={16} strokeWidth={2} />
          )}
        </button>
      </div>
      {errorMsg && hasError && (
        <p id={`${id}-error`} className="auth-field__error" aria-live="polite">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

PasswordInput.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  hasError: PropTypes.bool,
  errorMsg: PropTypes.string,
  autoComplete: PropTypes.string,
};