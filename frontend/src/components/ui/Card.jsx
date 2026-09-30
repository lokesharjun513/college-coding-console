import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Simple Card component – uses design tokens for spacing, radius, shadow.
 */
export default function Card({ children, variant = 'card' }) {
  const className = `card ${variant !== 'card' ? `card-${variant}` : ''}`;
  return <div className={className}>{children}</div>;
}

Card.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['card', 'interactive', 'elevated', 'flat']),
};
