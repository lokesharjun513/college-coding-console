import { useMemo } from 'react';

const ExhaustionAlertSummary = ({ keys }) => {
  const exhaustedKeys = useMemo(() => {
    return keys.filter(key => key.status === 'exhausted').length;
  }, [keys]);

  const availableKeys = useMemo(() => {
    return keys.filter(key => key.status !== 'exhausted').length;
  }, [keys]);

  const totalExhausted = exhaustedKeys;

  const notifiedExhaustedKeys = useMemo(() => {
    return keys.filter(key => key.status === 'exhausted' && key.exhaustionNotified).length;
  }, [keys]);

  const mostRecentExhaustion = useMemo(() => {
    const exhausted = keys.filter(key => key.status === 'exhausted');
    if (exhausted.length === 0) return null;
    // Sort by updatedAt descending and take the first
    const sorted = [...exhausted].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const mostRecent = sorted[0];
    return {
      keyIndex: mostRecent.keyIndex,
      time: mostRecent.updatedAt
    };
  }, [keys]);

  return (
    <div className="admin-card mb-6">
      <div className="admin-section-header">
        <div className="admin-section-heading">
          <h3 className="admin-section-title">Exhaustion Alert Summary</h3>
          <p className="text-xs text-muted-foreground">
            Overview of key exhaustion and notification status
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-label">Exhausted Keys</div>
          <div className="admin-dashboard__stat-value">{exhaustedKeys}</div>
          <div className="admin-dashboard__stat-meta">Keys at quota limit</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-label">Available Keys</div>
          <div className="admin-dashboard__stat-value">{availableKeys}</div>
          <div className="admin-dashboard__stat-meta">Keys ready for use</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-label">Most Recent Exhaustion</div>
          <div className="admin-dashboard__stat-value">
            {mostRecentExhaustion ? (
              <>
                Key #{mostRecentExhaustion.keyIndex}
                <br />
                <span className="text-xs">
                  {new Date(mostRecentExhaustion.time).toLocaleString()}
                </span>
              </>
            ) : 'None'}
          </div>
          <div className="admin-dashboard__stat-meta">
            Last key to reach quota
          </div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-label">Notification Status</div>
          <div className="admin-dashboard__stat-value">
            {notifiedExhaustedKeys}/{totalExhausted} sent
          </div>
          <div className="admin-dashboard__stat-meta">
            {totalExhausted > 0 ? (
              <>
                {Math.round((notifiedExhaustedKeys / totalExhausted) * 100)}% of exhausted keys notified
              </>
            ) : (
              'No exhausted keys'
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExhaustionAlertSummary;