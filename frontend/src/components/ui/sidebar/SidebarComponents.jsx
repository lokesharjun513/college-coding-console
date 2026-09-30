import React from 'react';
import PropTypes from 'prop-types';

/**
 * Composable Sidebar sub-components for the existing navigation layout.
 */

export function SidebarHeader({ children, className = '' }) {
  return <div className={`sidebar__header ${className}`}>{children}</div>;
}

export function SidebarContent({ children, className = '' }) {
  return <div className={`sidebar__content ${className}`}>{children}</div>;
}

export function SidebarFooter({ children, className = '' }) {
  return <div className={`sidebar__footer ${className}`}>{children}</div>;
}

SidebarHeader.propTypes = { children: PropTypes.node, className: PropTypes.string };
SidebarContent.propTypes = { children: PropTypes.node, className: PropTypes.string };
SidebarFooter.propTypes = { children: PropTypes.node, className: PropTypes.string };
