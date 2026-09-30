import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navigationConfig } from '../../navigationConfig';
import Icon from '../ui/Icon';

/**
 * MobileNavigation – bottom navigation bar for mobile.
 * Shows primary items only (up to 4).
 */
export default function MobileNavigation() {
  const { user } = useAuth();
  const role = user?.role || 'STUDENT';
  const sections = navigationConfig[role] || [];
  // Flatten top-level items (skip secondary/tertiary sections)
  const flatItems = sections
    .map((s) => s.items)
    .flat()
    .slice(0, 4); // limit to 4 items

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-divider)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: 'var(--space-2)',
        height: 'var(--mobile-nav-height)',
        zIndex: 5,
      }}
      aria-label="Mobile navigation"
    >
      {flatItems.map((item) => {
        return (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontSize: 'var(--font-size-caption)',
              textDecoration: 'none',
            })}
          >
            <Icon name={item.icon} size={20} ariaLabel={item.label} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
