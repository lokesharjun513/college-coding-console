import { useEffect, useState, useCallback } from 'react';
import { exportToCSV } from '../../utils/exportHelpers';
import { getAdminReportsOverview, getAdminPlatformActivity } from '../../api/admin';
import StatCardWithTrend from '../../components/reports/StatCardWithTrend';
import DateRangeSelector from '../../components/reports/DateRangeSelector';
import Spinner from '../../components/ui/Spinner';
import Toast from '../../components/ui/Toast';
import '../../styles/pages/admin.css';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [dateRange, setDateRange] = useState('7d');
  const [metrics, setMetrics] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, activityRes] = await Promise.all([
        getAdminReportsOverview(),
        getAdminPlatformActivity(dateRange)
      ]);

      const overview = overviewRes.data;
      const activity = activityRes.data;

      setMetrics({
        ...overview.data,
        activity: activity.metrics,
        trends: activity.trends
      });
    } catch (err) {
      console.error('Fetch reports error:', err);
      const msg = err?.response?.data?.message || 'Failed to load reports';
      setError(msg);
      setToast({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatChangePercent = (percent) => {
    if (percent === null || percent === undefined) return '—';
    return `${percent > 0 ? '+' : ''}${percent.toFixed(0)}%`;
  };

  const handleExport = () => {
    if (!metrics || !metrics.activity) return;

    const { activity } = metrics;
    const data = [
      { Metric: 'Students', Value: activity.students?.value ?? '—', Change: formatChangePercent(activity.students?.changePercent), Range: dateRange },
      { Metric: 'Submissions', Value: activity.submissions?.value ?? '—', Change: formatChangePercent(activity.submissions?.changePercent), Range: dateRange },
      { Metric: 'Problems', Value: activity.problems?.value ?? '—', Change: formatChangePercent(activity.problems?.changePercent), Range: dateRange },
      { Metric: 'Users', Value: activity.users?.value ?? '—', Change: formatChangePercent(activity.users?.changePercent), Range: dateRange }
    ];

    exportToCSV(data, `admin-reports-${dateRange}.csv`);
    setToast({ message: 'Report exported successfully', type: 'success' });
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__content">
        <header className="admin-dashboard__header">
          <nav className="admin-breadcrumb" aria-label="Breadcrumb">
            <a href="/admin" className="admin-breadcrumb__item">Home</a>
            <span className="admin-breadcrumb__separator">/</span>
            <span className="admin-breadcrumb__current" aria-current="page">Reports & Analytics</span>
          </nav>

          <div className="admin-dashboard__header-content">
            <div className="admin-dashboard__header-text">
              <h1 className="admin-dashboard__title">Reports & Analytics</h1>
              <p className="admin-dashboard__description">
                Platform-wide performance metrics, trends, and analytical insights.
              </p>
            </div>

            <div className="admin-dashboard__header-actions">
              <DateRangeSelector value={dateRange} onChange={setDateRange} />
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={handleExport}
                disabled={!metrics || !metrics.activity}
              >
                Export Report
              </button>
            </div>
          </div>
        </header>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {loading && <Spinner />}
        {error && <div className="admin-error-box">{error}</div>}

        {!loading && !error && metrics && metrics.activity && metrics.trends && (
          <div className="admin-dashboard__kpi-grid">
            <StatCardWithTrend label="Students" value={metrics.activity.students.value} trend={metrics.activity.students.changePercent} data={metrics.trends.students} />
            <StatCardWithTrend label="Submissions" value={metrics.activity.submissions.value} trend={metrics.activity.submissions.changePercent} data={metrics.trends.submissions} />
            <StatCardWithTrend label="Problems" value={metrics.activity.problems.value} trend={metrics.activity.problems.changePercent} data={metrics.trends.problems} />
            <StatCardWithTrend label="Users" value={metrics.activity.users.value} trend={metrics.activity.users.changePercent} data={metrics.trends.users} />
          </div>
        )}
      </div>
    </div>
  );
}
