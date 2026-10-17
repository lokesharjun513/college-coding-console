import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTrainerBatches } from '../../api/trainer';
import Icon from '../../components/ui/Icon';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerKpiCard,
  TrainerKpiGrid,
  TrainerLoadingState,
} from '../../components/trainer';
import StatusBadge from '../../components/trainer/StatusBadge';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import { NOT_AVAILABLE, formatCount, formatDate } from '../../utils/trainerDisplay';
import '../../styles/trainer.css';
import '../../styles/pages/trainer-batches.css';

/**
 * One breadcrumb definition for all three render states.
 *
 * This page previously hand-rolled the markup three times and the copies had
 * drifted apart: the loading and error states used `trainer-breadcrumb` with
 * "Trainer / Batch", while the loaded state used `admin-breadcrumb` with
 * uppercase "TRAINER / BATCH". TrainerBreadcrumb is the shared component every
 * other Trainer page uses, so the wording and styling no longer depend on which
 * state happens to be showing.
 */
const BREADCRUMB_ITEMS = [
  { label: 'Trainer', to: '/trainer' },
  { label: 'Batches' },
];

/** Trainer "My Batches" — /trainer/batches. Read-only; batch creation is admin-only. */
export default function BatchesList() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTrainerBatches();
      setBatches(res?.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(
      (b) =>
        (b.name && b.name.toLowerCase().includes(q)) ||
        (b.code && b.code.toLowerCase().includes(q))
    );
  }, [batches, search]);

  // Trainer-wide aggregates, all summed from the real batches payload.
  const summary = useMemo(() => {
    const students = batches.reduce((sum, b) => sum + (Number(b.studentCount) || 0), 0);
    const active = batches.filter(
      (b) => String(b.status || '').toUpperCase() === 'ACTIVE'
    ).length;
    return { total: batches.length, students, active };
  }, [batches]);

  if (loading) {
    return (
      <div className="trainer-page">
        <header className="trainer-page-header">
          <TrainerBreadcrumb items={BREADCRUMB_ITEMS} />
          <div className="trainer-page-header-content">
            <div className="trainer-page-header-text">
              <h1 className="trainer-page-title">Your Batches</h1>
              <p className="trainer-page-description">Batches assigned to you by an administrator.</p>
            </div>
          </div>
        </header>
        <TrainerLoadingState label="Loading your batches…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="trainer-page">
        <header className="trainer-page-header">
          <TrainerBreadcrumb items={BREADCRUMB_ITEMS} />
          <div className="trainer-page-header-content">
            <div className="trainer-page-header-text">
              <h1 className="trainer-page-title">Your Batches</h1>
              <p className="trainer-page-description">Batches assigned to you by an administrator.</p>
            </div>
          </div>
        </header>
        <TrainerErrorState title="Couldn’t load your batches" message={error} onRetry={fetchData} />
      </div>
    );
  }

  return (
    <div className="admin-dashboard trainer-page">
      <header className="trainer-page-header">
        <TrainerBreadcrumb items={BREADCRUMB_ITEMS} />
        <div className="trainer-page-header-content">
          <div className="trainer-page-header-text">
            <h1 className="admin-dashboard__title">Your Batches</h1>
            <p className="admin-dashboard__description">Batches assigned to you by an administrator.</p>
          </div>
        </div>
      </header>

      {batches.length > 0 ? (
        <TrainerKpiGrid title="Batch summary">
          <TrainerKpiCard
            label="Total Batches"
            icon="layers"
            value={formatCount(summary.total)}
            meta="Assigned to you"
            tone="red"
          />
          <TrainerKpiCard
            label="Active"
            icon="checkSquare"
            value={formatCount(summary.active)}
            meta="Currently running"
            tone="green"
          />
          <TrainerKpiCard
            label="Enrolled Students"
            icon="users"
            value={formatCount(summary.students)}
            meta="Summed across your batches"
            tone="blue"
          />
        </TrainerKpiGrid>
      ) : null}

      {batches.length > 0 ? (
        <section className="trainer-filter-bar">
          <label className="trainer-sr-only" htmlFor="trainer-batch-search">
            Search batches
          </label>
          <div className="trainer-search-wrapper">
            <Icon name="search" className="trainer-filter-icon" size={16} ariaLabel="Search" />
            <input
              id="trainer-batch-search"
              type="search"
              className="trainer-search"
              placeholder="Search by batch name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search ? (
            <button
              className="trainer-filter-clear"
              onClick={() => setSearch('')}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </section>
      ) : null}

      {filtered.length === 0 ? (
        <TrainerEmptyState
          icon="layers"
          title={batches.length === 0 ? 'No batches assigned yet' : 'No matches'}
          description={
            batches.length === 0
              ? 'Once an administrator assigns you a batch it will appear here, together with its students, problems and progress.'
              : 'No batches match your search. Try a different name or code.'
          }
        >
          {batches.length === 0 ? (
            <button
              className="trainer-filter-clear"
              onClick={fetchData}
              type="button"
            >
              <Icon name="refreshCw" size={14} />
              Refresh
            </button>
          ) : (
            <button
              className="trainer-filter-clear"
              onClick={() => setSearch('')}
              type="button"
            >
              Clear search
            </button>
          )}
        </TrainerEmptyState>
      ) : (
        <section className="trainer-card-grid" aria-label="Your batches">
          {filtered.map((batch) => {
            const term = [batch.startDate, batch.endDate]
              .filter(Boolean)
              .map((d) => formatDate(d))
              .join(' – ');
            const studentCount = formatCount(Number(batch.studentCount) || 0);
            const trainerName = batch.trainer?.name || NOT_AVAILABLE;
            return (
              <article key={batch.id} className="trainer-batch-card">
                <header className="trainer-batch-card__header">
                  <div className="trainer-batch-card__identity">
                    <span className="trainer-batch-card__icon" aria-hidden="true">
                      <Icon name="layers" size={18} />
                    </span>
                    <div className="trainer-batch-card__content">
                      <h2 className="trainer-batch-card__title">
                        <Link to={`/trainer/batches/${batch.id}`}>
                          {batch.name || NOT_AVAILABLE}
                        </Link>
                      </h2>
                      {batch.description ? (
                        <p className="trainer-batch-card__description">
                          {batch.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <StatusBadge status={batch.status} />
                </header>
                <hr className="trainer-batch-card__divider" />
                <div className="trainer-batch-card__metadata">
                  <div className="trainer-batch-card__metadata-row">
                    <span className="trainer-batch-card__metadata-icon" aria-hidden="true">
                      <Icon name="users" size={16} />
                    </span>
                    <span className="trainer-batch-card__metadata-label">Students</span>
                    <span className="trainer-batch-card__metadata-value">{studentCount}</span>
                  </div>
                  {term ? (
                    <div className="trainer-batch-card__metadata-row">
                      <span className="trainer-batch-card__metadata-icon" aria-hidden="true">
                        <Icon name="calendar" size={16} />
                      </span>
                      <span className="trainer-batch-card__metadata-label">Term</span>
                      <span className="trainer-batch-card__metadata-value">{term}</span>
                    </div>
                  ) : null}
                  <div className="trainer-batch-card__metadata-row">
                    <span className="trainer-batch-card__metadata-icon" aria-hidden="true">
                      <Icon name="user" size={16} />
                    </span>
                    <span className="trainer-batch-card__metadata-label">Trainer</span>
                    <span className="trainer-batch-card__metadata-value">{trainerName}</span>
                  </div>
                </div>
                <footer className="trainer-batch-card__footer">
                  <Link
                    to={`/trainer/batches/${batch.id}`}
                    className="trainer-batch-card__action"
                    aria-label={`View batch ${batch.name}`}
                  >
                    View batch
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}