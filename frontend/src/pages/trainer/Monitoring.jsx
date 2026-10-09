import React, { useEffect, useState } from 'react';
import {
  getTrainerBatches,
  getTrainerCollections,
  getTrainerCollectionTopics,
  getTrainerAnalytics,
  getTrainerStudentDetail,
} from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import './Monitoring.css';

// Trainer Monitoring: batch -> Training -> Day -> students. Monitoring only —
// all metrics come from /api/trainer/analytics (and its student detail route).
// Solved = ACCEPTED submissions only; statuses are NO_PROBLEMS/NOT_STARTED/IN_PROGRESS/COMPLETED.
export default function Monitoring() {
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

  // Selected student detail
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentDetail, setStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailKey, setDetailKey] = useState(0);

  const loadBatches = () => {
    setBatchesLoading(true);
    setBatchesError(null);
    getTrainerBatches()
      .then(res => setBatches(res.data?.data || []))
      .catch(() => setBatchesError('Unable to load batches.'))
      .finally(() => setBatchesLoading(false));
  };

  useEffect(loadBatches, []);

  // Batch change clears Training/Day/Status (and the selected student)
  const handleBatchChange = (e) => {
    setBatchId(e.target.value);
    setCollectionId('');
    setTopics([]);
    setTopicId('');
    setStatus('ALL');
    setSelectedStudentId('');
  };

  // Training change clears Day/Status
  const handleCollectionChange = (e) => {
    setCollectionId(e.target.value);
    setTopics([]);
    setTopicId('');
    setStatus('ALL');
    setSelectedStudentId('');
  };

  const handleTopicChange = (e) => {
    setTopicId(e.target.value);
    setStatus('ALL');
    setSelectedStudentId('');
  };

  const handleStatusChange = (e) => {
    setStatus(e.target.value);
    setSelectedStudentId('');
  };

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

  // Fetch monitoring overview whenever filters change
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
      .catch(() => { if (!cancelled) setAnalyticsError('Unable to load monitoring data.'); })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [batchId, collectionId, topicId, status, refreshKey]);

  // Fetch the selected student's per-Day/per-Problem detail
  useEffect(() => {
    if (!batchId || !selectedStudentId) {
      setStudentDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getTrainerStudentDetail(selectedStudentId, {
      batchId,
      collectionId: collectionId || undefined,
      topicId: topicId || undefined,
    })
      .then(res => { if (!cancelled) setStudentDetail(res.data?.data || null); })
      .catch(() => { if (!cancelled) setDetailError('Unable to load student progress.'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [batchId, collectionId, topicId, selectedStudentId, detailKey]);

  const kpis = data?.kpis;
  const leaderboard = data?.leaderboard || [];
  const selectedRow = leaderboard.find(r => r.studentId === selectedStudentId);

  const statusBadgeVariant = (s) =>
    s === 'COMPLETED' ? 'success' : s === 'IN_PROGRESS' ? 'info' : s === 'NOT_STARTED' ? 'neutral' : 'warning';

  const problemBadgeVariant = (s) =>
    s === 'SOLVED' ? 'success' : s === 'ATTEMPTED' ? 'warning' : 'neutral';

  return (
    <div>
      <PageHeader
        title="Monitoring"
        breadcrumb={<span>Trainer / Monitoring</span>}
        description="Track student progress through each Training and Day. A problem counts as solved only when a submission is Accepted."
      />

      {/* Filters — cascade: Batch clears all; Training clears Day/Status; Day clears Status */}
      <div className="an-filters">
        <div className="an-field">
          <label htmlFor="mo-batch" className="an-label">Batch</label>
          {batchesLoading ? (
            <Spinner />
          ) : batchesError ? (
            <div className="an-error" role="alert">
              {batchesError}
              <button type="button" className="an-retry" onClick={loadBatches}>Retry</button>
            </div>
          ) : batches.length === 0 ? (
            <EmptyState message="No batches assigned." />
          ) : (
            <select id="mo-batch" className="an-select" value={batchId} onChange={handleBatchChange}>
              <option value="">Select a batch…</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>
              ))}
            </select>
          )}
        </div>

        {batchId && (
          <>
            <div className="an-field">
              <label htmlFor="mo-training" className="an-label">Training</label>
              <select id="mo-training" className="an-select" value={collectionId} onChange={handleCollectionChange}>
                <option value="">All Trainings</option>
                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="an-field">
              <label htmlFor="mo-day" className="an-label">Day</label>
              <select id="mo-day" className="an-select" value={topicId} onChange={handleTopicChange} disabled={!collectionId}>
                <option value="">All Days</option>
                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="an-field">
              <label htmlFor="mo-status" className="an-label">Status</label>
              <select id="mo-status" className="an-select" value={status} onChange={handleStatusChange}>
                <option value="ALL">All Statuses</option>
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </>
        )}
      </div>

      {batchId && (
        <div className="mo-layout">
          <div>
            {/* KPI cards */}
            <section aria-labelledby="mo-kpis-heading" className="an-section">
              <h2 id="mo-kpis-heading" className="an-heading">Key Metrics</h2>
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

            {/* Student progress table */}
            <section aria-labelledby="mo-students-heading" className="an-section">
              <h2 id="mo-students-heading" className="an-heading">Student Progress</h2>
              {analyticsLoading && !data ? (
                <Spinner />
              ) : analyticsError ? (
                <div className="an-error" role="alert">{analyticsError}</div>
              ) : leaderboard.length === 0 ? (
                <EmptyState message="No students match the selected filters." />
              ) : (
                <div className="an-table-wrap">
                  <table className="an-table">
                    <caption className="an-sr-only">Student progress by completion percentage</caption>
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
                        <tr key={row.studentId} aria-selected={row.studentId === selectedStudentId}>
                          <td>{row.rank}</td>
                          <td>
                            <button
                              type="button"
                              className="mo-student-btn"
                              onClick={() => setDetailKey(k => k + 1) || setSelectedStudentId(row.studentId)}
                              aria-expanded={row.studentId === selectedStudentId}
                              aria-controls="mo-student-detail"
                            >
                              {row.name}
                            </button>
                          </td>
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
          </div>

          {/* Selected student detail panel */}
          <aside id="mo-student-detail" aria-label="Student progress detail">
            {!selectedStudentId ? (
              <div className="mo-panel">
                <p className="an-label">Select a student to view their per-Day and per-Problem progress.</p>
              </div>
            ) : detailLoading ? (
              <div className="mo-panel"><Spinner /></div>
            ) : detailError ? (
              <div className="mo-panel">
                <div className="an-error" role="alert">
                  {detailError}
                  <button type="button" className="an-retry" onClick={() => setDetailKey(k => k + 1)}>Retry</button>
                </div>
              </div>
            ) : studentDetail ? (
              <div className="mo-panel">
                <h3>{selectedRow ? selectedRow.name : 'Student'}</h3>
                <div className="mo-day-row">
                  <span>Overall</span>
                  <span className="mo-count">
                    {studentDetail.overall.solved} / {studentDetail.overall.total} ({studentDetail.overall.percentage}%)
                  </span>
                </div>
                <div className="mo-progress" role="img" aria-label={`Overall progress ${studentDetail.overall.percentage}%`}>
                  <span style={{ width: `${studentDetail.overall.percentage}%` }} />
                </div>

                <h3>By Day</h3>
                {studentDetail.days.length === 0 ? (
                  <EmptyState message="No problems assigned to any Day yet." />
                ) : (
                  studentDetail.days.map(d => (
                    <div key={d.topicId} className="mo-day-row">
                      <div className="mo-row-main">
                        <span>{d.name}</span>
                        <div className="mo-progress">
                          <span style={{ width: `${d.percentage}%` }} />
                        </div>
                      </div>
                      <span className="mo-count">{d.solved} / {d.total}</span>
                      <Badge variant={statusBadgeVariant(d.status)}>{d.status}</Badge>
                    </div>
                  ))
                )}

                <h3>Problems</h3>
                {studentDetail.problems.length === 0 ? (
                  <EmptyState message="No problems assigned yet." />
                ) : (
                  studentDetail.problems.map(p => (
                    <div key={p.problemId} className="mo-problem-row">
                      <div className="mo-row-main">
                        <span>{p.title}</span>
                        {p.topicName && <span className="mo-row-meta">{p.topicName}</span>}
                      </div>
                      <Badge variant={problemBadgeVariant(p.status)}>{p.status}</Badge>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
