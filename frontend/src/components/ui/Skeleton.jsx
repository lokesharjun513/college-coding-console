import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * Skeleton – placeholder for loading content.
 * Uses CSS variables for color and animation.
 *
 * Props:
 * - width: CSS width (e.g., '100%', '200px')
 * - height: CSS height (e.g., '1rem')
 * - borderRadius: CSS border radius (default var(--radius-sm))
 * - style: additional inline styles
 */
export default function Skeleton({ width = '100%', height = '1rem', borderRadius = 'var(--radius-sm)', style = {} }) {
  const baseStyle = {
    width,
    height,
    borderRadius,
    background: 'var(--color-surface-muted)',
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };
  const shimmerStyle = {
    content: "''",
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(90deg, transparent, var(--color-surface), transparent)',
    animation: 'shimmer 1.5s infinite',
  };
  return (
    <div style={baseStyle} className="skeleton">
      <div style={shimmerStyle} />
    </div>
  );
}

Skeleton.propTypes = {
  width: PropTypes.string,
  height: PropTypes.string,
  borderRadius: PropTypes.string,
  style: PropTypes.object,
};
