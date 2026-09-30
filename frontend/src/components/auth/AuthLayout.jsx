import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/auth.css';

/**
 * AuthLayout – Full-viewport centered layout for auth pages.
 */
export default function AuthLayout({ children }) {
  return (
    <main className="auth-layout">
      <div className="auth-layout__background-glows">
        <div className="auth-layout__glow auth-layout__glow--sky" />
        <div className="auth-layout__glow auth-layout__glow--coral" />
      </div>
      <div className="auth-layout__content">
        {children}
      </div>
    </main>
  );
}

AuthLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
