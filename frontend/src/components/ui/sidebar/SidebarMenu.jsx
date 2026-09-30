import React from 'react';
import PropTypes from 'prop-types';
import { NavLink, useLocation } from 'react-router-dom';
import { useSidebar } from './SidebarProvider';
import Icon from '../Icon';

/**
 * SidebarMenu – A menu list within a sidebar group.
 */
export function SidebarMenu({ children }) {
  return (
    <ul className="sidebar-menu">
      {children}
    </ul>
  );
}

SidebarMenu.propTypes = {
  children: PropTypes.node,
};

/**
 * SidebarMenuItem – A single menu item with active state detection and tooltip.
 */
export function SidebarMenuItem({ item, isActive: propIsActive, collapsed: propCollapsed, onMouseEnter, onMouseLeave, onFocus, onBlur }) {
  const location = useLocation();
  const { collapsed: contextCollapsed } = useSidebar();
  const { path, label, icon, badge = null } = item || {};
  const isActive = propIsActive ?? (location.pathname === path || location.pathname.startsWith(path + '/'));
  const collapsed = propCollapsed ?? contextCollapsed;

  return (
    <li>
      <NavLink
        to={path}
        className={`sidebar-menu-item ${isActive ? 'sidebar-menu-item--active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        title={collapsed ? label : undefined}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <span className="sidebar__nav-icon">
          <Icon name={icon} size={18} ariaLabel={label} />
        </span>
        {!collapsed && <span className="sidebar-menu-item__label">{label}</span>}
        {badge && !collapsed && <span className="sidebar-menu-item__badge">{badge}</span>}
      </NavLink>
    </li>
  );
}

SidebarMenuItem.propTypes = {
  item: PropTypes.shape({
    path: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired,
    badge: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  isActive: PropTypes.bool,
  collapsed: PropTypes.bool,
  onMouseEnter: PropTypes.func,
  onMouseLeave: PropTypes.func,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
};
