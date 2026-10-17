import React from 'react';
import PropTypes from 'prop-types';

/**
 * TrainerKpiGrid — labelled, responsive grid of TrainerKpiCard tiles.
 *
 * Rendered as an ARIA list so assistive technology announces each metric as a
 * discrete item rather than one run-on block.
 */
export default function TrainerKpiGrid({ title, children = null }) {
  return (
    <section className="admin-dashboard__kpi-grid" aria-label={title} role="list">
      {children}
    </section>
  );
}

TrainerKpiGrid.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
};
