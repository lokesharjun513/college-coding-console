import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  getTrainerAnalytics,
  getTrainerBatches,
  getTrainerCollectionTopics,
  getTrainerCollections,
} from '../../api/trainer';
import Icon from '../ui/Icon';
import Spinner from '../ui/Spinner';
import StatusBadge from './StatusBadge';
import { TrainerEmptyState } from './TrainerStateCard';
import { NOT_AVAILABLE, formatCount, formatPercent, formatRatio } from '../../utils/trainerDisplay';

/**
 * Shared building blocks for the Analytics and Monitoring pages.
 *
 * The two routes render the same four-level cascade, the same KPI set and the
 * same leaderboard table; Monitoring simply adds a per-student detail panel and
 * makes the rows selectable. These components hold that shared presentation so
 * the two pages only differ by behaviour.
 *
 * All values are read from GET /api/trainer/analytics. Nothing is computed
 * here; a missing field renders as "—" rather than a guessed number.
 */

/** Batch -> Training -> Day -> Status cascade. Clearing a parent clears its children. */
export function ProgressFilters({
  batches,
  batchesLoading,
  batchesError,
  batchId,
  onBatchChange,
  collections,
  collectionId,
  onCollectionChange,
  topics,
  topicId,
  onTopicChange,
  status,
  onStatusChange,
  idPrefix,
}) {
  if (batchesLoading) {
    return (
      <div className="trainer-filter-bar">
        <Spinner size={18} />
        <span className="trainer-table__muted">Loading your batches…</span>
      </div>
    );
  }

  if (batchesError) {
    return (
      <div className="trainer-notice trainer-notice--error" role="alert">
        {batchesError}
      </div>
    );
  }

  if (batches.length === 0) {
    return <TrainerEmptyState icon="layers" title="No batches assigned." />;
  }

  return (
    <div className="trainer-filter-bar">
      <div className="trainer-filter-field">
        <label htmlFor={`${idPrefix}-batch`}>Batch</label>
        <select
          id={`${idPrefix}-batch`}
          className="trainer-select"
          value={batchId}
          onChange={(e) => onBatchChange(e.target.value)}
        >
          <option value="">Select a batch…</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
              {batch.code ? ` (${batch.code})` : ''}
            </option>
          ))}
        </select>
      </div>

      {batchId ? (
        <>
          <div className="trainer-filter-field">
            <label htmlFor={`${idPrefix}-training`}>Training</label>
            <select
              id={`${idPrefix}-training`}
              className="trainer-select"
              value={collectionId}
              onChange={(e) => onCollectionChange(e.target.value)}
            >
              <option value="">All trainings</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </div>

          <div className="trainer-filter-field">
            <label htmlFor={`${idPrefix}-day`}>Day</label>
            <select
              id={`${idPrefix}-day`}
              className="trainer-select"
              value={topicId}
              onChange={(e) => onTopicChange(e.target.value)}
              disabled={!collectionId}
            >
              <option value="">All days</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>

          <div className="trainer-filter-field">
            <label htmlFor={`${idPrefix}-status`}>Status</label>
            <select
              id={`${idPrefix}-status`}
              className="trainer-select"
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </>
      ) : null}
    </div>
  );
}

ProgressFilters.propTypes = {
  batches: PropTypes.array.isRequired,
  batchesLoading: PropTypes.bool,
  batchesError: PropTypes.string,
  batchId: PropTypes.string.isRequired,
  onBatchChange: PropTypes.func.isRequired,
  collections: PropTypes.array.isRequired,
  collectionId: PropTypes.string.isRequired,
  onCollectionChange: PropTypes.func.isRequired,
  topics: PropTypes.array.isRequired,
  topicId: PropTypes.string.isRequired,
  onTopicChange: PropTypes.func.isRequired,
  status: PropTypes.string.isRequired,
  onStatusChange: PropTypes.func.isRequired,
  idPrefix: PropTypes.string.isRequired,
};

ProgressFilters.defaultProps = { batchesLoading: false, batchesError: null };

