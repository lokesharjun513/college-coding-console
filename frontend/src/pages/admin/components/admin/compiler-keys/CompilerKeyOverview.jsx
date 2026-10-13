const CompilerKeyOverview = ({ activeKeyIndex, summary, keys }) => {
  const exhaustedKeys = keys.filter(key => key.status === 'exhausted').length;
  const notifiedExhaustedKeys = keys.filter(key => key.status === 'exhausted' && key.exhaustionNotified).length;
  const availableKeys = keys.filter(key => key.status !== 'exhausted').length;

  return (
    <div className="admin-dashboard__kpi-grid mb-6">
      <div className="admin-dashboard__stat-card">
        <div className="admin-dashboard__stat-header">
          <span className="admin-dashboard__stat-label">Currently Active Key</span>
        </div>
        <div className="admin-dashboard__stat-value">
          {activeKeyIndex !== null ? `Key #${activeKeyIndex}` : 'None'}
        </div>
        <div className="admin-dashboard__stat-meta">Active rotation target</div>
      </div>

      <div className="admin-dashboard__stat-card">
        <div className="admin-dashboard__stat-header">
          <span className="admin-dashboard__stat-label">Total Submissions</span>
        </div>
        <div className="admin-dashboard__stat-value">{summary.totalSubmissions}</div>
        <div className="admin-dashboard__stat-meta">Application submissions</div>
      </div>

      <div className="admin-dashboard__stat-card">
        <div className="admin-dashboard__stat-header">
          <span className="admin-dashboard__stat-label">Requests Used</span>
        </div>
        <div className="admin-dashboard__stat-value">{summary.totalRequestsUsed}</div>
        <div className="admin-dashboard__stat-meta">Combined outbound calls</div>
      </div>

      <div className="admin-dashboard__stat-card">
        <div className="admin-dashboard__stat-header">
          <span className="admin-dashboard__stat-label">Remaining Capacity</span>
        </div>
        <div className="admin-dashboard__stat-value">{summary.totalRemainingCapacity}</div>
        <div className="admin-dashboard__stat-meta">Available request quota</div>
      </div>

      <div className="admin-dashboard__stat-card">
        <div className="admin-dashboard__stat-header">
          <span className="admin-dashboard__stat-label">Exhausted Keys</span>
        </div>
        <div className="admin-dashboard__stat-value">{exhaustedKeys}</div>
        <div className="admin-dashboard__stat-meta">Keys at quota limit</div>
      </div>

      <div className="admin-dashboard__stat-card">
        <div className="admin-dashboard__stat-header">
          <span className="admin-dashboard__stat-label">Available Keys</span>
        </div>
        <div className="admin-dashboard__stat-value">{availableKeys}</div>
        <div className="admin-dashboard__stat-meta">Keys ready for use</div>
      </div>

      <div className="admin-dashboard__stat-card">
        <div className="admin-dashboard__stat-header">
          <span className="admin-dashboard__stat-label">Notifications Sent</span>
        </div>
        <div className="admin-dashboard__stat-value">
          {notifiedExhaustedKeys}/{exhaustedKeys}
        </div>
        <div className="admin-dashboard__stat-meta">
          {exhaustedKeys > 0 ? `${Math.round((notifiedExhaustedKeys / exhaustedKeys) * 100)}%` : '0%'} of exhausted keys
        </div>
      </div>
    </div>
  );
};

export default CompilerKeyOverview;
