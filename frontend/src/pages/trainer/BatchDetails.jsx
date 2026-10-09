import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getTrainerBatch, getBatchPerformance } from '../../api/trainer';
import Icon from '../../components/ui/Icon';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import '../../styles/pages/trainer-batches.css';

// Map canonical backend status -> BEM modifier. Status also rendered as text (never color alone).
function statusClass(status) {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE') return 'active';
  if (s === 'COMPLETED') return 'completed';
  return 'neutral';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export default function BatchDetails() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batch, setBatch] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    const fetchBatchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getTrainerBatch(batchId);
        const batchData = res.data?.data;
        if (!batchData) {
          setError('Batch not found');
          return;
        }
        setBatch(batchData);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load batch details');
      } finally {
        setLoading(false);
      }
    };
    if (batchId) fetchBatchData();
  }, [batchId]);

  // Performance snapshot — real, authoritative aggregate API; fails gracefully.
  useEffect(() => {
    if (!batchId) return;
    let active = true;
    setPerfLoading(true);
    getBatchPerformance(batchId)
      .then((res) => { if (active) setPerformance(res.data?.data || null); })
      .catch(() => { if (active) setPerformance(null); })
      .finally(() => { if (active) setPerfLoading(false); });
    return () => { active = false; };
  }, [batchId]);

  if (loading) {
    return (
      <div className="trainer-batch-detail" style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-16)' }}>
        <Spinner />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="trainer-batch-detail">
        <div className="trainer-batches__error" role="alert">
          <span className="trainer-batches__error-icon">
            <Icon name="barChart" size={22} />
          </span>
          <h2>Couldn&apos;t load batch</h2>
          <p>Batch not found.</p>
          <Button variant="primary" onClick={() => navigate('/trainer/batches')}>Back to Batches</Button>
        </div>
      </div>
    );
  }

  const term = `${formatDate(batch.startDate)} – ${formatDate(batch.endDate)}`;

  const navItems = [
    { key: 'overview', label: 'Overview', icon: 'layers', to: `/trainer/batches/${batchId}`, active: true },
    { key: 'students', label: 'Students', icon: 'users', to: `/trainer/batches/${batchId}/students` },
    { key: 'problems', label: 'Problems', icon: 'fileCode', to: `/trainer/batches/${batchId}/problems` },
    { key: 'performance', label: 'Analytics', icon: 'barChart', to: `/trainer/batches/${batchId}/performance` },
    { key: 'training', label: 'Training', icon: 'trendingUp', to: `/trainer/training?batchId=${batchId}` },
    { key: 'monitoring', label: 'Monitoring', icon: 'chartBar', unavailable: true },
    { key: 'leaderboard', label: 'Leaderboard', icon: 'userCheck', unavailable: true },
  ];

  return (
    <div className="trainer-batch-detail">
      {/* Breadcrumb: Trainer / Batches / Batch Name */}
      <nav className="trainer-batch-detail__crumb" aria-label="Breadcrumb">
        <Link to="/trainer">Trainer</Link>
        <span className="trainer-batch-detail__crumb-sep">/</span>
        <Link to="/trainer/batches">Batches</Link>
        <span className="trainer-batch-detail__crumb-sep">/</span>
        <span className="trainer-batch-detail__crumb-current">{batch.name}</span>
      </nav>

      {/* Header */}
      <header className="trainer-batch-detail__header">
        <div className="trainer-batch-detail__header-main">
          <div className="trainer-batch-detail__title-row">
            <h1 className="trainer-batch-detail__title">{batch.name}</h1>
            {batch.status && (
              <span className={`trainer-batch-detail__status trainer-batch-detail__status--${statusClass(batch.status)}`}>
                {batch.status}
              </span>
            )}
          </div>
          <p className="trainer-batch-detail__subtitle">
            {batch.description || (batch.code ? `Batch code: ${batch.code}` : 'Batch')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', flexShrink: 0 }}>
          <Button variant="secondary" onClick={() => navigate(`/trainer/batches/${batchId}/students`)}>Manage Students</Button>
          <Button variant="primary" onClick={() => navigate(`/trainer/batches/${batchId}/problems/create`)}>Create Problem</Button>
        </div>
      </header>

      {/* Authoritative summary */}
      <section className="trainer-batch-detail__summary" aria-label="Batch summary">
        <div className="trainer-batch-detail__summary-item">
          <p className="trainer-batch-detail__summary-label">Enrolled Students</p>
          <p className="trainer-batch-detail__summary-value">{batch.studentCount ?? 0}</p>
        </div>
        <div className="trainer-batch-detail__summary-item">
          <p className="trainer-batch-detail__summary-label">Batch Code</p>
          <p className="trainer-batch-detail__summary-value">{batch.code || '—'}</p>
        </div>
        <div className="trainer-batch-detail__summary-item">
          <p className="trainer-batch-detail__summary-label">Academic Term</p>
          <p className="trainer-batch-detail__summary-value">{term}</p>
        </div>
        <div className="trainer-batch-detail__summary-item">
          <p className="trainer-batch-detail__summary-label">Assigned Trainer</p>
          <p className="trainer-batch-detail__summary-value">{batch.trainer?.name || 'You'}</p>
        </div>
      </section>

      {/* Module navigation — batch-scoped context hub */}
      <nav className="trainer-batch-detail__nav" aria-label="Batch modules">
        {navItems.map((item) =>
          item.unavailable ? (
            <span
              key={item.key}
              className="trainer-batch-detail__nav-item--unavailable"
              aria-disabled="true"
              title={`${item.label} arrives in a later phase`}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
              <span className="trainer-batch-detail__nav-soon">Upcoming</span>
            </span>
          ) : (
            <Link
              key={item.key}
              to={item.to}
              className={`trainer-batch-detail__nav-link${item.active ? ' trainer-batch-detail__nav-link--active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </Link>
          )
        )}
      </nav>

      {/* Existing gateway cards: Students & Problems (real routes) */}
      <section className="trainer-batch-detail__section-grid">
        <div className="trainer-batch-detail__section">
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-heading)', margin: '0 0 var(--space-1) 0' }}>
              Students &amp; Enrollments
            </h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', margin: 0 }}>
              Manage the student roster and enrollment status for this batch.
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate(`/trainer/batches/${batchId}/students`)}>View Students</Button>
        </div>

        <div className="trainer-batch-detail__section">
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-heading)', margin: '0 0 var(--space-1) 0' }}>
              Coding Problems
            </h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', margin: 0 }}>
              Create, edit, archive problems and manage test cases for this batch.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigate(`/trainer/batches/${batchId}/problems`)}>View Problems</Button>
            <Button variant="primary" onClick={() => navigate(`/trainer/batches/${batchId}/problems/create`)}>Create Problem</Button>
          </div>
        </div>
      </section>

      {/* Performance snapshot — authoritative aggregate API */}
      <section className="trainer-batch-detail__section" aria-label="Batch performance snapshot">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-heading)', margin: '0 0 var(--space-1) 0' }}>
              Batch Performance Snapshot
            </h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', margin: 0 }}>
              Aggregate completion and submission metrics.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate(`/trainer/batches/${batchId}/performance`)}>Detailed Performance</Button>
        </div>

        {perfLoading ? (
          <div style={{ padding: 'var(--space-6) 0', textAlign: 'center' }}><Spinner /></div>
        ) : performance ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
            <div className="trainer-batch-detail__summary-item">
              <p className="trainer-batch-detail__summary-label">Active Students</p>
              <p className="trainer-batch-detail__summary-value">{performance.activeStudents} / {performance.totalStudents}</p>
            </div>
            <div className="trainer-batch-detail__summary-item">
              <p className="trainer-batch-detail__summary-label">Total Problems</p>
              <p className="trainer-batch-detail__summary-value">{performance.totalProblems}</p>
            </div>
            <div className="trainer-batch-detail__summary-item">
              <p className="trainer-batch-detail__summary-label">Total Submissions</p>
              <p className="trainer-batch-detail__summary-value">{performance.totalSubmissions}</p>
            </div>
            <div className="trainer-batch-detail__summary-item">
              <p className="trainer-batch-detail__summary-label">Solved Problems</p>
              <p className="trainer-batch-detail__summary-value">{performance.solvedProblems}</p>
            </div>
            <div className="trainer-batch-detail__summary-item">
              <p className="trainer-batch-detail__summary-label">Overall Progress</p>
              <p className="trainer-batch-detail__summary-value">{performance.progress}%</p>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-muted)', margin: 0, textAlign: 'center', padding: 'var(--space-5) 0' }}>
            Performance metrics unavailable or no student submissions recorded yet.
          </p>
        )}
      </section>
    </div>
  );
}
