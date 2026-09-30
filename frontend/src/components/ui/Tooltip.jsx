import React from 'react';
import PropTypes from 'prop-types';

/**
 * Tooltip – simple wrapper that shows a native tooltip via the title attribute.
 */
export default function Tooltip({ children, title }) {
  return (
    <span title={title} style={{ cursor: 'default' }}>
      {children}
    </span>
  );
}

Tooltip.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
};
