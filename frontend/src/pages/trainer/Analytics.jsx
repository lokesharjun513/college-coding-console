import React from 'react';
import PageHeader from '../../components/ui/PageHeader';
import {
  ProgressFilters,
  ProgressKpis,
  ProgressTable,
  useProgressAnalytics,
} from '../../components/trainer/ProgressViews';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../components/trainer';

/**
 * Trainer Analytics — /trainer/analytics
 *
 * Authoritative KPIs and leaderboard for a single batch, from
 * GET /api/trainer/analytics. A problem counts as solved only when a submission
 * is Accepted (backend/src/routes/trainer/analytics.js:97-108).
 *
 * Filtering cascades Batch -> Training -> Day -> Status; changing a parent
 * clears its children. The presentation is shared with Monitoring via
 * components/trainer/ProgressViews.jsx — this page differs only in that the
 * leaderboard rows are not selectable.
 */
export default function Analytics() {
  const view = useProgressAnalytics();

  const kpis = view.data?.kpis || null;
  const leaderboard = view.data?.leaderboard || [];

  return (
    <div className="trainer-page">
      <PageHeader
        title="Analytics"
        description="Batch progress based on accepted submissions. A problem counts as solved only when a submission is Accepted."
        breadcrumb={<span className="admin-breadcrumb__current">Analytics</span>}
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
        idPrefix="an"
      />

      {!view.batchId ? (
        <TrainerEmptyState
          icon="barChart"
          title="Select a batch"
          description="Choose one of your batches to see its key metrics and student leaderboard."
        />
      ) : (
        <>
          <TrainerSectionCard title="Key Metrics" headingId="analytics-kpis-heading">
            <div className="trainer-section-card__body--padded">
              {view.loading && !view.data ? (
                <TrainerLoadingState label="Loading key metrics…" />
              ) : (
                <ProgressKpis kpis={kpis} error={view.error} onRetry={view.reload} />
              )}
            </div>
          </TrainerSectionCard>

          <TrainerSectionCard
            title="Leaderboard"
            subtitle="Students ranked by completion percentage"
            headingId="analytics-leaderboard-heading"
          >
            <div className="trainer-section-card__body--padded">
              {view.loading && !view.data ? (
                <TrainerLoadingState label="Loading leaderboard…" />
              ) : view.error ? (
                <TrainerErrorState
                  title="Couldn’t load the leaderboard"
                  message={view.error}
                  onRetry={view.reload}
                />
              ) : (
                <ProgressTable
                  leaderboard={leaderboard}
                  caption="Student progress ranked by completion percentage"
                />
              )}
            </div>
          </TrainerSectionCard>
        </>
      )}
    </div>
  );
}