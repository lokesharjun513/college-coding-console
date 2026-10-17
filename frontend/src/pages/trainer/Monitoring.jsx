import React, { useCallback, useEffect, useState } from 'react';
import { getTrainerStudentDetail } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import {
  ProgressFilters,
  ProgressKpis,
  ProgressTable,
  StudentDetailPanel,
  useProgressAnalytics,
} from '../../components/trainer/ProgressViews';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../components/trainer';

/**
 * Trainer Monitoring — /trainer/monitoring
 *
 * Batch -> Training -> Day -> student drill-down. Every metric comes from
 * GET /api/trainer/analytics and GET /api/trainer/analytics/student/:id; the
 * page only observes.
 *
 * This route is kept separate from /trainer/analytics because it adds the
 * per-student panel and makes leaderboard rows selectable. The filter cascade,
 * KPI set and leaderboard columns are shared components — see
 * components/trainer/ProgressViews.jsx.
 */
export default function Monitoring() {
  const view = useProgressAnalytics({
    extraReset: useCallback(() => setSelectedStudentId(''), []),
  });

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailKey, setDetailKey] = useState(0);

  useEffect(() => {
    if (!view.batchId || !selectedStudentId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getTrainerStudentDetail(selectedStudentId, {
      batchId: view.batchId,
      collectionId: view.collectionId || undefined,
      topicId: view.topicId || undefined,
    })
      .then((res) => {
        if (!cancelled) setDetail(res?.data?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(err?.response?.data?.message || 'Unable to load student progress.');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view.batchId, view.collectionId, view.topicId, selectedStudentId, detailKey]);

  const kpis = view.data?.kpis || null;
  const leaderboard = view.data?.leaderboard || [];
  const selectedRow = leaderboard.find((row) => String(row.studentId) === String(selectedStudentId));

  return (
    <div className="trainer-page">
      <PageHeader
        title="Monitoring"
        description="Track student progress through each Training and Day. A problem counts as solved only when a submission is Accepted."
        breadcrumb={<span className="admin-breadcrumb__current">Monitoring</span>}
      />

      <ProgressFilters
        batches={view.batches}
        batchesLoading={view.batchesLoading}
        batchesError={view.batchesError}
        batchId={view.batchId}
        onBatchChange={view.handleBatchChange}
        collections={view.collections}
        collectionId={view.collectionId}
        onCollectionChange={view.handleCollectionChange}
        topics={view.topics}
        topicId={view.topicId}
        onTopicChange={view.handleTopicChange}
        status={view.status}
        onStatusChange={view.handleStatusChange}
        idPrefix="mo"
      />

      {!view.batchId ? (
        <TrainerEmptyState
          icon="chartBar"
          title="Select a batch"
          description="Choose one of your batches to monitor how its students are progressing."
        />
      ) : (
        <div className="trainer-split">
          <div>
            <TrainerSectionCard title="Key Metrics" headingId="monitoring-kpis-heading">
              <div className="trainer-section-card__body--padded">
                {view.loading && !view.data ? (
                  <TrainerLoadingState label="Loading key metrics…" />
                ) : (
                  <ProgressKpis kpis={kpis} error={view.error} onRetry={view.reload} />
                )}
              </div>
            </TrainerSectionCard>

            <TrainerSectionCard
              title="Student Progress"
              subtitle="Select a student to inspect their per-Day and per-Problem progress"
              headingId="monitoring-students-heading"
            >
              <div className="trainer-section-card__body--padded">
                {view.loading && !view.data ? (
                  <TrainerLoadingState label="Loading student progress…" />
                ) : view.error ? (
                  <TrainerErrorState
                    title="Couldn’t load student progress"
                    message={view.error}
                    onRetry={view.reload}
                  />
                ) : (
                  <ProgressTable
                    leaderboard={leaderboard}
                    caption="Student progress by completion percentage"
                    selectable
                    selectedId={selectedStudentId}
                    onSelect={(id) =>
                      setSelectedStudentId((current) => (String(current) === String(id) ? '' : id))
                    }
                  />
                )}
              </div>
            </TrainerSectionCard>
          </div>

          <aside className="trainer-split__aside" id="trainer-student-detail" aria-label="Student progress detail">
            <StudentDetailPanel
              studentId={selectedStudentId}
              studentName={selectedRow?.name}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onRetry={() => setDetailKey((k) => k + 1)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}