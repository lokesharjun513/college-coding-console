import React from 'react';
import PropTypes from 'prop-types';

/**
 * Avatar – displays a user image or initials.
 * Uses CSS variables for size and border radius.
 */
export default function Avatar({ src, name = '', size = 32 }) {
  const initials = name
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const style = {
    width: size,
    height: size,
    borderRadius: 'var(--radius-pill)',
    backgroundColor: 'var(--color-elevated)',
    color: 'var(--color-text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'var(--font-weight-medium)',
    fontSize: size / 2.5,
    overflow: 'hidden',
    flexShrink: 0,
  };

  if (src) {
    return <img src={src} alt={name} style={style} />;
  }

  return <div style={style}>{initials}</div>;
}

Avatar.propTypes = {
  src: PropTypes.string,
  name: PropTypes.string,
  size: PropTypes.number,
};
