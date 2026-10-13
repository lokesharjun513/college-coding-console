import { useState } from 'react';
import Icon from '../../../../../components/ui/Icon';

const ActiveKeySummary = ({ activeKey, refreshTimestamp }) => {
  const [copied, setCopied] = useState(false);

  const formatTimeOnly = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeKey?.maskedKey || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!activeKey) {
    return (
      <section className="active-key-summary-card">
        <div className="active-key-summary-header">
          <h3 className="active-key-summary-title">Active Key Summary</h3>
          <div className="active-key-summary-refresh">
            <Icon name="RefreshCw" size={14} color="#ffffff" />
            <span>Last synced: {refreshTimestamp ? formatTimeOnly(refreshTimestamp) : 'Never'}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>No active compiler key detected or all keys exhausted.</p>
      </section>
    );
  }

  const safePercentage = Math.min(100, Math.max(0, parseFloat(activeKey.usagePercentage) || 0));

  return (
    <section className="active-key-summary-card">
      {/* Header */}
      <div className="active-key-summary-header">
        <h3 className="active-key-summary-title">Active Key Summary</h3>
        <div className="active-key-summary-refresh">
          <Icon name="RefreshCw" size={14} color="#ffffff" />
          <span>Last synced: {refreshTimestamp ? formatTimeOnly(refreshTimestamp) : 'Never'}</span>
        </div>
      </div>

      {/* Active Key Information Row */}
      <div className="active-key-info-row">
        <span className="active-key-badge">
          <span className="active-key-dot" />
          KEY #{activeKey.keyIndex} ACTIVE
        </span>
        <span className="active-key-masked">
          {activeKey.maskedKey}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="active-key-copy-btn"
          title={copied ? 'Copied!' : 'Copy Masked Key'}
        >
          {copied ? (
            <Icon name="Check" size={14} color="#ffffff" />
          ) : (
            <Icon name="Copy" size={14} color="#ffffff" />
          )}
        </button>
      </div>

      {/* Four KPI Cards */}
      <div className="active-key-kpi-grid">
        {/* Card 1 - Usage Count */}
        <div className="active-key-kpi-card">
          <div className="active-key-kpi-icon blue">
            <Icon name="Layers" size={18} color="#3b82f6" />
          </div>
          <div className="active-key-kpi-content">
            <span className="active-key-kpi-label">Usage Count</span>
            <strong className="active-key-kpi-value">
              {activeKey.currentRequestCount.toLocaleString()} / {activeKey.maxRequestLimit.toLocaleString()}
            </strong>
            <span className="active-key-kpi-meta">requests</span>
          </div>
        </div>

        {/* Card 2 - Usage Percentage */}
        <div className="active-key-kpi-card">
          <div className="active-key-kpi-icon purple">
            <Icon name="Percent" size={18} color="#a855f7" />
          </div>
          <div className="active-key-kpi-content">
            <span className="active-key-kpi-label">Usage Percentage</span>
            <strong className="active-key-kpi-value">{safePercentage.toFixed(2)}%</strong>
            <span className="active-key-kpi-meta">of total capacity</span>
          </div>
        </div>

        {/* Card 3 - Remaining Capacity */}
        <div className="active-key-kpi-card">
          <div className="active-key-kpi-icon green">
            <Icon name="PieChart" size={18} color="#22c55e" />
          </div>
          <div className="active-key-kpi-content">
            <span className="active-key-kpi-label">Remaining Capacity</span>
            <strong className="active-key-kpi-value">{activeKey.remainingRequests.toLocaleString()}</strong>
            <span className="active-key-kpi-meta">requests left</span>
          </div>
        </div>

        {/* Card 4 - Last Used */}
        <div className="active-key-kpi-card">
          <div className="active-key-kpi-icon orange">
            <Icon name="Calendar" size={18} color="#f97316" />
          </div>
          <div className="active-key-kpi-content">
            <span className="active-key-kpi-label">Last Used</span>
            <strong className="active-key-kpi-value">
              {activeKey.lastUsedAt ? new Date(activeKey.lastUsedAt).toLocaleString() : 'N/A'}
            </strong>
            <span className="active-key-kpi-meta">Last successful request</span>
          </div>
        </div>
      </div>

      {/* Capacity Progress */}
      <div className="active-key-progress">
        <div className="active-key-progress-header">
          <span>Capacity Progress</span>
          <span className="active-key-progress-percentage">{safePercentage.toFixed(2)}% Used</span>
        </div>
        <div className="active-key-progress-bar">
          <div style={{ width: `${safePercentage}%` }} />
        </div>
      </div>
    </section>
  );
};

export default ActiveKeySummary;