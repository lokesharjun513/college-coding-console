import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Icon from '../ui/Icon';
import { useSidebar } from '../ui/sidebar/SidebarProvider';
import { useNavigate } from 'react-router-dom';
import '../../styles/header.css';

/**
 * Header – Premium Apple-inspired SaaS sticky header.
 */
export default function Header() {
  const { user } = useAuth();
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();

  const roleDisplay = user?.role ? user.role.charAt(0) + user.role.slice(1).toLowerCase() : 'Student';

  const handleProfileClick = () => {
    navigate('/profile');
  };

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  const firstName = user?.name ? user.name.split(' ')[0] : (user?.username || 'Student');

  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__left">
          <button
            className="header__toggle"
            onClick={toggleSidebar}
            aria-label="Toggle Sidebar"
          >
            <Icon name="menu" size={18} />
          </button>
          <div className="header__identity">
            <span className="header__college-name">BTech College</span>
            <span className="header__workspace-role">{roleDisplay} Workspace</span>
          </div>
        </div>

        <div className="header__right">
          <button
            className="header__icon-btn"
            aria-label="Notifications"
            onClick={() => {}}
          >
            <Icon name="bell" size={18} />
          </button>

          <div className="header__profile" onClick={handleProfileClick} title="Go to profile">
            <div className="header__profile-avatar">
              {userInitial}
            </div>
            <div className="header__profile-meta">
              <span className="header__username">{firstName}</span>
              <span className="header__user-role">{roleDisplay}</span>
            </div>
            <Icon name="chevron-down" size={14} className="header__profile-chevron" />
          </div>
        </div>
      </div>
    </header>
  );
}
