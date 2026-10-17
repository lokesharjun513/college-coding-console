import React from 'react';
import PropTypes from 'prop-types';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getOverflowItems, isActivePath, navigationConfig } from '../../navigationConfig';
import Icon from '../ui/Icon';
import './MoreSheet.css';

/**
 * MoreSheet – destinations that do not fit in the bottom bar.
 *
 * The list is the exact complement of the bottom bar (getOverflowItems), so a
 * destination can never appear in both. It also carries an active state, which
 * the sheet previously lacked entirely.
 *
 * A role whose items all fit in the bar — Student, with exactly five — has an
 * empty complement, and the sheet renders NOTHING rather than an empty panel.
 * Nothing can set `isOpen` for that role anyway: the bar only renders its More
 * button when the overflow is non-empty. This guard is the second line of
 * defence so the sheet can never appear with nothing in it.
 */
export default function MoreSheet({ isOpen, onClose }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = user?.role || 'STUDENT';
  const sections = navigationConfig[role] || [];
  const moreItems = getOverflowItems(sections);

  if (!isOpen || moreItems.length === 0) return null;

  return (
    <div className="more-sheet__overlay" onClick={onClose}>
      <div className="more-sheet__content" onClick={(e) => e.stopPropagation()}>
        <div className="more-sheet__header">
          <h3 className="more-sheet__title">More</h3>
          <button type="button" className="more-sheet__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="more-sheet__items">
          {moreItems.map((item) => {
            const active = isActivePath(pathname, item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`more-sheet__item ${active ? 'more-sheet__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
              >
                <span className="more-sheet__icon" aria-hidden="true">
                  <Icon name={item.icon} size={22} />
                </span>
                <span className="more-sheet__label">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}

MoreSheet.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
