import React, { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import {
  TrainerLoadingState,
  TrainerErrorState,
  TrainerEmptyState,
  TrainerSectionCard,
} from '../../components/trainer';
import { getTrainerBatches, getTrainerAnalytics } from '../../api/trainer';
import { NOT_AVAILABLE, formatCount, formatPercent } from '../../utils/trainerDisplay';
import { ProgressKpis, ProgressTable } from '../../components/trainer/ProgressViews';

/**
 * Trainer Leaderboard — /trainer/leaderboard
 *
 * Shows a batch‑scoped leaderboard based on accepted submissions.
 * Uses the same backend endpoint as the Analytics page (GET /api/trainer/analytics)
 * but only exposes the batch selector and the ranking table.
 */
export default function TrainerLeaderboard() {
  // --- Batch loading ----------------------------------------------------
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
      setBatchesError(err?.response?.data?.message || 'Unable to load batches.');
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // --- Selected batch --------------------------------------------------
  const [batchId, setBatchId] = useState('');

  // --- Analytics loading ------------------------------------------------
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadAnalytics = useCallback(async (id) => {
    if (!id) {
      setAnalytics(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getTrainerAnalytics({ batchId: id });
      setAnalytics(res?.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load leaderboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(batchId);
  }, [batchId, loadAnalytics]);

  // --- Render ----------------------------------------------------------
  if (batchesLoading) {
    return (
      <div className="trainer-page">
        <TrainerBreadcrumb items={[{ label: 'Trainer', to: '/trainer' }, { label: 'Leaderboard' }]} />
        <PageHeader title="Leaderboard" description="Track coding performance across your assigned batches." />
        <TrainerLoadingState label="Loading batches…" />
      </div>
    );
  }

  if (batchesError) {
    return (
      <div className="trainer-page">
        <TrainerBreadcrumb items={[{ label: 'Trainer', to: '/trainer' }, { label: 'Leaderboard' }]} />
        <PageHeader title="Leaderboard" description="Track coding performance across your assigned batches." />
        <TrainerErrorState title="Couldn’t load batches" message={batchesError} onRetry={loadBatches} />
      </div>
    );
  }

  const hasBatches = batches.length > 0;

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb items={[{ label: 'Trainer', to: '/trainer' }, { label: 'Leaderboard' }]} />
      <PageHeader title="Leaderboard" description="Track coding performance across your assigned batches." />

      {/* Batch selector */}
      {hasBatches ? (
        <div className="trainer-filter-bar">
          <label htmlFor="leaderboard-batch" className="trainer-sr-only">Batch</label>
          <select
            id="leaderboard-batch"
            className="trainer-select"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            <option value="">Select a batch…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || b.code || NOT_AVAILABLE}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <TrainerEmptyState icon="layers" title="No batches assigned" description="You have no batches to view a leaderboard for." />
      )}

      {/* Loading / error / empty states for analytics */}
      {batchId && loading && <TrainerLoadingState label="Loading leaderboard…" />}
      {batchId && error && <TrainerErrorState title="Couldn’t load leaderboard" message={error} onRetry={() => loadAnalytics(batchId)} />}

      {batchId && !loading && !error && analytics && (
        <>
          {/* KPI card */}
          <TrainerSectionCard title="Key Metrics" headingId="leaderboard-kpis-heading">
            <ProgressKpis kpis={analytics.kpis} />
          </TrainerSectionCard>

          {/* Leaderboard table */}
          <TrainerSectionCard title="Leaderboard" subtitle="Students ranked by completion percentage" headingId="leaderboard-table-heading">
            <ProgressTable
              leaderboard={analytics.leaderboard}
              caption="Student progress ranked by completion percentage"
            />
          </TrainerSectionCard>
        </>
      )}

      {/* No batch selected */}
      {!batchId && (
        <TrainerEmptyState
          icon="trophy"
          title="Select a batch"
          description="Choose one of your batches to see its student leaderboard."
        />
      )}

      {/* Empty leaderboard */}
      {batchId && !loading && !error && analytics && analytics.leaderboard && analytics.leaderboard.length === 0 && (
        <TrainerEmptyState
          icon="trophy"
          title="No students match the selected filters"
          description="There are no eligible students in this batch yet."
        />
      )}
    </div>
  );
}
