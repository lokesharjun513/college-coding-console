import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Simple Card component – uses design tokens for spacing, radius, shadow.
 */
export default function Card({ children, variant = 'card', className = '' }) {
  const classes = `card ${variant !== 'card' ? `card-${variant}` : ''} ${className}`.trim();
  return <div className={classes}>{children}</div>;
}

Card.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['card', 'interactive', 'elevated', 'flat']),
  className: PropTypes.string,
};
