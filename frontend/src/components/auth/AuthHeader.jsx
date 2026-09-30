import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/auth.css';

/**
 * AuthHeader – Page heading block for auth pages.
 * Uses semantic <header> with a single <h1> as the page title.
 */
export default function AuthHeader({ eyebrow, heading, subtext }) {
  return (
    <header className="auth-header">
      {eyebrow && <span className="auth-header__eyebrow">{eyebrow}</span>}
      <h1 className="auth-header__heading">{heading}</h1>
      {subtext && <p className="auth-header__subtext">{subtext}</p>}
    </header>
  );
}

AuthHeader.propTypes = {
  eyebrow: PropTypes.string,
  heading: PropTypes.string.isRequired,
  subtext: PropTypes.string,
};
