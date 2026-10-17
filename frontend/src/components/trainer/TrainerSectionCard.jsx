import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';

/**
 * TrainerSectionCard — the section shell used across Trainer pages.
 *
 * Provides the icon + title + subtitle header and an optional trailing action.
 * The action is a real <Link> when `actionTo` is given and a real <button> when
 * `onAction` is given, so keyboard users always get a focusable, correct
 * semantics element. Supplying neither renders no action affordance.
 */
export default function TrainerSectionCard({
  icon = '',
  title,
  subtitle = '',
  actionLabel = '',
  actionTo = '',
  onAction = undefined,
  headingId,
  children = null,
}) {
  const hasAction = Boolean(actionLabel) && Boolean(actionTo || onAction);

  return (
    <section className="trainer-section-card" aria-labelledby={headingId}>
      <header className="trainer-section-card__header">
        <div className="trainer-section-card__heading">
          {icon ? (
            <span className="trainer-section-card__icon">
              <Icon name={icon} size={17} />
            </span>
          ) : null}
          <div className="trainer-section-card__heading-text">
            <h2 id={headingId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>

        {hasAction ? (
          actionTo ? (
            <Link className="trainer-section-card__action" to={actionTo}>
              <span>{actionLabel}</span>
              <Icon name="chevronRight" size={12} />
            </Link>
          ) : (
            <button type="button" className="trainer-section-card__action" onClick={onAction}>
              <span>{actionLabel}</span>
              <Icon name="chevronRight" size={12} />
            </button>
          )
        ) : null}
      </header>

      <div className="trainer-section-card__body">{children}</div>
    </section>
  );
}

TrainerSectionCard.propTypes = {
  icon: PropTypes.string,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  actionLabel: PropTypes.string,
  actionTo: PropTypes.string,
  onAction: PropTypes.func,
  headingId: PropTypes.string.isRequired,
  children: PropTypes.node,
};
