import React from 'react';
import PropTypes from 'prop-types';
import './DateRangeSelector.css';

/**
 * DateRangeSelector - allows users to select predefined date ranges or custom dates
 */
export default function DateRangeSelector({ selectedRange, onRangeChange, value, onChange }) {
  // Support both prop naming conventions
  const range = selectedRange ?? value;
  const handleChange = onRangeChange ?? onChange;

  const handlePresetChange = (r) => {
    if (handleChange) handleChange(r);
  };

  return (
    <div className="admin-reports__date-selector">
      <span className="admin-reports__date-label">Reporting Period:</span>
      <div className="admin-reports__date-options">
        <button
          type="button"
          className={`admin-reports__date-btn ${range === '7d' ? 'admin-reports__date-btn--active' : ''}`}
          onClick={() => handlePresetChange('7d')}
          aria-pressed={range === '7d'}
        >
          7 Days
        </button>
        <button
          type="button"
          className={`admin-reports__date-btn ${range === '30d' ? 'admin-reports__date-btn--active' : ''}`}
          onClick={() => handlePresetChange('30d')}
          aria-pressed={range === '30d'}
        >
          30 Days
        </button>
        <button
          type="button"
          className={`admin-reports__date-btn ${range === '90d' ? 'admin-reports__date-btn--active' : ''}`}
          onClick={() => handlePresetChange('90d')}
          aria-pressed={range === '90d'}
        >
          90 Days
        </button>
        <button
          type="button"
          className={`admin-reports__date-btn ${range === '365d' ? 'admin-reports__date-btn--active' : ''}`}
          onClick={() => handlePresetChange('365d')}
          aria-pressed={range === '365d'}
        >
          1 Year
        </button>
      </div>
    </div>
  );
}

DateRangeSelector.propTypes = {
  selectedRange: PropTypes.oneOf(['7d', '30d', '90d', '365d']),
  onRangeChange: PropTypes.func,
  value: PropTypes.oneOf(['7d', '30d', '90d', '365d']),
  onChange: PropTypes.func,
};