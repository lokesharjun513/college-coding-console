import React from 'react';
import PropTypes from 'prop-types';
import { AlertCircle } from 'lucide-react';
import '../../styles/auth.css';

/**
 * AuthError – Accessible error message for auth forms.
 * Uses role="alert" + aria-live for screen-reader announcement.
 */
export default function AuthError({ message }) {
  if (!message) return null;

  return (
    <div className="auth-error" role="alert" aria-live="polite">
      <AlertCircle className="auth-error__icon" size={16} strokeWidth={2.5} aria-hidden="true" />
      <p className="auth-error__message">{message}</p>
    </div>
  );
}

AuthError.propTypes = {
  message: PropTypes.string,
};