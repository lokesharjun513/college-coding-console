import React from 'react';
import PropTypes from 'prop-types';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navigationConfig } from '../../navigationConfig';
import Icon from '../ui/Icon';
import SidebarAccount from '../ui/sidebar/SidebarAccount';
import '../../styles/sidebar.css';
import '../../styles/sidebarAccount.css';

/**
 * Sidebar – Role-aware premium enterprise navigation.
 * Uses SidebarAccount for profile/settings/logout in the footer.
 */
export default function Sidebar({ collapsed }) {
  const { user } = useAuth();
  const role = user?.role || 'STUDENT';
  const sections = navigationConfig[role] || [];
  const location = useLocation();

  // Mobile detection

  return (
    <nav className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} aria-label="Main navigation">
      <div>
        <div className="sidebar__header">
          <Icon name="code" size={24} color="#ffffff" ariaLabel="Logo" />
          {!collapsed && (
            <div className="workspace-identity">
              <span className="sidebar__title">BTech College</span>
              <div style={{fontSize: '12px', color: 'rgba(255,255,255,0.6)'}}>{role.charAt(0) + role.slice(1).toLowerCase()}</div>
            </div>
          )}
        </div>

        {sections.map((section, idx) => (
          <div key={idx} className="sidebar__nav-section">
            {!collapsed && <div className="sidebar__section-label">{section.label}</div>}
            {section.items.map(item => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} size={20} ariaLabel={item.label} />
                  {!collapsed && <span className="sidebar__label">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      <SidebarAccount collapsed={collapsed} />
    </nav>
  );
}

Sidebar.propTypes = {
  collapsed: PropTypes.bool.isRequired,
};
