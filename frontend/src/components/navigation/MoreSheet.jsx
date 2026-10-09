import React from 'react';
import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navigationConfig } from '../../navigationConfig';
import Icon from '../ui/Icon';
import './MoreSheet.css';

export default function MoreSheet({ isOpen, onClose }) {
  const { user } = useAuth();
  const role = user?.role || 'STUDENT';
  const sections = navigationConfig[role] || [];
  const allItems = sections.map((s) => s.items).flat();
  const moreItems = allItems.slice(role === 'STUDENT' ? 4 : 3);

  if (!isOpen) return null;

  return (
    <div className="more-sheet__overlay" onClick={onClose}>
      <div className="more-sheet__content" onClick={(e) => e.stopPropagation()}>
        <div className="more-sheet__header">
          <h3 className="more-sheet__title">More</h3>
          <button className="more-sheet__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="more-sheet__items">
          {moreItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className="more-sheet__item"
              onClick={onClose}
            >
              <Icon name={item.icon} size={22} />
              <span className="more-sheet__label">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

MoreSheet.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
