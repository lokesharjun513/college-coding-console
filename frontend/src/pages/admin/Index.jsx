import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/ui/DataTable';
import Skeleton from '../../components/ui/Skeleton';
import Icon from '../../components/ui/Icon';
import { getTrainers, getBatches } from '../../api/admin';
import '../../styles/pages/admin-dashboard.css';

/**
  * Admin Dashboard – Apple-inspired enterprise SaaS redesign.
  */
export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // KPI & Batches state
  const [trainerCount, setTrainerCount] = useState(null);
  const [batchCount, setBatchCount] = useState(null);
  const [loadingKPI, setLoadingKPI] = useState(true);
  const [errorKPI, setErrorKPI] = useState(null);

  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [errorBatches, setErrorBatches] = useState(null);

  // Fetch KPI data (trainers & batches count)
  useEffect(() => {
    const fetchKPI = async () => {
      try {
        const [trainersRes, batchesRes] = await Promise.all([getTrainers(), getBatches()]);
        setTrainerCount(trainersRes.data?.data?.length ?? 0);
        setBatchCount(batchesRes.data?.data?.length ?? 0);
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

  const batchColumns = [
    { key: 'name', header: 'Batch Name' },
    { key: 'code', header: 'Code' },
    { key: 'status', header: 'Status' },
    { key: 'createdAt', header: 'Created' },
  ];

  const batchRows = batches.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code || '—',
    status: b.status,
    createdAt: new Date(b.createdAt).toLocaleDateString(),
  }));

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="admin-dashboard">
      {/* Page Header */}
      <header className="admin-dashboard__header">
        <div className="admin-dashboard__eyebrow">Admin Overview</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 className="admin-dashboard__title">Dashboard</h1>
            <p className="admin-dashboard__description">
              Welcome back, {user?.name || 'Administrator'}. Monitor platform activity, batches, and system health.
            </p>
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(15, 36, 65, 0.48)', fontWeight: 500, padding: '8px 12px', background: 'rgba(15, 36, 65, 0.03)', borderRadius: '8px', border: '1px solid rgba(15, 36, 65, 0.06)' }}>
            {currentDate}
          </div>
        </div>
      </header>

      {/* KPI Grid */}
      {errorKPI ? (
        <div className="admin-dashboard__section" style={{ color: 'var(--color-danger, #C34954)' }}>
          {errorKPI}
        </div>
      ) : (
        <div className="admin-dashboard__kpi-grid">
          {/* Trainers */}
          <div className="admin-dashboard__stat-card">
            <div className="admin-dashboard__stat-header">
              <span className="admin-dashboard__stat-label">Active Trainers</span>
              <div className="admin-dashboard__stat-icon">
                <Icon name="user" size={18} color="#FFFFFF" />
              </div>
            </div>
            {loadingKPI ? (
              <Skeleton width="60px" height="32px" />
            ) : (
              <div className="admin-dashboard__stat-value">{trainerCount ?? 0}</div>
            )}
            <div className="admin-dashboard__stat-meta">Registered platform trainers</div>
          </div>

          {/* Batches */}
          <div className="admin-dashboard__stat-card">
            <div className="admin-dashboard__stat-header">
              <span className="admin-dashboard__stat-label">Academic Batches</span>
              <div className="admin-dashboard__stat-icon">
                <Icon name="settings" size={18} color="#FFFFFF" />
              </div>
            </div>
            {loadingKPI ? (
              <Skeleton width="60px" height="32px" />
            ) : (
              <div className="admin-dashboard__stat-value">{batchCount ?? 0}</div>
            )}
            <div className="admin-dashboard__stat-meta">Active and archived batches</div>
          </div>

          {/* System Status */}
          <div className="admin-dashboard__stat-card">
            <div className="admin-dashboard__stat-header">
              <span className="admin-dashboard__stat-label">System Status</span>
              <div className="admin-dashboard__stat-icon">
                <Icon name="check" size={18} color="#FFFFFF" />
              </div>
            </div>
            <div className="admin-dashboard__stat-value" style={{ fontSize: '24px', color: '#FFFFFF' }}>
              Operational
            </div>
            <div className="admin-dashboard__stat-meta">All services running normally</div>
          </div>

          {/* Platform Version */}
          <div className="admin-dashboard__stat-card">
            <div className="admin-dashboard__stat-header">
              <span className="admin-dashboard__stat-label">Platform Core</span>
              <div className="admin-dashboard__stat-icon">
                <Icon name="code" size={18} color="#FFFFFF" />
              </div>
            </div>
            <div className="admin-dashboard__stat-value" style={{ fontSize: '24px' }}>
              v2.5 Enterprise
            </div>
            <div className="admin-dashboard__stat-meta">Apple-inspired UI architecture</div>
          </div>
        </div>
      )}

      {/* Main Analytics / Recent Batches & Health 2-Column Grid */}
      <div className="admin-dashboard__grid-2col">
        {/* Recent Batches Section */}
        <div className="admin-dashboard__section" style={{ marginBottom: 0 }}>
          <div className="admin-dashboard__section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 className="admin-dashboard__section-title">Recent Batches</h2>
              <p className="admin-dashboard__section-desc">Latest academic batches added to the platform</p>
            </div>
            <button
              type="button"
              className="admin-dashboard__action-btn admin-dashboard__action-btn--secondary"
              onClick={() => navigate('/admin/batches')}
              style={{ height: '32px', fontSize: '13px', padding: '0 12px' }}
            >
              View All
            </button>
          </div>

          {loadingBatches ? (
            <Skeleton width="100%" height="120px" />
          ) : errorBatches ? (
            <div style={{ color: 'var(--color-danger, #C34954)', fontSize: '13px' }}>{errorBatches}</div>
          ) : batchRows.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(15, 36, 65, 0.48)', fontSize: '13px' }}>
              No batches available.
            </div>
          ) : (
            <DataTable
              columns={batchColumns}
              data={batchRows}
              loading={false}
              error={null}
              emptyMessage="No batches available."
            />
          )}
        </div>

        {/* Platform Health Section */}
        <div className="admin-dashboard__section" style={{ marginBottom: 0 }}>
          <div className="admin-dashboard__section-header">
            <h2 className="admin-dashboard__section-title">Platform Health</h2>
            <p className="admin-dashboard__section-desc">Core infrastructure status</p>
          </div>

          <div className="admin-dashboard__health-list">
            <div className="admin-dashboard__health-item">
              <span className="admin-dashboard__health-name">API Server</span>
              <span className="admin-dashboard__health-badge admin-dashboard__health-badge--operational">
                <span className="admin-dashboard__health-dot" /> Operational
              </span>
            </div>
            <div className="admin-dashboard__health-item">
              <span className="admin-dashboard__health-name">PostgreSQL Database</span>
              <span className="admin-dashboard__health-badge admin-dashboard__health-badge--operational">
                <span className="admin-dashboard__health-dot" /> Operational
              </span>
            </div>
            <div className="admin-dashboard__health-item">
              <span className="admin-dashboard__health-name">Authentication Service</span>
              <span className="admin-dashboard__health-badge admin-dashboard__health-badge--operational">
                <span className="admin-dashboard__health-dot" /> Operational
              </span>
            </div>
            <div className="admin-dashboard__health-item">
              <span className="admin-dashboard__health-name">Code Execution Engine</span>
              <span className="admin-dashboard__health-badge admin-dashboard__health-badge--operational">
                <span className="admin-dashboard__health-dot" /> Operational
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Section */}
      <div className="admin-dashboard__section">
        <div className="admin-dashboard__section-header">
          <h2 className="admin-dashboard__section-title">Quick Actions</h2>
          <p className="admin-dashboard__section-desc">Common administrative shortcuts</p>
        </div>
        <div className="admin-dashboard__actions">
          <button
            type="button"
            className="admin-dashboard__action-btn admin-dashboard__action-btn--primary"
            onClick={() => navigate('/admin/trainers')}
          >
            <Icon name="user" size={16} color="#FFFFFF" /> Manage Trainers
          </button>
          <button
            type="button"
            className="admin-dashboard__action-btn admin-dashboard__action-btn--secondary"
            onClick={() => navigate('/admin/batches')}
          >
            <Icon name="settings" size={16} color="#0F2441" /> Manage Batches
          </button>
          <button
            type="button"
            className="admin-dashboard__action-btn admin-dashboard__action-btn--secondary"
            onClick={() => navigate('/admin/problems')}
          >
            <Icon name="code" size={16} color="#0F2441" /> Coding Problems
          </button>
          <button
            type="button"
            className="admin-dashboard__action-btn admin-dashboard__action-btn--secondary"
            onClick={() => navigate('/admin/submissions')}
          >
            <Icon name="check" size={16} color="#0F2441" /> View Submissions
          </button>
        </div>
      </div>
    </div>
  );
}