/** The four KPI values returned by GET /api/trainer/analytics. */
export function ProgressKpis({ kpis, error, onRetry }) {
  if (error) {
    return (
<TrainerEmptyState
        role="alert"
        icon="alertTriangle"
        title="Couldn't load metrics"
        description={error}
      >
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      </TrainerEmptyState>
    );
  }

  const tiles = [
    { key: 'active', label: 'Active Students', icon: 'users', value: kpis ? formatCount(kpis.activeStudents) : NOT_AVAILABLE },
    { key: 'assigned', label: 'Assigned Problems', icon: 'fileCode', value: kpis ? formatCount(kpis.assignedProblems) : NOT_AVAILABLE },
    { key: 'solved', label: 'Solved Assignments', icon: 'checkSquare', value: kpis ? formatCount(kpis.solvedAssignments) : NOT_AVAILABLE },
    { key: 'rate', label: 'Completion Rate', icon: 'barChart', value: kpis ? formatPercent(kpis.completionRate) : NOT_AVAILABLE },
  ];

  return (
    <section className="trainer-kpi-grid" aria-label="Key metrics" role="list">
      {tiles.map((tile) => (
        <div key={tile.key} className="trainer-kpi-card" role="listitem">
          <div className="trainer-kpi-card__head">
            <p className="trainer-kpi-card__label">{tile.label}</p>
            <span className="trainer-kpi-card__icon" aria-hidden="true">
              <StatusBadge tone="neutral">
                <Icon name={tile.icon} size={14} />
              </StatusBadge>
            </span>
          </div>
          <p className="trainer-kpi-card__value">{tile.value}</p>
        </div>
      ))}
    </section>
  );
}

ProgressKpis.propTypes = {
  kpis: PropTypes.object,
  error: PropTypes.string,
  onRetry: PropTypes.func,
};

ProgressKpis.defaultProps = { kpis: null, error: null, onRetry: () => {} };

/**
 * Leaderboard table. Every column maps 1:1 onto a field of the analytics
 * leaderboard payload; there is no derived or invented column.
 */
