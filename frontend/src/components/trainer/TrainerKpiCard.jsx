import React from 'react';
import PropTypes from 'prop-types';
import Icon from '../ui/Icon';

/**
 * TrainerKpiCard — a single metric tile.
 *
 * Renders whatever `value` it is given. Callers are responsible for passing a
 * real value derived from an API field, or `null` to omit the metric entirely.
 * The card never computes, defaults or infers a metric of its own.
 */
export default function TrainerKpiCard({ label, value, meta = '', icon = '', tone = 'default' }) {
  return (
    <div className="admin-dashboard__stat-card" data-tone={tone} role="listitem">
      <div className="admin-dashboard__stat-header">
        <p className="admin-dashboard__stat-label">{label}</p>
        {icon ? (
          <span className="admin-dashboard__stat-icon">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
      </div>
      <p className="admin-dashboard__stat-value">{value}</p>
      {meta ? <p className="admin-dashboard__stat-meta">{meta}</p> : null}
    </div>
  );
}

TrainerKpiCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  meta: PropTypes.string,
  icon: PropTypes.string,
  tone: PropTypes.oneOf(['default', 'blue', 'red', 'green', 'orange', 'accent', 'positive']),
};
