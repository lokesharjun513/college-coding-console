import React from 'react';
import PropTypes from 'prop-types';

/**
 * SidebarGroup – A collapsible group within the sidebar.
 * Wraps navigation items under a section label.
 */
export function SidebarGroup({ label, children, collapsible = false, defaultOpen = true }) {
  return (
    <div className="sidebar-group" data-collapsible={collapsible} data-open={defaultOpen}>
      {label && <div className="sidebar-group__label">{label}</div>}
      <ul className="sidebar-group__content">
        {children}
      </ul>
    </div>
  );
}

/**
 * SidebarGroupLabel – Section label for a SidebarGroup.
 */
export function SidebarGroupLabel({ children }) {
  return <div className="sidebar-group__label">{children}</div>;
}

SidebarGroup.propTypes = {
  label: PropTypes.string,
  children: PropTypes.node,
  collapsible: PropTypes.bool,
  defaultOpen: PropTypes.bool,
};

SidebarGroupLabel.propTypes = {
  children: PropTypes.node,
};
