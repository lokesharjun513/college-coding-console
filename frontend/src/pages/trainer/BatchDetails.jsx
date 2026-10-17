import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getBatchAssignments, getBatchPerformance, getTrainerBatch } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import StatusBadge from '../../components/trainer/StatusBadge';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../components/trainer';
import { NOT_AVAILABLE, formatCount, formatDate, formatPercent } from '../../utils/trainerDisplay';
import '../../styles/pages/trainer-batches.css';

/**
 * Trainer batch detail — /trainer/batches/:batchId
 *
 * Read-only summary plus navigation into the batch's real sub-routes. Every
 * metric comes from GET /trainer/batches/:id or GET /trainer/performance/batch/:id.
 * Creating a batch, assigning a trainer or changing batch status are admin-only
 * and are deliberately absent here.
 */
export default function BatchDetails() {
  const { batchId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batch, setBatch] = useState(null);

  const [performance, setPerformance] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const [assignmentCount, setAssignmentCount] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);

  const loadBatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTrainerBatch(batchId);
      const data = res?.data?.data;
      if (!data) {
        setError('Batch not found');
        return;
      }
      setBatch(data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load batch details');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (batchId) loadBatch();
  }, [batchId, loadBatch]);

  // Performance snapshot — authoritative aggregate; fails gracefully.
  useEffect(() => {
    if (!batchId) return undefined;
    let active = true;
    setPerfLoading(true);
    getBatchPerformance(batchId)
      .then((res) => {
        if (active) setPerformance(res?.data?.data || null);
      })
      .catch(() => {
        if (active) setPerformance(null);
      })
      .finally(() => {
        if (active) setPerfLoading(false);
      });
    return () => {
      active = false;
    };
  }, [batchId]);

  // Assignment count for this batch. A failure is reported, never shown as zero.
  useEffect(() => {
    if (!batchId) return undefined;
    let active = true;
    getBatchAssignments(batchId)
      .then((res) => {
        if (active) setAssignmentCount((res?.data?.data || []).length);
      })
      .catch(() => {
        if (active) {
          setAssignmentCount(null);
          setAssignmentError('Assignment count unavailable.');
        }
      });
    return () => {
      active = false;
    };
  }, [batchId]);

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading batch…" />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="trainer-page">
        <TrainerErrorState
          title="Couldn’t load this batch"
          message={error || 'Batch not found.'}
          onRetry={() => navigate('/trainer/batches')}
          retryLabel="Back to batches"
        />
      </div>
    );
  }

  const term = [formatDate(batch.startDate), formatDate(batch.endDate)].join(' – ');
  const termIsEmpty = !batch.startDate && !batch.endDate;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: 'layers', to: `/trainer/batches/${batchId}`, active: true },
    { key: 'students', label: 'Students', icon: 'users', to: `/trainer/batches/${batchId}/students` },
    { key: 'problems', label: 'Problems', icon: 'fileCode', to: `/trainer/batches/${batchId}/problems` },
    { key: 'assignments', label: 'Assignments', icon: 'checkSquare', to: `/trainer/batches/${batchId}/assignments` },
    { key: 'performance', label: 'Performance', icon: 'barChart', to: `/trainer/batches/${batchId}/performance` },
    { key: 'monitoring', label: 'Monitoring', icon: 'chartBar', to: '/trainer/monitoring' },
  ];

  const metrics = performance
    ? [
        { key: 'active', label: 'Active Students', value: `${performance.activeStudents} / ${performance.totalStudents}` },
        { key: 'problems', label: 'Total Problems', value: formatCount(performance.totalProblems) },
        { key: 'submissions', label: 'Total Submissions', value: formatCount(performance.totalSubmissions) },
        { key: 'solved', label: 'Solved Problems', value: formatCount(performance.solvedProblems) },
        { key: 'progress', label: 'Overall Progress', value: formatPercent(performance.progress) },
      ]
    : [];

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Batches', to: '/trainer/batches' },
          { label: batch.name || 'Batch' },
        ]}
      />

      <PageHeader
        title={batch.name || NOT_AVAILABLE}
        description={batch.description || (batch.code ? `Batch code ${batch.code}` : 'Batch overview')}
        actions={
          <div className="trainer-page__actions">
            <StatusBadge status={batch.status} />
            <Button variant="secondary" onClick={() => navigate(`/trainer/batches/${batchId}/students`)}>
              Manage Students
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate(`/trainer/batches/${batchId}/problems/create`)}
            >
              Create Problem
            </Button>
          </div>
        }
      />

      {/* Batch sub-navigation — every tab is a registered route. */}
      <nav className="trainer-tabs" aria-label="Batch sections">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            className={`trainer-tab${tab.active ? ' trainer-tab--active' : ''}`}
            aria-current={tab.active ? 'page' : undefined}
          >
            <Icon name={tab.icon} size={14} />
            {tab.label}
          </Link>
        ))}
      </nav>

      <TrainerSectionCard title="Batch Summary" headingId="trainer-batch-summary-heading">
        <div className="trainer-metric-grid trainer-section-card__body--padded">
          <Metric label="Enrolled Students" value={formatCount(Number(batch.studentCount) || 0)} />
          <Metric
            label="Assignments"
            value={assignmentError ? NOT_AVAILABLE : formatCount(assignmentCount ?? 0)}
          />
          <Metric label="Batch Code" value={batch.code || NOT_AVAILABLE} />
          <Metric label="Academic Term" value={termIsEmpty ? NOT_AVAILABLE : term} />
          <Metric label="Assigned Trainer" value={batch.trainer?.name || 'You'} />
        </div>
      </TrainerSectionCard>

      <TrainerSectionCard
        icon="barChart"
        title="Batch Performance"
        subtitle="Aggregate completion and submission metrics"
        actionLabel="Detailed performance"
        actionTo={`/trainer/batches/${batchId}/performance`}
        headingId="trainer-batch-performance-heading"
      >
        <div className="trainer-section-card__body--padded">
          {perfLoading ? (
            <TrainerLoadingState label="Loading performance…" />
          ) : performance ? (
            <div className="trainer-metric-grid">
              {metrics.map((metric) => (
                <Metric key={metric.key} label={metric.label} value={metric.value} />
              ))}
            </div>
          ) : (
            <TrainerEmptyState
              icon="barChart"
              title="No performance data yet"
              description="Metrics appear once students start submitting solutions to this batch's problems."
            />
          )}
        </div>
      </TrainerSectionCard>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="trainer-metric-tile">
      <p className="trainer-metric-tile__label">{label}</p>
      <p className="trainer-metric-tile__value">{value}</p>
    </div>
  );
}