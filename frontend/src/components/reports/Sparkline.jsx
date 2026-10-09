import React from 'react';
import PropTypes from 'prop-types';

/**
 * Sparkline - a simple line chart for showing trends
 */
export default function Sparkline({ data, width = 100, height = 20, color = 'var(--color-primary)' }) {
  if (!data || data.length === 0) {
    return null;
  }

  // Normalize data to fit within the chart dimensions
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // Avoid division by zero

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="sparkline">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
    </svg>
  );
}

Sparkline.propTypes = {
  data: PropTypes.arrayOf(PropTypes.number),
  width: PropTypes.number,
  height: PropTypes.number,
  color: PropTypes.string,
};