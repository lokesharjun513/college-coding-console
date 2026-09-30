import React from 'react';
import PropTypes from 'prop-types';

/**
 * BrandLogo — canonical brand mark for the application.
 *
 * Renders an original geometric SVG logo + optional brand name.
 * Works on light and dark surfaces.
 *
 * @param {string} size    - 'sm' | 'md' | 'lg'  (default: 'md')
 * @param {bool}   showName - render brand name text beside mark
 * @param {string} variant  - 'light' | 'dark'  (default: 'dark')
 */
export default function BrandLogo({ size = 'md', showName = false, variant = 'dark' }) {
  const sizes = {
    sm: { mark: 28, stroke: 1.75, nameSize: '0.8125rem' },
    md: { mark: 40, stroke: 2.25, nameSize: '1rem' },
    lg: { mark: 56, stroke: 3, nameSize: '1.25rem' },
  };

  const { mark, stroke, nameSize } = sizes[size] || sizes.md;

  const isDark = variant === 'dark';
  const inkColor = isDark ? '#253237' : '#e0fbfc';
  const markAccentColor = isDark ? '#5c6b73' : 'rgba(157,180,192,0.85)';

  const MarkSVG = () => (
    <svg
      width={mark * 1.5}
      height={mark}
      viewBox="0 0 60 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 6C9 6 6 9 6 14V26C6 31 9 34 14 34"
        stroke={inkColor}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d="M46 6C51 6 54 9 54 14V26C54 31 51 34 46 34"
        stroke={inkColor}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <ellipse
        cx="30"
        cy="20"
        rx="10"
        ry="10"
        fill={markAccentColor}
      />
      <circle cx="30" cy="20" r="3" fill={inkColor} />
    </svg>
  );

  if (showName) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
        <MarkSVG />
        <span
          style={{
            fontSize: nameSize,
            fontWeight: 700,
            color: inkColor,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          Portal
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <MarkSVG />
    </div>
  );
}

BrandLogo.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  showName: PropTypes.bool,
  variant: PropTypes.oneOf(['light', 'dark']),
};