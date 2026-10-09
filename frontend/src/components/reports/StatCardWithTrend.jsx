import React from 'react';
import PropTypes from 'prop-types';
import Sparkline from './Sparkline';

/**
 * StatCardWithTrend - KPI card matching admin dashboard design
 */
export default function StatCardWithTrend({ label, value, trend, trendData, loading = false }) {
  if (loading) {
    return (
      <div className="admin-dashboard__stat-card" style={{ cursor: 'default' }}>
        <div className="admin-dashboard__stat-header">
          <span className="admin-dashboard__stat-label">Loading...</span>
        </div>
        <div className="admin-dashboard__stat-value" style={{ height: '28px' }} />
      </div>
    );
  }

  const formatChange = (pct) => {
    if (pct === null || pct === undefined) return null;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${Math.abs(pct).toFixed(0)}%`;
  };

  return (
    <div className="admin-dashboard__stat-card">
      <div className="admin-dashboard__stat-header">
        <span className="admin-dashboard__stat-label">{label}</span>
      </div>
      <div className="admin-dashboard__stat-value">{value}</div>
      {trend !== null && trend !== undefined && (
        <div className="admin-dashboard__stat-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '-4px' }}>
          {trend > 0 ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          ) : trend < 0 ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
              <polyline points="17 18 23 18 23 12" />
            </svg>
          ) : null}
          <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--admin-text-secondary)' }}>
            {formatChange(trend)}
          </span>
          {trendData && trendData.length > 0 && (
            <Sparkline data={trendData} width={60} height={20} color="var(--admin-primary)" />
          )}
        </div>
      )}
    </div>
  );
}

StatCardWithTrend.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  trend: PropTypes.number,
  trendData: PropTypes.arrayOf(PropTypes.number),
  loading: PropTypes.bool,
};