import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBatchPerformance } from '../../../api/trainer';
import PageHeader from '../../../components/ui/PageHeader';
import TrainerBreadcrumb from '../../../components/trainer/TrainerBreadcrumb';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../../components/trainer';
import { formatCount, formatPercent } from '../../../utils/trainerDisplay';

/**
 * Batch performance — /trainer/batches/:batchId/performance
 *
 * GET /api/trainer/performance/batch/:batchId returns
 * { batchId, totalStudents, activeStudents, totalProblems, totalSubmissions,
 *   solvedProblems, progress }. Only those fields are rendered.
 */
export default function BatchPerformance() {
  const { batchId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getBatchPerformance(batchId);
      setData(res?.data?.data || null);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load performance');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading batch performance…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="trainer-page">
        <TrainerErrorState
          title="Couldn’t load performance"
          message={error || 'No performance data.'}
          onRetry={load}
        />
      </div>
    );
  }

  const metrics = [
    { key: 'total', label: 'Total Students', value: formatCount(data.totalStudents) },
    { key: 'active', label: 'Active Students', value: formatCount(data.activeStudents) },
    { key: 'problems', label: 'Total Problems', value: formatCount(data.totalProblems) },
    { key: 'submissions', label: 'Total Submissions', value: formatCount(data.totalSubmissions) },
    { key: 'solved', label: 'Solved Problems', value: formatCount(data.solvedProblems) },
    { key: 'progress', label: 'Progress', value: formatPercent(data.progress) },
  ];

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Batches', to: '/trainer/batches' },
          { label: 'Batch', to: `/trainer/batches/${batchId}` },
          { label: 'Performance' },
        ]}
      />

      <PageHeader
        title="Batch Performance"
        description="Aggregate completion and submission metrics for this batch."
      />

      <TrainerSectionCard title="Metrics" headingId="batch-performance-metrics">
        <div className="trainer-section-card__body--padded">
          {metrics.length === 0 ? (
            <TrainerEmptyState icon="barChart" title="No data." />
          ) : (
            <div className="trainer-metric-grid">
              {metrics.map((metric) => (
                <div key={metric.key} className="trainer-metric-tile">
                  <p className="trainer-metric-tile__label">{metric.label}</p>
                  <p className="trainer-metric-tile__value">{metric.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </TrainerSectionCard>
    </div>
  );
}