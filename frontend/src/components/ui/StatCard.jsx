import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';

/**
 * StatCard – displays a numeric value with a label.
 */
export default function StatCard({ label, value, loading = false }) {
  if (loading) {
    return (
      <div className="card">
        <div className="skeleton" style={{ height: '14px', width: '60px', marginBottom: 'var(--space-2)' }} />
        <div className="skeleton" style={{ height: '24px', width: '100px' }} />
      </div>
    );
  }
  return (
    <div className="card">
      <div className="sidebar__section-label" style={{ marginBottom: 'var(--space-1)' }}>{label}</div>
      <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-semibold)' }}>{value}</div>
    </div>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  loading: PropTypes.bool,
};
