import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, ArrowRight, Play, Activity, Server, Database, ShieldCheck, Code2, BarChart3, Users, FileCode2, UserRound, Clock3, TrendingUp, TrendingDown, Circle, CalendarDays, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Skeleton from '../../components/ui/Skeleton';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { getBatches, getAdminSystemHealth, getAdminPlatformActivity, getAdminRecentActivity, getTrainers, updateBatch } from '../../api/admin';
import Sparkline from '../../components/common/Sparkline';
import '../../styles/pages/admin.css';
import '../../styles/pages/admin-dashboard.css';
import '../../styles/pages/admin-batches.css';

/**
  * Admin Dashboard – Apple-inspired enterprise SaaS redesign.
  */
export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Batches state
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [errorBatches, setErrorBatches] = useState(null);
  const [updatingBatchId, setUpdatingBatchId] = useState(null);
  const [statusModal, setStatusModal] = useState(null);
  const [toast, setToast] = useState(null);

  const handleBatchStatusToggle = (batch) => {
    if (!batch || !batch.id || updatingBatchId) return;
    const currentStatus = batch.status || 'ACTIVE';
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setStatusModal({
      batch,
      currentStatus,
      nextStatus
    });
  };

  const confirmStatusChange = async () => {
    if (!statusModal || updatingBatchId) return;
    const { batch, nextStatus } = statusModal;

    setUpdatingBatchId(batch.id);
    setStatusModal(null); // Close modal right away

    try {
      const res = await updateBatch(batch.id, { status: nextStatus });
      if (res.data?.success && res.data?.data) {
        // Sync with backend confirmed response
        setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, ...res.data.data } : b));
        setToast({ message: `Batch ${nextStatus.toLowerCase()} successfully`, type: 'success' });
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to update batch status', type: 'error' });
      console.error('Failed to update batch status:', err);
    } finally {
      setUpdatingBatchId(null);
    }
  };

  // Platform Health state
  const [platformHealth, setPlatformHealth] = useState([]);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [errorHealth, setErrorHealth] = useState(null);

  // Platform Activity state
  const [platformActivity, setPlatformActivity] = useState(null);
  const [loadingPlatformActivity, setLoadingPlatformActivity] = useState(true);
  const [errorPlatformActivity, setErrorPlatformActivity] = useState(null);
  const [activityRange, setActivityRange] = useState('7d');

