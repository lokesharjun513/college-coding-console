import React from 'react';
import PropTypes from 'prop-types';
import Icon from '../Icon';
import Tooltip from '../Tooltip';
import '../../../styles/components/table-actions.css';

/**
 * TableActions - Reusable compact icon action buttons for tables.
 * Follows Apple-inspired design system with semantic tooltips.
 */
export default function TableActions({ actions }) {
  return (
    <div className="table-actions">
      {actions.map((action, idx) => {
        const IconComponent = action.icon;
        return (
          <Tooltip key={idx} title={action.label}>
            <button
              type="button"
              className={`table-actions__btn ${action.variant === 'danger' ? 'table-actions__btn--danger' : ''} ${action.disabled ? 'table-actions__btn--disabled' : ''}`}
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
              title={action.label}
            >
              {IconComponent ? <IconComponent size={18} strokeWidth={2} /> : <Icon name={action.iconName || ''} size={18} strokeWidth={2} />}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

TableActions.propTypes = {
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      onClick: PropTypes.func,
      icon: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
      iconName: PropTypes.string,
      variant: PropTypes.oneOf(['default', 'danger']),
      disabled: PropTypes.bool,
    })
  ).isRequired,
};
