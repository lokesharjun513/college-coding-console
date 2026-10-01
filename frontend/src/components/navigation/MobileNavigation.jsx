import PropTypes from 'prop-types';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navigationConfig } from '../../navigationConfig';
import Icon from '../ui/Icon';
import './MobileNavigation.css';

/**
 * MobileNavigation – premium SaaS bottom navigation for mobile.
 * Shows 4 primary items + a "More" item that opens the sheet.
 */
export default function MobileNavigation({ onMoreClick, isMoreOpen }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = user?.role || 'STUDENT';
  const sections = navigationConfig[role] || [];

  const allItems = sections.map((s) => s.items).flat();
  const primaryItems = allItems.slice(0, 4);

  // More is active if the sheet is open OR the current path isn't one of the primary items
  const isMoreActive = isMoreOpen || !primaryItems.some(item => {
    const isRoot = item.path === '/admin' || item.path === '/trainer' || item.path === '/student';
    return isRoot ? pathname === item.path : pathname === item.path || pathname.startsWith(item.path + '/');
  });

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <div className="mobile-nav__items">
        {primaryItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/admin' || item.path === '/trainer' || item.path === '/student'}
            className={({ isActive }) =>
              `mobile-nav__item ${isActive ? 'mobile-nav__item--active' : ''}`
            }
            aria-current={({ isActive }) => (isActive ? 'page' : undefined)}
          >
            <span className="mobile-nav__icon">
              <Icon name={item.icon} size={21} ariaLabel={item.label} />
            </span>
            <span className="mobile-nav__label">{item.label}</span>
          </NavLink>
        ))}

        <button
          className={`mobile-nav__item ${isMoreActive ? 'mobile-nav__item--active' : ''}`}
          onClick={onMoreClick}
          aria-label="More"
          aria-expanded={isMoreOpen}
        >
          <span className="mobile-nav__icon">
            <Icon name="moreHorizontal" size={21} />
          </span>
          <span className="mobile-nav__label">More</span>
        </button>
      </div>
    </nav>
  );
}

MobileNavigation.propTypes = {
  onMoreClick: PropTypes.func.isRequired,
  isMoreOpen: PropTypes.bool,
};
