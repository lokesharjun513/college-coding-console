import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';

/**
 * TrainerQuickActions — grid of primary navigation shortcuts.
 *
 * Every entry must point at a route that actually exists. Actions whose target
 * depends on a batch receive `disabled` until that batch is available, so the
 * user is never navigated to a dead URL.
 */
export default function TrainerQuickActions({ title, subtitle = '', actions }) {
  if (!actions.length) return null;

  return (
    <section className="trainer-quick-actions" aria-label={title}>
      <div className="trainer-quick-actions__header">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>

      <ul className="trainer-quick-actions__grid">
        {actions.map((action) => {
          const className = `trainer-quick-action${action.primary ? ' trainer-quick-action--primary' : ''}`;
          const content = (
            <>
              <span className="trainer-quick-action__icon">
                <Icon name={action.icon} size={16} />
              </span>
              <span className="trainer-quick-action__label">{action.label}</span>
              <span className="trainer-quick-action__arrow">
                <Icon name="arrowRight" size={14} />
              </span>
            </>
          );

          return (
            <li key={action.key} className="trainer-quick-actions__item">
              {action.to && !action.disabled ? (
                <Link className={className} to={action.to}>
                  {content}
                </Link>
              ) : (
                <button type="button" className={className} disabled={action.disabled}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

TrainerQuickActions.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.string,
      to: PropTypes.string,
      primary: PropTypes.bool,
      disabled: PropTypes.bool,
    })
  ).isRequired,
};
