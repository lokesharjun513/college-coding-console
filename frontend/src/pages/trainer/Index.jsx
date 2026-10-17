import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/ui/Icon';
import {
  TrainerSectionCard,
  TrainerKpiGrid,
  TrainerKpiCard,
  TrainerQuickActions,
  TrainerLoadingState,
  TrainerErrorState,
  TrainerEmptyState,
} from '../../components/trainer';
import { NOT_AVAILABLE, formatCount, formatPercent, statusBadgeVariant, statusLabel } from '../../utils/trainerDisplay';
import { getTrainerAnalytics, getTrainerBatches } from '../../api/trainer';
import '../../styles/pages/trainer-dashboard.css';

/**
 * Trainer Dashboard – full rebuild from scratch.
 *
 * This file renders only the dashboard page content. The surrounding layout
 * (sidebar, header) is provided by TrainerLayout via the route configuration.
 *
 * KPI Note: The analytics API is batch-scoped. The dashboard displays metrics
 * for the first available batch and clearly labels them as batch-specific.
 * Trainer-wide aggregation requires backend API support.
 */
export default function TrainerDashboard() {
  const { user } = useAuth();

  const firstName = useMemo(() => {
    const name = user?.name?.trim() ?? '';
    return name.split(/\s+/)[0] ?? '';
  }, [user]);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    []
  );

  const ids = {
    kpis: 'kpis-heading',
    batches: 'batches-heading',
    leaderboard: 'leaderboard-heading',
  };

  // Batches state
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState(null);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const res = await getTrainerBatches();
      setBatches(res?.data?.data || []);
    } catch (err) {
      setBatchesError(err?.response?.data?.message || 'Failed to load batches.');
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // Analytics state (batch-scoped, uses first batch)
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const analyticsRunRef = useRef(0);

  const loadAnalytics = useCallback(async (batchId) => {
    if (!batchId) {
      setAnalytics(null);
      return;
    }
    const run = analyticsRunRef.current + 1;
    analyticsRunRef.current = run;
    setAnalyticsError(null);
    try {
      const res = await getTrainerAnalytics({ batchId });
      if (analyticsRunRef.current !== run) return;
      setAnalytics(res?.data?.data || null);
    } catch (err) {
      if (analyticsRunRef.current !== run) return;
      setAnalytics(null);
      setAnalyticsError(err?.response?.data?.message || 'Failed to load analytics.');
    }
  }, []);

  const selectedBatch = useMemo(() => {
    if (batches.length === 0) return null;
    return batches[0];
  }, [batches]);

  useEffect(() => {
    loadAnalytics(selectedBatch?.id || '');
  }, [selectedBatch?.id, loadAnalytics]);

  const kpis = analytics?.kpis || {};
  const leaderboard = analytics?.leaderboard || [];

  return (
    <div className="trainer-page">
      {/* Welcome Header */}
      <header className="trainer-dashboard__greeting">
        <div className="trainer-dashboard__greeting-text">
          <h1 className="trainer-dashboard__greeting-name">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </h1>
          <p className="trainer-dashboard__greeting-meta">
            <span>{today}</span>
            <span className="trainer-dashboard__greeting-divider" aria-hidden="true">·</span>
            <span>Trainer dashboard</span>
          </p>
        </div>
        <div className="trainer-page__actions">
          <Link className="btn btn-primary" to="/trainer/batches">
            <Icon name="layers" size={14} />
            View Batches
          </Link>
        </div>
      </header>

      {/* Quick Actions */}
      <TrainerQuickActions
        title="Quick Actions"
        subtitle="Common tasks for trainers"
        actions={[
          { key: 'batches', label: 'My Batches', icon: 'layers', to: '/trainer/batches' },
          { key: 'problems', label: 'Problems', icon: 'fileCode', to: '/trainer/problems' },
          { key: 'assignments', label: 'Assignments', icon: 'checkSquare', to: '/trainer/assignments' },
        ]}
      />

      {/* KPI Cards - Batch-specific metrics */}
      <TrainerSectionCard
        icon="barChart"
        title="Key Metrics"
        subtitle={selectedBatch ? `Metrics for ${selectedBatch.name}` : 'Batch-specific performance'}
        headingId={ids.kpis}
      >
        {batchesLoading ? (
          <TrainerLoadingState label="Loading metrics…" />
        ) : analyticsError ? (
          <TrainerErrorState
            title="Couldn't load analytics"
            message={analyticsError}
            onRetry={() => loadAnalytics(selectedBatch?.id || '')}
          />
        ) : batches.length === 0 ? (
          <TrainerEmptyState
            title="No batches available"
            description="Assign a batch to view performance metrics."
            icon="layers"
          />
        ) : (
          <TrainerKpiGrid title="Key Metrics">
            <TrainerKpiCard
              label="Active Students"
              value={formatCount(kpis.activeStudents)}
              meta="In this batch"
              icon="users"
              tone="blue"
            />
            <TrainerKpiCard
              label="Assigned Problems"
              value={formatCount(kpis.assignedProblems)}
              meta="Published"
              icon="fileCode"
              tone="red"
            />
            <TrainerKpiCard
              label="Solved Assignments"
              value={formatCount(kpis.solvedAssignments)}
              meta="Completed"
              icon="checkSquare"
              tone="green"
            />
            <TrainerKpiCard
              label="Completion Rate"
              value={kpis.completionRate != null ? formatPercent(kpis.completionRate) : NOT_AVAILABLE}
              meta="Overall"
              icon="percent"
              tone="orange"
            />
          </TrainerKpiGrid>
        )}
      </TrainerSectionCard>

      {/* Batch Overview */}
      <TrainerSectionCard
        icon="layers"
        title="My Batches"
        subtitle="Overview of assigned batches"
        actionLabel="View all"
        actionTo="/trainer/batches"
        headingId={ids.batches}
      >
        {batchesLoading ? (
          <TrainerLoadingState label="Loading batches…" />
        ) : batchesError ? (
          <TrainerErrorState
            title="Couldn't load batches"
            message={batchesError}
            onRetry={loadBatches}
          />
        ) : batches.length === 0 ? (
          <TrainerEmptyState
            title="No batches assigned"
            description="Batches assigned to you will appear here."
            icon="layers"
          />
        ) : (
          <div className="trainer-table-wrapper">
            <table className="admin-table">
              <caption className="trainer-sr-only">
                Batches assigned to you with code, student count and status
              </caption>
              <thead>
                <tr>
                  <th scope="col">Batch</th>
                  <th scope="col">Code</th>
                  <th scope="col">Students</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {batches.slice(0, 5).map((batch) => (
                  <tr key={batch.id}>
                    <th scope="row" className="trainer-table__row-head">
                      <Link to={`/trainer/batches/${batch.id}`} className="trainer-table__link">
                        {batch.name || NOT_AVAILABLE}
                      </Link>
                    </th>
                    <td className="trainer-table__muted">{batch.code || NOT_AVAILABLE}</td>
                    <td>{formatCount(Number(batch.studentCount) || 0)}</td>
                    <td>
                      <span className={`trainer-badge trainer-badge--${statusBadgeVariant(batch.status)}`}>
                        {statusLabel(batch.status)}
                      </span>
                    </td>
                    <td>
                      <Link to={`/trainer/batches/${batch.id}`} className="btn btn-secondary">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TrainerSectionCard>

      {/* Top Performing Students */}
      <TrainerSectionCard
        icon="trophy"
        title="Top Performing Students"
        subtitle={selectedBatch ? `Leaderboard for ${selectedBatch.name}` : 'Current batch leaderboard'}
        actionLabel="View all"
        actionTo="/trainer/analytics"
        headingId={ids.leaderboard}
      >
        {batchesLoading ? (
          <TrainerLoadingState label="Loading leaderboard…" />
        ) : analyticsError ? (
          <TrainerErrorState
            title="Couldn't load leaderboard"
            message={analyticsError}
            onRetry={() => loadAnalytics(selectedBatch?.id || '')}
          />
        ) : batches.length === 0 ? (
          <TrainerEmptyState
            title="No batch selected"
            description="Assign a batch to view student rankings."
            icon="trophy"
          />
        ) : leaderboard.length === 0 ? (
          <TrainerEmptyState
            title="No leaderboard data yet"
            description="Student rankings will appear once they start completing problems."
            icon="trophy"
          />
        ) : (
          <ul className="trainer-list-rows">
            {leaderboard.slice(0, 5).map((student, index) => (
              <li key={student.studentId} className="trainer-list-row">
                <span className="trainer-list-row__marker" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="trainer-list-row__body">
                  <p className="trainer-list-row__title">{student.name || NOT_AVAILABLE}</p>
                  <p className="trainer-list-row__meta">
                    {formatCount(student.solvedProblems)} solved ·{' '}
                    {formatPercent(student.completionPercentage)}
                  </p>
                </span>
                <span className="trainer-list-row__aside">
                  <Link
                    to={`/trainer/batches/${selectedBatch.id}/students/${student.studentId}`}
                    className="btn btn-secondary"
                  >
                    View
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </TrainerSectionCard>
    </div>
  );
}
