import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getProblemPerformance } from '../../../api/trainer';
import PageHeader from '../../../components/ui/PageHeader';
import TrainerBreadcrumb from '../../../components/trainer/TrainerBreadcrumb';
import StatusBadge from '../../../components/trainer/StatusBadge';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerKpiCard,
  TrainerKpiGrid,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../../components/trainer';
import { NOT_AVAILABLE, formatCount } from '../../../utils/trainerDisplay';

/**
 * Problem performance — /trainer/batches/:batchId/problems/:problemId/performance
 *
 * GET /api/trainer/performance/problem/:problemId returns
 * { problemId, totalSubmissions, solvedCount, solvedStudents, studentCount,
 *   studentProgress: [{ id, attempts, solved }] }.
 * `solvedCount` counts accepted submissions; `solvedStudents` counts distinct
 * students, so a student who retries is never counted twice.
 * The endpoint 403s unless the problem belongs to a batch this trainer owns.
 */
export default function ProblemPerformance() {
  const { batchId, problemId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getProblemPerformance(problemId);
      setData(res?.data?.data || null);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load problem performance');
    } finally {
      setLoading(false);
    }
  }, [problemId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading problem performance…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="trainer-page">
        <TrainerErrorState
          title="Couldn’t load problem performance"
          message={error || 'No performance data.'}
          onRetry={load}
        />
      </div>
    );
  }

  const progress = data.studentProgress || [];

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Problems', to: `/trainer/batches/${batchId}/problems` },
          { label: 'Problem', to: `/trainer/batches/${batchId}/problems/${problemId}` },
          { label: 'Performance' },
        ]}
      />

      <PageHeader
        title="Problem Performance"
        description="Submission activity and solve outcomes for this problem."
      />

      <TrainerKpiGrid title="Problem metrics">
        <TrainerKpiCard
          label="Total Submissions"
          icon="fileCode"
          value={formatCount(data.totalSubmissions)}
          meta="All attempts"
          tone="red"
        />
        <TrainerKpiCard
          label="Accepted Submissions"
          icon="checkSquare"
          value={formatCount(data.solvedCount)}
          meta="Verdict Accepted"
          tone="green"
        />
        <TrainerKpiCard
          label="Students Solved"
          icon="checkCircle2"
          value={formatCount(
            typeof data.solvedStudents === 'number'
              ? data.solvedStudents
              : progress.filter((p) => p.solved).length
          )}
          meta="Distinct students"
          tone="green"
        />
        <TrainerKpiCard
          label="Students Attempted"
          icon="users"
          value={formatCount(progress.length)}
          meta="Distinct students"
          tone="blue"
        />
      </TrainerKpiGrid>

      <TrainerSectionCard title="Student Progress" headingId="problem-performance-students">
        <div className="trainer-section-card__body--padded">
          {progress.length === 0 ? (
            <TrainerEmptyState
              icon="inbox"
              title="No student attempts"
              description="Nobody has submitted a solution to this problem yet."
            />
          ) : (
            <div className="trainer-table-wrapper">
              <table className="admin-table">
                <caption className="trainer-sr-only">Attempts per student for this problem</caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Attempts</th>
                    <th scope="col">Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.map((row) => (
                    <tr key={row.id}>
                      <th scope="row" className="trainer-table__row-head">
                        {row.name || row.id || NOT_AVAILABLE}
                      </th>
                      <td>{formatCount(row.attempts)}</td>
                      <td>
                        <StatusBadge tone={row.solved ? 'success' : 'neutral'}>
                          {row.solved ? 'Solved' : 'Attempted'}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TrainerSectionCard>
    </div>
  );
}