import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import Icon from '../Icon';
import { createPortal } from 'react-dom';
import '../../../styles/sidebarAccount.css';

/**
 * SidebarAccount – Premium Apple/iOS-inspired account popover trigger.
 *
 * Provides:
 * - Clickable footer trigger (avatar + user info)
 * - Popover menu (Profile, Settings, Logout)
 * - Outside click & Escape key handling
 * - Apple Liquid Glass aesthetic
 */

export default function SidebarAccount({ collapsed }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) {
        if (popoverRef.current && !popoverRef.current.contains(e.target)) {
          setOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleTriggerClick = () => {
    setOpen((prev) => !prev);
  };

  const handleProfile = () => {
    setOpen(false);
    navigate('/profile');
  };

  const handleSettings = () => {
    setOpen(false);
    navigate('/admin/settings');
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  const [popoverStyle, setPopoverStyle] = useState({});

  // Calculate optimal popover position based on viewport
  const calculatePopoverPosition = useCallback(() => {
    if (!open || !triggerRef.current || !popoverRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 260;
    const popoverHeight = 220;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;

    // Horizontal positioning (right of trigger, with overflow protection)
    let left = triggerRect.right + gap;
    if (left + popoverWidth > viewportWidth - 12) {
      left = viewportWidth - popoverWidth - 12;
    }

    // Vertical positioning (check available space)
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const preferredPlacement = spaceBelow >= popoverHeight + 12 ? 'bottom' : 'top';

    let top;
    if (preferredPlacement === 'bottom') {
      top = triggerRect.top;
    } else {
      top = triggerRect.top - popoverHeight - gap;
    }

    // Clamp to viewport edges
    top = Math.max(12, Math.min(top, viewportHeight - popoverHeight - 12));
    left = Math.max(12, Math.min(left, viewportWidth - popoverWidth - 12));

    setPopoverStyle({
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${popoverWidth}px`,
      zIndex: 9999,
    });
  }, [open]);

  // Recalculate position on open
  useEffect(() => {
    if (open) {
      calculatePopoverPosition();
    }
  }, [open, calculatePopoverPosition]);

  // Resize listener - recalculate on window resize
  useEffect(() => {
    if (!open) return;

    const handleResize = () => {
      calculatePopoverPosition();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open, calculatePopoverPosition]);


  return (
    <div className="sidebar__account">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        className={`sidebar__account-trigger ${collapsed ? 'sidebar__account-trigger--collapsed' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        onClick={handleTriggerClick}
      >
        <div className="sidebar__account-avatar">{initials}</div>
        {!collapsed && (
          <div className="sidebar__account-info">
            <span className="sidebar__account-name">{user?.name || 'User'}</span>
            <span className="sidebar__account-email">
              {user?.email || 'user@example.com'}
            </span>
          </div>
        )}
        {!collapsed && (
          <Icon
            name={open ? 'chevronUp' : 'chevronDown'}
            size={16}
            color="var(--sidebar-text-secondary)"
            ariaLabel={open ? 'Collapse menu' : 'Expand menu'}
          />
        )}
      </button>

      {/* Popover */}
      {open && createPortal(
        <div
          ref={popoverRef}
          className="sidebar__account-popover"
          role="menu"
          style={popoverStyle}
        >
          {/* Header */}
          <div className="sidebar__account-header">
            <div className="sidebar__account-avatar sidebar__account-avatar--large">{initials}</div>
            <div className="sidebar__account-details">
              <span className="sidebar__account-details-name">{user?.name || 'User'}</span>
              <span className="sidebar__account-details-email">
                {user?.email || 'user@example.com'}
              </span>
            </div>
          </div>

          {/* Menu */}
          <div className="sidebar__account-menu" role="menu">
            <button
              type="button"
              className="sidebar__account-menuitem"
              role="menuitem"
              onClick={handleProfile}
            >
              <Icon name="user" size={18} color="var(--sidebar-text-secondary)" />
              <span>Profile</span>
            </button>
            <button
              type="button"
              className="sidebar__account-menuitem"
              role="menuitem"
              onClick={handleSettings}
            >
              <Icon name="settings" size={18} color="var(--sidebar-text-secondary)" />
              <span>Settings</span>
            </button>
            <div className="sidebar__account-divider" />
            <button
              type="button"
              className="sidebar__account-menuitem sidebar__account-menuitem--destructive"
              role="menuitem"
              onClick={handleLogout}
            >
              <Icon name="logOut" size={18} color="var(--color-secondary)" />
              <span>Logout</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

SidebarAccount.propTypes = {
  collapsed: PropTypes.bool,
};
