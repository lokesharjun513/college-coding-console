import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { navigationConfig } from '../../../navigationConfig';
import Icon from '../Icon';
import { SidebarHeader, SidebarContent } from './SidebarComponents';
import SidebarAccount from './SidebarAccount';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from './index';
import { useSidebar } from './SidebarProvider';
import '../../../styles/sidebar.css';
import '../../../styles/sidebarAccount.css';

/**
 * Sidebar – composable, role-aware premium navigation sidebar.
 *
 * Reads collapsed state from SidebarProvider context if available,
 * falling back to the `collapsed` prop.  The `onToggle` prop is ignored
 * when the provider is present.
 *
 * Layout (shadcn-style):
 *   <nav class="sidebar">
 *     <SidebarHeader />   – logo + brand text
 *     <SidebarContent />  – scrollable nav groups
 *     <SidebarFooter />   – user info + collapse toggle
 *   </nav>
 *
 * Collapsed mode (72px):
 *   - Labels hidden, icons centred
 *   - Tooltips appear on hover / focus
 *   - Group labels hidden
 *   - Brand text hidden
 *   - Same active indicator
 */
export default function Sidebar({ collapsed: collapsedProp, onToggle: onToggleProp }) {
  const { user } = useAuth();
  const role = user?.role || 'STUDENT';
  const sections = navigationConfig[role] || [];
  const location = useLocation();

  // Attempt to read from SidebarProvider context; fall back to prop.
  let collapsed = collapsedProp;
  let toggleSidebar = onToggleProp;
  try {
    const ctx = useSidebar?.();
    if (ctx) {
      collapsed = ctx.collapsed;
      toggleSidebar = ctx.toggle;
    }
    // eslint-disable-next-line no-empty
  } catch {}

  const [tooltip, setTooltip] = useState(null);
  const tooltipTimer = useRef(null);

  // ── Tooltip helpers ─────────────────────────────────────────
  const showTooltip = (label) => {
    clearTimeout(tooltipTimer.current);
    setTooltip(label);
  };
  const hideTooltip = () => {
    tooltipTimer.current = setTimeout(() => setTooltip(null), 150);
  };

  // ── Active route detection ───────────────────────────────────
  const isActive = (itemPath) => {
    if (itemPath === '/admin' || itemPath === '/trainer' || itemPath === '/student') {
      return location.pathname === itemPath;
    }
    return location.pathname === itemPath || location.pathname.startsWith(itemPath + '/');
  };

  const roleLabel = user?.role
    ? user.role.charAt(0) + user.role.slice(1).toLowerCase()
    : 'Workspace';

  // ── Render ──────────────────────────────────────────────────
  return (
    <nav
      className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}
      aria-label="Main navigation"
    >
      {/* ── Brand header ─────────────────────────── */}
      <SidebarHeader>
        <button
          className="sidebar__brand"
          onClick={collapsed ? toggleSidebar : undefined}
          aria-label={collapsed ? 'Expand sidebar' : undefined}
          type="button"
        >
          <div className="sidebar__brand-logo">
            <Icon name="code" size={20} color="#ffffff" ariaLabel="Logo" />
          </div>
          {!collapsed && (
            <div className="sidebar__brand-text">
              <span className="sidebar__brand-title">College Coding</span>
              <span className="sidebar__brand-sub">{roleLabel}</span>
            </div>
          )}
        </button>
        {!collapsed && (
          <button
            className="sidebar__collapse-btn"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            title="Collapse sidebar (Ctrl+B)"
            type="button"
          >
            <Icon
              name="chevronLeft"
              size={16}
              color="currentColor"
            />
          </button>
        )}
      </SidebarHeader>

      {/* ── Scrollable nav content ───────────────── */}
      <SidebarContent>
        {sections.map((section, sIdx) => (
          <SidebarGroup key={sIdx}>
            {!collapsed && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem
                  key={item.path}
                  item={item}
                  isActive={isActive(item.path)}
                  collapsed={collapsed}
                  onMouseEnter={() => collapsed && showTooltip(item.label)}
                  onMouseLeave={hideTooltip}
                  onFocus={() => collapsed && showTooltip(item.label)}
                  onBlur={hideTooltip}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ── Account Footer ────────────────────────────────── */}
      <SidebarAccount collapsed={collapsed} />

      {/* ── Tooltip overlay ──────────────────────── */}
      {tooltip && (
        <div className="sidebar-tooltip" role="tooltip" aria-live="polite">
          {tooltip}
        </div>
      )}
    </nav>
  );
}

Sidebar.propTypes = {
  /** @deprecated Use SidebarProvider instead */
  collapsed: PropTypes.bool,
  /** @deprecated Use SidebarProvider instead */
  onToggle: PropTypes.func,
};
