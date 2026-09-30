import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/auth.css';

/**
 * AuthCard – Premium elevated card wrapper for auth forms.
 */
export default function AuthCard({ children }) {
  return <div className="auth-card">{children}</div>;
}

AuthCard.propTypes = {
  children: PropTypes.node.isRequired,
};
