import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getOverflowItems, getPrimaryItems, isActivePath, navigationConfig } from '../../navigationConfig';
import Icon from '../ui/Icon';
import './MobileNavigation.css';

/**
 * MobileNavigation – premium SaaS bottom navigation for mobile.
 *
 * The bar shows the items a role marks as `primary` (the five Student
 * destinations). Everything else moves into the More sheet, which is always the
 * exact complement of the bar — previously the bar and the sheet each sliced
 * the item list with a different hard-coded number, which left an Admin item
 * visible in both.
 *
 * The More button is conditional on there being somewhere to go. Student marks
 * all five of its items as primary and has no other destinations, so its
 * overflow is empty and the button is not rendered at all: Students get the
 * same five destinations on mobile as on the desktop sidebar. Admin and Trainer
 * keep their overflow sheet unchanged.
 */
export default function MobileNavigation({ onMoreClick, isMoreOpen }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = user?.role || 'STUDENT';
  const sections = navigationConfig[role] || [];

  const primaryItems = getPrimaryItems(sections);
  const overflowItems = getOverflowItems(sections);

  // More is active if the sheet is open OR the current path isn't one of the
  // primary items.
  const isMoreActive = isMoreOpen || !primaryItems.some((item) => isActivePath(pathname, item.path));

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <div className="mobile-nav__items">
        {primaryItems.map((item) => {
          const active = isActivePath(pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`mobile-nav__item ${active ? 'mobile-nav__item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              data-nav-item={item.label}
            >
              <span className="mobile-nav__icon" aria-hidden="true">
                <Icon name={item.icon} size={21} />
              </span>
              <span className="mobile-nav__label">{item.shortLabel || item.label}</span>
            </Link>
          );
        })}

        {/* Only rendered when there is actually somewhere to go. */}
        {overflowItems.length > 0 && (
          <button
            type="button"
            className={`mobile-nav__item ${isMoreActive ? 'mobile-nav__item--active' : ''}`}
            onClick={onMoreClick}
            aria-label="More"
            aria-expanded={isMoreOpen}
          >
            <span className="mobile-nav__icon" aria-hidden="true">
              <Icon name="moreHorizontal" size={21} />
            </span>
            <span className="mobile-nav__label">More</span>
          </button>
        )}
      </div>
    </nav>
  );
}

MobileNavigation.propTypes = {
  onMoreClick: PropTypes.func.isRequired,
  isMoreOpen: PropTypes.bool,
};
