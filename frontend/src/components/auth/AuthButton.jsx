import React from 'react';
import PropTypes from 'prop-types';
import { ArrowRight } from 'lucide-react';
import Spinner from '../ui/Spinner';
import '../../styles/auth.css';

/**
 * AuthButton – Primary submit button for auth forms.
 * Shows animated spinner while loading.
 *
 * @param {bool}   loading - true disables button and shows spinner
 * @param {string} label  - button text (default: 'Sign in')
 */
export default function AuthButton({ loading = false, label = 'Sign in' }) {
  return (
    <button
      type="submit"
      className="auth-submit"
      disabled={loading}
      aria-busy={loading}
    >
      {loading ? (
        <>
          <span className="auth-submit__spinner" aria-hidden="true">
            <Spinner size={16} />
          </span>
          <span>Signing in…</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
        </>
      )}
    </button>
  );
}

AuthButton.propTypes = {
  loading: PropTypes.bool,
  label: PropTypes.string,
};
