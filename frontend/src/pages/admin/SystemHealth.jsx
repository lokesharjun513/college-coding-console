import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminSystemHealth, getAdminSystemMetrics } from '../../api/admin';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Toast from '../../components/ui/Toast';
import DataTable from '../../components/ui/DataTable';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import '../../styles/pages/admin.css';
import '../../styles/pages/system-health.css';

export default function SystemHealth() {
  const [healthData, setHealthData] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [healthRes, metricsRes] = await Promise.allSettled([
        getAdminSystemHealth(),
        getAdminSystemMetrics()
      ]);

      if (healthRes.status === 'fulfilled') {
        setHealthData(healthRes.value.data?.data || null);
      } else {
        setToast({ message: 'Failed to load system health status', type: 'error' });
      }

      if (metricsRes.status === 'fulfilled') {
        setMetricsData(metricsRes.value.data?.data || null);
      } else {
        setToast({ message: 'Failed to load execution metrics', type: 'error' });
      }

      if (healthRes.status === 'rejected' && metricsRes.status === 'rejected') {
        setError('Failed to load system monitoring data');
      }
    } catch (err) {
      setError('An unexpected error occurred while loading system monitoring data');
      setToast({ message: 'Error loading system monitoring data', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'degraded':
        return 'warning';
      case 'unavailable':
      case 'disconnected':
      case 'error':
        return 'danger';
      default:
        return 'default';
    }
  };

  const renderStatusBadge = (status) => {
    if (!status) return <Badge variant="default">unknown</Badge>;
    return (
      <Badge variant={getStatusBadgeVariant(status)}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="admin-page system-health-page">
        <header className="admin-page-header">
          <nav className="admin-breadcrumb" aria-label="Breadcrumb">
            <Link to="/admin" className="admin-breadcrumb__item">Admin</Link>
            <span className="admin-breadcrumb__separator">/</span>
            <span className="admin-breadcrumb__current" aria-current="page">System Health</span>
          </nav>
          <div className="admin-page-header-content">
            <div className="admin-page-header-text">
              <h1 className="admin-page-title">System Health & Execution Monitoring</h1>
              <p className="admin-page-description">Monitor platform availability, database health, execution engine status, and submission activity.</p>
            </div>
          </div>
        </header>
        <div className="admin-card admin-card-centered">
          <Spinner />
        </div>
      </div>
    );
  }

  const api = healthData?.api || {};
  const db = healthData?.database || {};
  const exec = healthData?.executionEngine || {};
  const memory = healthData?.memory || {};
  const metrics = metricsData || {};

  const recentFailuresColumns = [
    { key: 'studentName', header: 'Student' },
    { key: 'problemTitle', header: 'Problem' },
    { key: 'language', header: 'Language' },
    {
      key: 'verdict',
      header: 'Verdict',
      formatter: (val) => <Badge variant={getStatusBadgeVariant(val === 'ACCEPTED' ? 'healthy' : 'danger')}>{val}</Badge>
    },
    { key: 'runtimeFormatted', header: 'Runtime (ms)' },
    { key: 'memoryFormatted', header: 'Memory (KB)' },
    { key: 'createdAtFormatted', header: 'Created At' },
  ];

  const recentFailuresRows = (metrics.recentFailures || []).map(f => ({
    studentName: f.student ? f.student.name : 'Unknown',
    problemTitle: f.problem ? f.problem.title : 'Unknown',
    language: f.language,
    verdict: f.verdict,
    runtimeFormatted: f.runtime != null ? `${f.runtime} ms` : 'N/A',
    memoryFormatted: f.memory != null ? `${f.memory} KB` : 'N/A',
    createdAtFormatted: f.createdAt ? new Date(f.createdAt).toLocaleString() : 'N/A',
  }));

  const verdictBreakdown = metrics.verdictBreakdown || {};

  return (
    <div className="admin-page system-health-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Page Header */}
      <header className="admin-page-header">
        <nav className="admin-breadcrumb" aria-label="Breadcrumb">
          <Link to="/admin" className="admin-breadcrumb__item">Admin</Link>
          <span className="admin-breadcrumb__separator">/</span>
          <span className="admin-breadcrumb__current" aria-current="page">System Health</span>
        </nav>
        <div className="admin-page-header-content">
          <div className="admin-page-header-text">
            <h1 className="admin-page-title">System Health & Execution Monitoring</h1>
            <p className="admin-page-description">
              Monitor platform availability, database health, execution engine status, and submission activity.
            </p>
          </div>
          <div className="admin-header-actions">
            <Button variant="secondary" onClick={() => fetchData(true)} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
          </div>
        </div>
      </header>

      {error && (
        <div className="admin-error-box">
          <span>{error}</span>
        </div>
      )}

      {/* Section 1: System Overview */}
      <h2 className="admin-section-title">System Overview</h2>
      <div className="status-card-grid">
        <Card className="status-card">
          <div className="status-header">
            <span className="status-label">API Service</span>
            {renderStatusBadge(api.status || 'healthy')}
          </div>
          <div className="status-details">
            <div>Environment: {api.environment || 'N/A'}</div>
            <div>Uptime: {api.uptimeSeconds ? `${Math.floor(api.uptimeSeconds / 60)} mins` : 'N/A'}</div>
          </div>
        </Card>

        <Card className="status-card">
          <div className="status-header">
            <span className="status-label">MongoDB Database</span>
            {renderStatusBadge(db.status)}
          </div>
          <div className="status-details">
            <div>Ping Latency: {db.latencyMs != null ? `${db.latencyMs} ms` : 'N/A'}</div>
            <div>Connection State: {db.status || 'unknown'}</div>
          </div>
        </Card>

        <Card className="status-card">
          <div className="status-header">
            <span className="status-label">Execution Engine (Judge0)</span>
            {renderStatusBadge(exec.status)}
          </div>
          <div className="status-details">
            <div>Availability Latency: {exec.latencyMs != null ? `${exec.latencyMs} ms` : 'N/A'}</div>
            <div>Status: {exec.status || 'unknown'}</div>
          </div>
        </Card>
      </div>

      {/* Section 2: Platform Details */}
      <h2 className="admin-section-title">Platform Details & Resources</h2>
      <div className="stat-card-grid">
        <StatCard label="Node.js Version" value={api.nodeVersion || 'N/A'} />
        <StatCard label="Memory (RSS)" value={memory.rssMb != null ? `${memory.rssMb} MB` : 'N/A'} />
        <StatCard label="Heap Used" value={memory.heapUsedMb != null ? `${memory.heapUsedMb} MB` : 'N/A'} />
        <StatCard label="Heap Total" value={memory.heapTotalMb != null ? `${memory.heapTotalMb} MB` : 'N/A'} />
      </div>

      {/* Section 3: Execution Metrics */}
      <h2 className="admin-section-title">Submission Execution Metrics</h2>
      <div className="stat-card-grid">
        <StatCard label="Total Submissions" value={metrics.totalSubmissions ?? 0} />
        <StatCard label="Submissions Today" value={metrics.submissionsToday ?? 0} />
        <StatCard label="Accepted" value={metrics.acceptedSubmissions ?? 0} />
        <StatCard label="Failed" value={metrics.failedSubmissions ?? 0} />
        <StatCard label="Success Rate" value={`${metrics.successRate ?? 0}%`} />
        <StatCard label="Avg Runtime" value={`${metrics.averageRuntimeMs ?? 0} ms`} />
        <StatCard label="Avg Memory" value={`${metrics.averageMemoryKb ?? 0} KB`} />
      </div>

      {/* Section 4: Verdict Breakdown */}
      <h2 className="admin-section-title">Verdict Breakdown</h2>
      <div className="verdict-breakdown-grid">
        {Object.keys(verdictBreakdown).length === 0 ? (
          <p className="admin-text-secondary">No verdict breakdown data available.</p>
        ) : (
          Object.entries(verdictBreakdown).map(([verdict, count]) => (
            <Card key={verdict} className="verdict-card">
              <span className="verdict-label">{verdict}</span>
              <span className="verdict-count">{count}</span>
            </Card>
          ))
        )}
      </div>

      {/* Section 5: Recent Failures */}
      <h2 className="admin-section-title">Recent Execution Failures</h2>
      <Card>
        {recentFailuresRows.length === 0 ? (
          <div className="admin-card-empty">
            <EmptyState message="No recent execution failures found." />
          </div>
        ) : (
          <DataTable
            columns={recentFailuresColumns}
            data={recentFailuresRows}
          />
        )}
      </Card>
    </div>
  );
}