// Sparkline Chart Component removed in favor of shared component

  // Recent Activity state
  const [recentActivity, setRecentActivity] = useState(null);
  const [loadingRecentActivity, setLoadingRecentActivity] = useState(true);
  const [errorRecentActivity, setErrorRecentActivity] = useState(null);

  // KPI state
  const [trainerCount, setTrainerCount] = useState(null);
  const [batchCount, setBatchCount] = useState(null);
  const [systemStatus, setSystemStatus] = useState('Operational');
  const [loadingKPI, setLoadingKPI] = useState(true);
  const [errorKPI, setErrorKPI] = useState(null);

  // Fetch KPI data (trainers & batches count & health)
  useEffect(() => {
    const fetchKPI = async () => {
      try {
        const [trainersRes, batchesRes, healthRes] = await Promise.all([
          getTrainers(),
          getBatches(),
          getAdminSystemHealth()
        ]);
        setTrainerCount(trainersRes.data?.data?.length ?? 0);
        setBatchCount(batchesRes.data?.data?.length ?? 0);
        if (healthRes.data?.success) {
          const { api, database, executionEngine } = healthRes.data.data;
          const allHealthy = api.status === 'healthy' && database.status === 'healthy' && executionEngine.status === 'healthy';
          setSystemStatus(allHealthy ? 'Operational' : 'Degraded');
        }
      } catch (err) {
        setErrorKPI(err?.response?.data?.message || 'Failed to load dashboard metrics');
      } finally {
        setLoadingKPI(false);
      }
    };
    fetchKPI();
  }, []);

  // Fetch recent batches (up to 5)
  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const res = await getBatches();
        const recent = (res.data?.data ?? []).slice(0, 5);
        setBatches(recent);
      } catch (err) {
        setErrorBatches(err?.response?.data?.message || 'Failed to load recent batches');
      } finally {
        setLoadingBatches(false);
      }
    };
    fetchBatches();
  }, []);

  // Fetch Platform Health
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await getAdminSystemHealth();
        if (res.data?.success) {
          const { api, database, executionEngine } = res.data.data;
          const mapStatus = (s) => {
            if (s === 'healthy') return 'operational';
            if (s === 'degraded') return 'degraded';
            return 'down'; // unavailable or anything else
          };
          const authStatus = api.status === 'healthy' ? 'operational' : 'degraded';
          setPlatformHealth([
            { id: 'api', name: 'API Server', status: mapStatus(api.status) },
            { id: 'mongodb', name: 'MongoDB Database', status: mapStatus(database.status) },
            { id: 'auth', name: 'Authentication Service', status: authStatus },
            { id: 'code-execution', name: 'Code Execution Engine', status: mapStatus(executionEngine.status) },
          ]);
          setErrorHealth(null);
        } else {
          setErrorHealth('Failed to load platform health');
        }
      } catch (err) {
        console.error('Failed to load health:', err);
        setErrorHealth('Failed to load platform health');
      } finally {
        setLoadingHealth(false);
      }
    };
    fetchHealth();
  }, []);

  // Fetch Platform Activity
  useEffect(() => {
    const fetchPlatformActivity = async () => {
      try {
        const res = await getAdminPlatformActivity(activityRange);
        setPlatformActivity(res.data);
        setErrorPlatformActivity(null);
      } catch (err) {
        setErrorPlatformActivity(err?.response?.data?.message || 'Failed to load platform activity');
      } finally {
        setLoadingPlatformActivity(false);
      }
    };
    fetchPlatformActivity();
  }, [activityRange]);

  // Fetch Recent Activity
  useEffect(() => {
    const fetchRecentActivity = async () => {
      try {
        const res = await getAdminRecentActivity();
        setRecentActivity(res.data);
        setErrorRecentActivity(null);
      } catch (err) {
        setErrorRecentActivity(err?.response?.data?.message || 'Failed to load recent activity');
      } finally {
        setLoadingRecentActivity(false);
      }
    };
    fetchRecentActivity();
  }, []);

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num;
  };

  const formatChangePercent = (percent) => {
    if (percent === null) {
      return '—';
    }
    const abs = Math.abs(percent);
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${abs}%`;
  };

  const formatRelativeTime = (timestamp) => {
    const now = new Date();
    const past = new Date(timestamp);
    const seconds = Math.floor((now - past) / 1000);

    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  };

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const isInitialLoading = loadingKPI || loadingBatches || loadingHealth || loadingPlatformActivity || loadingRecentActivity;

  if (isInitialLoading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-dashboard__loading" aria-busy="true">
          <div className="admin-dashboard__loader">
            <div className="admin-dashboard__loader-ring" />
            <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
              Loading dashboard...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__content">
        {/* Page Header */}
      <header className="admin-dashboard__header">
        <nav className="admin-breadcrumb" aria-label="Breadcrumb">
          <a href="/admin" className="admin-breadcrumb__item">Home</a>
          <span className="admin-breadcrumb__separator">/</span>
          <span className="admin-breadcrumb__current" aria-current="page">Dashboard</span>
        </nav>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 className="admin-dashboard__title">Dashboard</h1>
            <p className="admin-dashboard__description">
              Welcome back, {user?.name || 'Administrator'}. Monitor platform activity, batches, and system health.
            </p>
          </div>
          <div className="admin-dashboard__date-card">
            <div className="admin-dashboard__date-card-icon">
              <CalendarDays size={17} strokeWidth={1.9} />
            </div>
            <div className="admin-dashboard__date-card-text">
              <div className="admin-dashboard__date-card-day">
                {new Date().toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className="admin-dashboard__date-card-date">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '')}
              </div>
            </div>
            <ChevronDown size={14} strokeWidth={2} className="admin-dashboard__date-card-chevron" />
          </div>
        </div>
      </header>


      {/* KPI Grid */}
      <div className="admin-dashboard__kpi-grid">
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Active Trainers</span>
            <div className="admin-dashboard__stat-icon"><Users size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{loadingKPI ? '...' : trainerCount}</div>
          <div className="admin-dashboard__stat-meta">Registered platform trainers</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Academic Batches</span>
            <div className="admin-dashboard__stat-icon"><Layers size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{loadingKPI ? '...' : batchCount}</div>
          <div className="admin-dashboard__stat-meta">Active and archived batches</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">System Status</span>
            <div className="admin-dashboard__stat-icon"><Activity size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value" style={{ fontSize: '24px' }}>{loadingKPI ? '...' : systemStatus}</div>
          <div className="admin-dashboard__stat-meta">Platform health core</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Platform Core</span>
            <div className="admin-dashboard__stat-icon"><Database size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value" style={{ fontSize: '24px' }}>v1.0.0</div>
          <div className="admin-dashboard__stat-meta">Enterprise Edition</div>
        </div>
      </div>

      {/* Analytics Overview */}
      <div className="analytics-overview-grid">
      {/* Platform Activity Section */}
      {errorPlatformActivity ? (
        <div className="admin-dashboard__section admin-error-box">
          {errorPlatformActivity}
        </div>
      ) : (
        <section className="platform-activity-card">
          <div className="platform-activity-header">
            <div className="platform-activity-heading">
              <div className="platform-activity-icon">
                <BarChart3 size={18} strokeWidth={2} />
              </div>
              <div>
                <h2>Platform Activity</h2>
                <p>Overview of key activities in the platform</p>
              </div>
            </div>
            <select
              value={activityRange}
              onChange={(e) => setActivityRange(e.target.value)}
              className="platform-activity-range"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>

          {loadingPlatformActivity ? (
            <div className="platform-activity-metrics">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="platform-activity-metric">
                  <div className="platform-activity-metric-header">
                    <div className="platform-activity-metric-label">
                      <Users size={15} />
                      <span>Students</span>
                    </div>
                  </div>
                  <div className="platform-activity-metric-value-row">
                    <Skeleton width="80px" height="24px" />
                  </div>
                  <div className="platform-activity-sparkline">
                    <Skeleton width="100%" height="20px" />
                  </div>
                </div>
              ))}
            </div>
          ) : platformActivity ? (
            <div className="platform-activity-metrics">
              {/* Students */}
              <div className="platform-activity-metric">
                <div className="platform-activity-metric-header">
                  <div className="platform-activity-metric-label">
                    <Users size={15} />
                    <span>Students</span>
                  </div>
                </div>
                <div className="platform-activity-metric-value-row">
                  <strong>{formatNumber(platformActivity.metrics.students.value)}</strong>
                  <span className="platform-activity-change">
                    {platformActivity.metrics.students.changePercent !== null && (
                      <>
                        {platformActivity.metrics.students.changePercent >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {formatChangePercent(platformActivity.metrics.students.changePercent)}
                      </>
                    )}
                    {platformActivity.metrics.students.changePercent === null && <span>—</span>}
                  </span>
                </div>
                <div className="platform-activity-sparkline">
                  <Sparkline data={platformActivity.trends.students} color="#2F7EDA" />
                </div>
              </div>

              {/* Submissions */}
              <div className="platform-activity-metric">
                <div className="platform-activity-metric-header">
                  <div className="platform-activity-metric-label">
                    <FileCode2 size={15} />
                    <span>Submissions</span>
                  </div>
                </div>
                <div className="platform-activity-metric-value-row">
                  <strong>{formatNumber(platformActivity.metrics.submissions.value)}</strong>
                  <span className="platform-activity-change">
                    {platformActivity.metrics.submissions.changePercent !== null && (
                      <>
                        {platformActivity.metrics.submissions.changePercent >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {formatChangePercent(platformActivity.metrics.submissions.changePercent)}
                      </>
                    )}
                    {platformActivity.metrics.submissions.changePercent === null && <span>—</span>}
                  </span>
                </div>
                <div className="platform-activity-sparkline">
                  <Sparkline data={platformActivity.trends.submissions} color="#2F7EDA" />
                </div>
              </div>

              {/* Problems */}
              <div className="platform-activity-metric">
                <div className="platform-activity-metric-header">
                  <div className="platform-activity-metric-label">
                    <FileCode2 size={15} />
                    <span>Problems</span>
                  </div>
                </div>
                <div className="platform-activity-metric-value-row">
                  <strong>{formatNumber(platformActivity.metrics.problems.value)}</strong>
                  <span className="platform-activity-change">
                    {platformActivity.metrics.problems.changePercent !== null && (
                      <>
                        {platformActivity.metrics.problems.changePercent >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {formatChangePercent(platformActivity.metrics.problems.changePercent)}
                      </>
                    )}
                    {platformActivity.metrics.problems.changePercent === null && <span>—</span>}
                  </span>
                </div>
                <div className="platform-activity-sparkline">
                  <Sparkline data={platformActivity.trends.problems} color="#2F7EDA" />
                </div>
              </div>

              {/* Users */}
              <div className="platform-activity-metric">
                <div className="platform-activity-metric-header">
                  <div className="platform-activity-metric-label">
                    <UserRound size={15} />
                    <span>Users</span>
                  </div>
                </div>
                <div className="platform-activity-metric-value-row">
                  <strong>{formatNumber(platformActivity.metrics.users.value)}</strong>
                  <span className="platform-activity-change">
                    {platformActivity.metrics.users.changePercent !== null && (
                      <>
                        {platformActivity.metrics.users.changePercent >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {formatChangePercent(platformActivity.metrics.users.changePercent)}
                      </>
                    )}
                    {platformActivity.metrics.users.changePercent === null && <span>—</span>}
                  </span>
                </div>
                <div className="platform-activity-sparkline">
                  <Sparkline data={platformActivity.trends.users} color="#2F7EDA" />
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-message-center">
              No activity data available
            </div>
          )}
        </section>
      )}

      {/* Platform Health Section */}
      {errorHealth ? (
        <div className="admin-dashboard__section admin-error-box">
          {errorHealth}
        </div>
      ) : (
        <section className="platform-health-card">
          <div className="platform-health-header">
            <div className="platform-health-heading">
              <div className="platform-health-icon"><Activity size={18} strokeWidth={1.9} /></div>
              <div><h2>Platform Health</h2><p>Core infrastructure status</p></div>
            </div>
            <button type="button" className="platform-health-view-details" onClick={() => navigate('/admin/system/health')}>
              <span>View Details</span><ArrowRight size={15} />
            </button>
          </div>
          {loadingHealth ? (
            <div className="platform-health-services">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="platform-health-service">
                  <div className="platform-health-service-info"><Skeleton width="20px" height="20px" /><span><Skeleton width="100px" height="12px" /></span></div>
                  <Skeleton width="78px" height="20px" />
                  <span className="platform-health-service-uptime">—</span>
                </div>
              ))}
            </div>
          ) : platformHealth.length > 0 ? (
            <div className="platform-health-services">
              {platformHealth.map((service) => (
                <div key={service.id} className="platform-health-service">
                  <div className="platform-health-service-info">
                    <div className="platform-health-service-icon">
                      {service.id === 'api' && <Server size={17} strokeWidth={1.9} />}
                      {service.id === 'mongodb' && <Database size={17} strokeWidth={1.9} />}
                      {service.id === 'auth' && <ShieldCheck size={17} strokeWidth={1.9} />}
                      {service.id === 'code-execution' && <Code2 size={17} strokeWidth={1.9} />}
                    </div>
                    <span className="platform-health-service-name">{service.name}</span>
                  </div>
                  <div className={`platform-health-service-status platform-health-status-${service.status}`}>
                    <span className="platform-health-status-dot" />
                    <span className="platform-health-status-label">{service.status.charAt(0).toUpperCase() + service.status.slice(1)}</span>
                  </div>
                  <div className="platform-health-service-uptime">—</div>
                </div>
              ))}
            </div>
          ) : <div className="platform-health-empty">No health data available</div>}
        </section>
      )}
      </div>


      {/* Main Analytics / Recent Batches & Recent Activity 2-Column Grid */}
      <div className="recent-data-grid">
        {/* Recent Batches Section */}
        <section className="recent-batches-card">
          <div className="recent-batches-header">
            <div className="recent-batches-heading">
              <div className="recent-batches-icon">
                <Layers size={18} strokeWidth={2} />
              </div>
              <div>
                <h2>Recent Batches</h2>
                <p>Latest academic batches added to the platform</p>
              </div>
            </div>
            <button type="button" className="recent-batches-view-all" onClick={() => navigate('/admin/batches')}>
              <span>View All</span>
              <ArrowRight size={15} />
            </button>
          </div>

          <div className="recent-batches-table-wrapper">
            {loadingBatches ? (
              <Skeleton width="100%" height="120px" />
            ) : errorBatches ? (
              <div className="admin-error-box">{errorBatches}</div>
            ) : batches.length === 0 ? (
              <div className="admin-message-center">
                No batches available.
              </div>
             ) : (
               <table className="admin-table">
                 <thead>
                   <tr>
                     <th>#</th>
                     <th>Batch Name</th>
                     <th>Code</th>
                     <th>Status</th>
                     <th>Created</th>
                     <th>Students</th>
                     <th className="recent-batches-actions-header">Actions</th>
                   </tr>
                 </thead>
                 <tbody>
                   {batches.map((batch, index) => (
                     <tr key={batch.id}>
                       <td className="batch-num-cell">{index + 1}</td>
                       <td className="batch-name-cell">{batch.name}</td>
                       <td className="batch-code-cell">{batch.code || '—'}</td>
                       <td>
                         <button
                           type="button"
                           className={`admin-badge admin-badge--${String(batch.status || '').toLowerCase()}`}
                           onClick={() => handleBatchStatusToggle(batch)}
                           disabled={updatingBatchId === batch.id}
                           title="Click to toggle status"
                         >
                           {updatingBatchId === batch.id ? '...' : (batch.status || '—')}
                         </button>
                       </td>
                       <td className="batch-created-cell">
                         {batch.createdAt ? (() => {
                           const d = new Date(batch.createdAt);
                           const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                           return `${String(d.getDate()).padStart(2, '0')}/${months[d.getMonth()]}/${d.getFullYear()}`;
                         })() : '—'}
                       </td>
                       <td className="batch-students-cell">{batch.studentCount ?? 0}</td>
                       <td className="batch-actions-cell">
                        <button
                          type="button"
                          className="batch-action-button"
                          aria-label={`View ${batch.name}`}
                          title="View Batch"
                          onClick={() => navigate(`/admin/batches/${batch.id}`)}
                        >
                          <Play size={16} strokeWidth={3} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Recent Activity Section */}
        {errorRecentActivity ? (
          <div className="admin-dashboard__section admin-error-box">
            {errorRecentActivity}
          </div>
        ) : (
        <section className="recent-activity-card">
          <div className="recent-activity-header">
            <div className="recent-activity-heading">
              <div className="recent-activity-icon">
                <Clock3 size={18} strokeWidth={2} />
              </div>
              <div>
                <h2>Recent Activity</h2>
                <p>Latest platform activities</p>
              </div>
            </div>
            <button
              type="button"
              className="recent-activity-view-all"
              onClick={() => navigate('/admin/recent-activity')}
            >
              <span>View All</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {loadingRecentActivity ? (
            <div className="recent-activity-list">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="recent-activity-item">
                  <div className="recent-activity-item-icon">
                    <Skeleton width="24px" height="24px" />
                  </div>
                  <div className="recent-activity-item-title">
                    <Skeleton width="80px" height="12px" />
                  </div>
                  <time className="recent-activity-item-time">
                    <Skeleton width="40px" height="10px" />
                  </time>
                </div>
              ))}
            </div>
          ) : recentActivity ? (
            <div className="recent-activity-list">
              {recentActivity.activities.map((activity) => (
                <div key={activity.id} className="recent-activity-item">
                  <div className="recent-activity-item-icon">
                    {(() => {
                      switch (activity.type) {
                        case 'batch_created': return <Layers size={16} />;
                        case 'student_registered': return <UserRound size={16} />;
                        case 'problem_created': return <FileCode2 size={16} />;
                        case 'trainer_registered': return <UserRound size={16} />;
                        case 'system': return <Database size={16} />;
                        default: return <Circle size={16} />;
                      }
                    })()}
                  </div>
                  <div className="recent-activity-item-title">
                    {activity.title}
                  </div>
                  <time className="recent-activity-item-time">
                    {formatRelativeTime(activity.timestamp)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-message-center">
              No recent activity
            </div>
          )}
        </section>
        )}
      </div>

      {/* Quick Actions Section */}
      <div className="admin-dashboard__qa-card">
        <div className="admin-dashboard__qa-header">
          <h2 className="admin-dashboard__qa-title">Quick Actions</h2>
          <p className="admin-dashboard__qa-subtitle">Common administrative shortcuts</p>
        </div>
        <div className="admin-dashboard__qa-grid">
          <button
            type="button"
            className="admin-dashboard__qa-btn admin-dashboard__qa-btn--primary"
            onClick={() => navigate('/admin/trainers')}
          >
            <span className="admin-dashboard__qa-icon"><Users size={17} /></span>
            <span className="admin-dashboard__qa-label">Manage Trainers</span>
            <span className="admin-dashboard__qa-arrow"><ArrowRight size={14} /></span>
          </button>
          <button
            type="button"
            className="admin-dashboard__qa-btn"
            onClick={() => navigate('/admin/batches')}
          >
            <span className="admin-dashboard__qa-icon"><Layers size={17} /></span>
            <span className="admin-dashboard__qa-label">Manage Batches</span>
            <span className="admin-dashboard__qa-arrow"><ArrowRight size={14} /></span>
          </button>
          <button
            type="button"
            className="admin-dashboard__qa-btn"
            onClick={() => navigate('/admin/problems')}
          >
            <span className="admin-dashboard__qa-icon"><Code2 size={17} /></span>
            <span className="admin-dashboard__qa-label">Coding Problems</span>
            <span className="admin-dashboard__qa-arrow"><ArrowRight size={14} /></span>
          </button>
          <button
            type="button"
            className="admin-dashboard__qa-btn"
            onClick={() => navigate('/admin/submissions')}
          >
            <span className="admin-dashboard__qa-icon"><FileCode2 size={17} /></span>
            <span className="admin-dashboard__qa-label">View Submissions</span>
            <span className="admin-dashboard__qa-arrow"><ArrowRight size={14} /></span>
          </button>
        </div>
      </div>

       {/* Status Toggle Confirmation Modal (Reusing Batches Modal Pattern) */}
       {statusModal && (
         <Modal isOpen={!!statusModal} onClose={() => setStatusModal(null)} title="Confirm Status Change">
           <div className="admin-modal__body">
             <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
               Are you sure you want to change status of <strong>{statusModal.batch.name}</strong> to <strong>{statusModal.nextStatus}</strong>?
             </p>
           </div>
           <div className="admin-modal__footer">
             <button
               type="button"
               className="admin-batches__btn-danger-gradient"
               onClick={() => setStatusModal(null)}
             >
               Cancel
             </button>
             <button
               type="button"
               className="admin-batches__btn-success-gradient"
               onClick={confirmStatusChange}
             >
               Confirm
             </button>
           </div>
         </Modal>
       )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </div>
  );
}
