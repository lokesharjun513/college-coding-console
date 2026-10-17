import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStudentPerformance } from '../../../api/trainer';
import PageHeader from '../../../components/ui/PageHeader';
import TrainerBreadcrumb from '../../../components/trainer/TrainerBreadcrumb';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../../components/trainer';
import { formatCount } from '../../../utils/trainerDisplay';

/**
 * Student performance — /trainer/batches/:batchId/students/:studentId/performance
 *
 * GET /api/trainer/performance/student/:studentId?batchId= returns
 * { studentId, name, email, attemptedCount, solvedCount, totalSubmissions }.
 * The endpoint 403s unless the student is enrolled in a batch this trainer owns.
 */
export default function StudentPerformance() {
  const { studentId, batchId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getStudentPerformance(studentId, batchId);
      setData(res?.data?.data || null);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load student performance');
    } finally {
      setLoading(false);
    }
  }, [studentId, batchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading student performance…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="trainer-page">
        <TrainerErrorState
          title="Couldn’t load student performance"
          message={error || 'No performance data.'}
          onRetry={load}
        />
      </div>
    );
  }

  const metrics = [
    { key: 'name', label: 'Name', value: data.name },
    { key: 'email', label: 'Email', value: data.email },
    { key: 'attempted', label: 'Attempted Problems', value: formatCount(data.attemptedCount) },
    { key: 'solved', label: 'Solved Problems', value: formatCount(data.solvedCount) },
    { key: 'submissions', label: 'Total Submissions', value: formatCount(data.totalSubmissions) },
  ];

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Batches', to: '/trainer/batches' },
          { label: 'Students', to: `/trainer/batches/${batchId}/students` },
          { label: 'Performance' },
        ]}
      />

      <PageHeader
        title="Student Performance"
        description="Attempted and solved problems for this student in the selected batch."
      />

      <TrainerSectionCard title="Metrics" headingId="student-performance-metrics">
        <div className="trainer-section-card__body--padded">
          {metrics.length === 0 ? (
            <TrainerEmptyState icon="barChart" title="No data." />
          ) : (
            <div className="trainer-metric-grid">
              {metrics.map((metric) => (
                <div key={metric.key} className="trainer-metric-tile">
                  <p className="trainer-metric-tile__label">{metric.label}</p>
                  <p className="trainer-metric-tile__value">{metric.value || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </TrainerSectionCard>
    </div>
  );
}