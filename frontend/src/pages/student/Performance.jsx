import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStudentPerformance } from '../../api/student';
import './Performance.css';

const EMPTY_METRICS = { assigned: 0, solved: 0, attempted: 0, notStarted: 0, completionPercentage: 0 };

function Kpi({ label, value, detail }) {
  return <article className="performance-kpi"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function ProgressCard({ data }) {
  const { assigned, solved, completionPercentage } = data.metrics;
  return <section className="performance-card performance-progress-card"><div className="performance-card__heading"><div><span className="performance-eyebrow">Overall progress</span><h2>{data.scope === 'BATCH' ? 'Batch Progress' : 'Global Progress'}</h2></div><strong>{completionPercentage}%</strong></div><div className="performance-progress" role="progressbar" aria-valuenow={completionPercentage} aria-valuemin="0" aria-valuemax="100" aria-label={`${completionPercentage}% completion`}><span style={{ width: `${completionPercentage}%` }} /></div><p>{solved} of {assigned} problems solved</p></section>;
}

function Breakdown({ data }) {
  if (!data.breakdowns?.difficulty?.length) return null;
  return <section className="performance-card"><div className="performance-card__heading"><div><span className="performance-eyebrow">Distribution</span><h2>Difficulty performance</h2></div></div><div className="performance-breakdown">{data.breakdowns.difficulty.map(item => <div className="performance-breakdown__row" key={item.label}><div><strong>{item.label}</strong><small>{item.solved} solved · {item.attempted} attempted · {item.notStarted} not started</small></div><span>{item.completionPercentage}%</span><div className="performance-breakdown__track"><i style={{ width: `${item.completionPercentage}%` }} /></div></div>)}</div></section>;
}

function Activity({ data }) {
  if (!data.recentActivity?.length) return null;
  return <section className="performance-card"><div className="performance-card__heading"><div><span className="performance-eyebrow">Submission history</span><h2>Recent activity</h2></div></div><div className="performance-activity">{data.recentActivity.map(item => <Link to={`/student/problems/${item.problemId}`} key={item.id}><span className={item.verdict === 'ACCEPTED' ? 'is-solved' : 'is-attempted'}>{item.verdict === 'ACCEPTED' ? '✓' : '•'}</span><div><strong>{item.title}</strong><small>{item.verdict.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleString()}</small></div><b>→</b></Link>)}</div></section>;
}

export default function Performance() {
  const [scope, setScope] = useState('GLOBAL');
  const [batchId, setBatchId] = useState(null);
  const [activeBatches, setActiveBatches] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (nextScope = scope, nextBatchId = batchId) => {
    setLoading(true); setError(null); setData(null);
    try {
      const response = await getStudentPerformance({ scope: nextScope, ...(nextScope === 'BATCH' && nextBatchId ? { batchId: nextBatchId } : {}) });
      const result = response.data?.data;
      setData(result);
      setActiveBatches(result?.activeBatches || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load performance data.');
      if (err?.response?.data?.data?.activeBatches) setActiveBatches(err.response.data.data.activeBatches);
    } finally { setLoading(false); }
  }, [batchId, scope]);

  useEffect(() => { load(scope, batchId); }, [load, scope, batchId]);

  const changeScope = (nextScope) => {
    if (nextScope === scope) return;
    setScope(nextScope);
    if (nextScope === 'GLOBAL') setBatchId(null);
    else if (!batchId && activeBatches[0]?.id) setBatchId(activeBatches[0].id);
  };

  const changeBatch = (event) => {
    const nextId = event.target.value;
    setBatchId(nextId);
  };

  const enrolled = activeBatches.length > 0;
  const metrics = data?.metrics || EMPTY_METRICS;
  const empty = data && metrics.assigned === 0;

  return <main className="performance-page">
    <header className="performance-header"><div><span className="performance-eyebrow">Student analytics</span><h1>Performance</h1><p>Understand your progress without mixing batch learning and global practice.</p></div></header>
    <div className="performance-switcher" role="tablist" aria-label="Performance scope">
      {enrolled && <button type="button" role="tab" aria-selected={scope === 'BATCH'} className={scope === 'BATCH' ? 'is-active' : ''} onClick={() => changeScope('BATCH')}>Batch</button>}
      <button type="button" role="tab" aria-selected={scope === 'GLOBAL'} className={scope === 'GLOBAL' ? 'is-active' : ''} onClick={() => changeScope('GLOBAL')}>Global</button>
    </div>
    {scope === 'BATCH' && enrolled && activeBatches.length > 1 && <label className="performance-batch-select">Batch<select value={batchId || activeBatches[0].id} onChange={changeBatch}>{activeBatches.map(batch => <option value={batch.id} key={batch.id}>{batch.name}{batch.code ? ` · ${batch.code}` : ''}</option>)}</select></label>}
    {loading && <div className="performance-loading" role="status">Loading {scope === 'BATCH' ? 'batch' : 'global'} performance…</div>}
    {!loading && error && <div className="performance-error" role="alert"><p>{error}</p><button type="button" onClick={() => load(scope, batchId)}>Retry</button></div>}
    {!loading && !error && data && <>
      <section className="performance-context"><div><span className="performance-eyebrow">{scope === 'BATCH' ? 'Assigned learning' : 'Independent practice'}</span><h2>{scope === 'BATCH' ? data.batch?.name : 'Global Performance'}</h2><p>{scope === 'BATCH' ? 'Problems assigned to your active batch.' : 'Your performance across published global problems.'}</p></div><span className="performance-scope-pill">{scope}</span></section>
      {empty ? <section className="performance-empty"><h2>No {scope === 'BATCH' ? 'batch' : 'global'} problems available yet.</h2><p>Performance will appear here once problems are available.</p>{scope === 'GLOBAL' && <Link to="/student/practice">Practice Global →</Link>}</section> : <>
        <section className="performance-kpis" aria-label={`${scope} performance summary`}><Kpi label={scope === 'BATCH' ? 'Assigned Problems' : 'Global Problems'} value={metrics.assigned} detail="Available in this scope" /><Kpi label="Solved" value={metrics.solved} detail="Accepted submissions" /><Kpi label="Completion" value={`${metrics.completionPercentage}%`} detail={`${metrics.solved} of ${metrics.assigned} solved`} /><Kpi label="Attempted" value={metrics.attempted} detail={`${metrics.notStarted} not started`} /></section>
        <div className="performance-grid"><ProgressCard data={data} /><Breakdown data={data} /><Activity data={data} /></div>
      </>}
    </>}
  </main>;
}