export function ProgressTable({ leaderboard, caption, selectable, selectedId, onSelect }) {
  if (leaderboard.length === 0) {
    return <TrainerEmptyState icon="trophy" title="No students match the selected filters." />;
  }

  return (
    <div className="trainer-table-wrapper">
      <table className="admin-table">
        <caption className="trainer-sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Student</th>
            <th scope="col">Solved</th>
            <th scope="col">Assigned</th>
            <th scope="col">Completion</th>
            <th scope="col">Days</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row) => {
            const isSelected = selectable && String(row.studentId) === String(selectedId);
            return (
              <tr key={row.studentId} data-selected={isSelected ? 'true' : undefined}>
                <td>{row.rank ?? NOT_AVAILABLE}</td>
                <th scope="row" className="trainer-table__row-head">
                  {selectable ? (
                    <button
                      type="button"
                      className="trainer-table__link"
                      aria-expanded={isSelected}
                      aria-controls="trainer-student-detail"
                      onClick={() => onSelect(row.studentId)}
                    >
                      {row.name || NOT_AVAILABLE}
                    </button>
                  ) : (
                    <span>{row.name || NOT_AVAILABLE}</span>
                  )}
                </th>
                <td>{formatCount(row.solvedProblems)}</td>
                <td>{formatCount(row.assignedProblems)}</td>
                <td>{formatPercent(row.completionPercentage)}</td>
                <td>{formatRatio(row.daysCompleted, row.totalDays)}</td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

ProgressTable.propTypes = {
  leaderboard: PropTypes.array.isRequired,
  caption: PropTypes.string.isRequired,
  selectable: PropTypes.bool,
  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelect: PropTypes.func,
};

ProgressTable.defaultProps = { selectable: false, selectedId: '', onSelect: () => {} };

/**
 * Per-student progress panel used by Monitoring, from
 * GET /api/trainer/analytics/student/:studentId.
 */
export function StudentDetailPanel({ studentId, studentName, detail, loading, error, onRetry }) {
  if (!studentId) {
    return (
      <div className="trainer-card">
        <p className="trainer-table__muted">
          Select a student to view their per-Day and per-Problem progress.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="trainer-card trainer-filter-bar">
        <Spinner size={18} />
        <span className="trainer-table__muted">Loading student progress…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trainer-card">
        <TrainerEmptyState
          role="alert"
          icon="alertTriangle"
          title="Couldn't load student progress"
          description={error}
        >
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Retry
          </button>
        </TrainerEmptyState>
      </div>
    );
  }

  if (!detail) return null;

  const { overall, days, problems } = detail;

  return (
    <div className="trainer-card">
      <h3 className="trainer-list-row__title">{studentName || 'Student'}</h3>

      <p className="trainer-table__muted" style={{ marginTop: 'var(--trainer-gap-sm)' }}>
        Overall {overall.solved} / {overall.total} ({formatPercent(overall.percentage)})
      </p>
      <div
        className="trainer-progress__track"
        role="progressbar"
        aria-valuenow={overall.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Overall progress ${overall.percentage}%`}
      >
        <span className="trainer-progress__fill" style={{ width: `${overall.percentage}%` }} />
      </div>

      <h4 className="trainer-metric-tile__label" style={{ marginTop: 'var(--trainer-gap-lg)' }}>
        By Day
      </h4>
      {days.length === 0 ? (
        <p className="trainer-table__muted">No problems are assigned to any day yet.</p>
      ) : (
        <ul className="trainer-list-rows">
          {days.map((day) => (
            <li key={day.topicId} className="trainer-list-row">
              <span className="trainer-list-row__body">
                <p className="trainer-list-row__title">{day.name}</p>
                <div className="trainer-progress">
                  <div className="trainer-progress__track">
                    <span className="trainer-progress__fill" style={{ width: `${day.percentage}%` }} />
                  </div>
                  <span className="trainer-progress__label">
                    {day.solved} / {day.total} · {formatPercent(day.percentage)}
                  </span>
                </div>
              </span>
              <span className="trainer-list-row__aside">
                <StatusBadge status={day.status} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="trainer-metric-tile__label" style={{ marginTop: 'var(--trainer-gap-lg)' }}>
        Problems
      </h4>
      {problems.length === 0 ? (
        <p className="trainer-table__muted">No problems are assigned yet.</p>
      ) : (
        <ul className="trainer-list-rows">
          {problems.map((problem) => (
            <li key={problem.problemId} className="trainer-list-row">
              <span className="trainer-list-row__body">
                <p className="trainer-list-row__title">{problem.title}</p>
                {problem.topicName ? (
                  <p className="trainer-list-row__meta">{problem.topicName}</p>
                ) : null}
              </span>
              <span className="trainer-list-row__aside">
                <StatusBadge status={problem.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

StudentDetailPanel.propTypes = {
  studentId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  studentName: PropTypes.string,
  detail: PropTypes.object,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onRetry: PropTypes.func,
};

StudentDetailPanel.defaultProps = {
  studentId: '',
  studentName: '',
  detail: null,
  loading: false,
  error: null,
  onRetry: () => {},
};

/**
 * Shared data hook for both pages: batches + the cascading analytics request.
 * Returns the filter state, the setters that implement the cascade rules, and
 * the loaded payload.
 */
export function useProgressAnalytics({ extraDeps = [], extraReset = () => {} } = {}) {
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState(null);

  const [batchId, setBatchId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [status, setStatus] = useState('ALL');

  const [collections, setCollections] = useState([]);
  const [topics, setTopics] = useState([]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const res = await getTrainerBatches();
      setBatches(res?.data?.data || []);
    } catch {
      setBatchesError('Unable to load batches.');
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const handleBatchChange = useCallback(
    (value) => {
      setBatchId(value);
      setCollectionId('');
      setTopics([]);
      setTopicId('');
      setStatus('ALL');
      extraReset();
    },
    [extraReset]
  );

  const handleCollectionChange = useCallback(
    (value) => {
      setCollectionId(value);
      setTopics([]);
      setTopicId('');
      setStatus('ALL');
      extraReset();
    },
    [extraReset]
  );

  const handleTopicChange = useCallback(
    (value) => {
      setTopicId(value);
      setStatus('ALL');
      extraReset();
    },
    [extraReset]
  );

  const handleStatusChange = useCallback(
    (value) => {
      setStatus(value);
      extraReset();
    },
    [extraReset]
  );

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    getTrainerCollections()
      .then((res) => {
        if (!cancelled) setCollections(res?.data?.data || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    getTrainerCollectionTopics(collectionId)
      .then((res) => {
        if (!cancelled) setTopics(res?.data?.data || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  useEffect(() => {
    if (!batchId) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTrainerAnalytics({
      batchId,
      collectionId: collectionId || undefined,
      topicId: topicId || undefined,
      status: status !== 'ALL' ? status : undefined,
    })
      .then((res) => {
        if (!cancelled) setData(res?.data?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || 'Unable to load analytics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, collectionId, topicId, status, refreshKey, ...extraDeps]);

  return {
    batches,
    batchesLoading,
    batchesError,
    reloadBatches: loadBatches,
    batchId,
    collectionId,
    topicId,
    status,
    collections,
    topics,
    data,
    loading,
    error,
    handleBatchChange,
    handleCollectionChange,
    handleTopicChange,
    handleStatusChange,
    reload: () => setRefreshKey((k) => k + 1),
  };
}
