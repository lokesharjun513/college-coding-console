import React, { useEffect, useState } from 'react';
import {
  getTrainerBatches,
  getTrainerCollections,
  getTrainerCollectionTopics,
  getTrainerAnalytics,
} from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import './Analytics.css';

// Trainer Analytics: authoritative KPIs + leaderboard from /api/trainer/analytics.
// Solved = ACCEPTED submissions only; ordering completion % DESC -> solved DESC -> name ASC.
// Filters cascade Batch -> Training -> Day -> Status; a parent change clears its children.
export default function Analytics() {
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
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getTrainerBatches()
      .then(res => setBatches(res.data?.data || []))
      .catch(() => setBatchesError('Unable to load batches.'))
      .finally(() => setBatchesLoading(false));
  }, []);

  // Batch change clears Training/Day/Status
  const handleBatchChange = (e) => {
    setBatchId(e.target.value);
    setCollectionId('');
    setTopics([]);
    setTopicId('');
    setStatus('ALL');
  };

  // Training change clears Day/Status
  const handleCollectionChange = (e) => {
    setCollectionId(e.target.value);
    setTopics([]);
    setTopicId('');
    setStatus('ALL');
  };

  const handleTopicChange = (e) => {
    setTopicId(e.target.value);
    setStatus('ALL');
  };

  // Trainings are shared metadata; selection scopes the leaderboard
  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    getTrainerCollections()
      .then(res => { if (!cancelled) setCollections(res.data?.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [batchId]);

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    getTrainerCollectionTopics(collectionId)
      .then(res => { if (!cancelled) setTopics(res.data?.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [collectionId]);

  // Fetch analytics whenever filters change
  useEffect(() => {
    if (!batchId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    getTrainerAnalytics({
      batchId,
      collectionId: collectionId || undefined,
      topicId: topicId || undefined,
      status: status !== 'ALL' ? status : undefined,
    })
      .then(res => { if (!cancelled) setData(res.data?.data || null); })
      .catch(() => { if (!cancelled) setAnalyticsError('Unable to load analytics.'); })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [batchId, collectionId, topicId, status, refreshKey]);

  const kpis = data?.kpis;
  const leaderboard = data?.leaderboard || [];

  const statusBadgeVariant = (s) =>
    s === 'COMPLETED' ? 'success' : s === 'IN_PROGRESS' ? 'info' : s === 'NOT_STARTED' ? 'neutral' : 'warning';

  return (
    <div>
      <PageHeader
        title="Analytics"
        breadcrumb={<span>Trainer / Analytics</span>}
        description="Batch progress based on accepted submissions. A problem counts as solved only when a submission is Accepted."
      />

      {/* Filters */}
      <div className="an-filters">
        <div className="an-field">
          <label htmlFor="an-batch" className="an-label">Batch</label>
          {batchesLoading ? (
            <Spinner />
          ) : batchesError ? (
            <div className="an-error" role="alert">{batchesError}</div>
          ) : batches.length === 0 ? (
            <EmptyState message="No batches assigned." />
          ) : (
            <select id="an-batch" className="an-select" value={batchId} onChange={handleBatchChange}>
              <option value="">Select a batch...</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>
              ))}
            </select>
          )}
        </div>

        {batchId && (
          <>
            <div className="an-field">
              <label htmlFor="an-training" className="an-label">Training</label>
              <select id="an-training" className="an-select" value={collectionId} onChange={handleCollectionChange}>
                <option value="">All Trainings</option>
                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="an-field">
              <label htmlFor="an-day" className="an-label">Day</label>
              <select id="an-day" className="an-select" value={topicId} onChange={handleTopicChange} disabled={!collectionId}>
                <option value="">All Days</option>
                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="an-field">
              <label htmlFor="an-status" className="an-label">Status</label>
              <select id="an-status" className="an-select" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* KPI cards */}
      {batchId && (
        <section aria-labelledby="an-kpis-heading" className="an-section">
          <h2 id="an-kpis-heading" className="an-heading">Key Metrics</h2>
          {analyticsLoading && !data ? (
            <div className="an-kpi-grid">
              <StatCard label="Active Students" value="" loading />
              <StatCard label="Total Assigned Problems" value="" loading />
              <StatCard label="Solved Assignments" value="" loading />
              <StatCard label="Completion Rate" value="" loading />
            </div>
          ) : analyticsError ? (
            <div className="an-error" role="alert">
              {analyticsError}
              <button type="button" className="an-retry" onClick={() => setRefreshKey(k => k + 1)}>Retry</button>
            </div>
          ) : (
            <div className="an-kpi-grid">
              <StatCard label="Active Students" value={kpis ? kpis.activeStudents : 0} />
              <StatCard label="Total Assigned Problems" value={kpis ? kpis.assignedProblems : 0} />
              <StatCard label="Solved Assignments" value={kpis ? kpis.solvedAssignments : 0} />
              <StatCard label="Completion Rate" value={kpis ? `${kpis.completionRate}%` : '0%'} />
            </div>
          )}
        </section>
      )}

      {/* Leaderboard */}
      {batchId && (
        <section aria-labelledby="an-lb-heading" className="an-section">
          <h2 id="an-lb-heading" className="an-heading">Leaderboard</h2>
          {analyticsLoading && !data ? (
            <Spinner />
          ) : analyticsError ? (
            <div className="an-error" role="alert">{analyticsError}</div>
          ) : leaderboard.length === 0 ? (
            <EmptyState message="No students match the selected filters." />
          ) : (
            <div className="an-table-wrap">
              <table className="an-table">
                <caption className="an-sr-only">Student progress ranked by completion percentage</caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Student</th>
                    <th scope="col">Solved</th>
                    <th scope="col">Assigned</th>
                    <th scope="col">Completion %</th>
                    <th scope="col">Days Completed</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map(row => (
                    <tr key={row.studentId}>
                      <td>{row.rank}</td>
                      <td>{row.name}</td>
                      <td>{row.solvedProblems}</td>
                      <td>{row.assignedProblems}</td>
                      <td>{row.completionPercentage}%</td>
                      <td>{row.daysCompleted} / {row.totalDays}</td>
                      <td><Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
