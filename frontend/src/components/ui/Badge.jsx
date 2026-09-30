import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Badge – small label with background color.
 */
export default function Badge({ children, variant = 'neutral' }) {
  const className = `badge badge-${variant}`;
  return <span className={className}>{children}</span>;
}

Badge.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['success', 'warning', 'danger', 'info', 'neutral']),
};
