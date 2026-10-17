import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

/**
 * TrainerBreadcrumb — the single breadcrumb for the Trainer module.
 *
 * Previously each page rolled its own markup with a different class prefix
 * (`trainer-breadcrumb`, `trainer-batches__crumb`, `trainer-students__crumb`,
 * `trainer-problems__crumb`, `trainer-assignments__crumb`). All of those are
 * replaced by this component.
 *
 * The last item is rendered as plain text and is not a link, matching the
 * Admin convention.
 */
export default function TrainerBreadcrumb({ items }) {
  if (!items.length) return null;

  return (
    <nav className="trainer-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <span className="trainer-breadcrumb__separator" aria-hidden="true">
                /
              </span>
            ) : null}
            {isLast || !item.to ? (
              <span className="trainer-breadcrumb__current" aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            ) : (
              <Link className="trainer-breadcrumb__item" to={item.to}>{item.label}</Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

TrainerBreadcrumb.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      to: PropTypes.string,
    })
  ).isRequired,
};