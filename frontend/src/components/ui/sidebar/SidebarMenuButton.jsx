import React from 'react';
import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import { useSidebar } from './SidebarProvider';
import Icon from '../Icon';

export function SidebarMenuButton({ item, isActive }) {
  const { open } = useSidebar();

  return (
    <NavLink
      to={item.path}
      className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
      title={!open ? item.label : undefined}
    >
      <Icon name={item.icon} size={20} ariaLabel={item.label} />
      {open && <span className="sidebar__label">{item.label}</span>}
    </NavLink>
  );
}

SidebarMenuButton.propTypes = {
  item: PropTypes.shape({
    path: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.string,
  }).isRequired,
  isActive: PropTypes.bool,
};
