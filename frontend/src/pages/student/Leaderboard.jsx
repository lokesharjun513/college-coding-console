import React, { useCallback, useEffect, useState } from 'react';
import { getStudentLeaderboard } from '../../api/student';
import './Leaderboard.css';

const EMPTY = { leaderboard: [], currentUserRank: null, metrics: { assignedProblems: 0, eligibleStudents: 0 } };

function ScopeTabs({ scope, onChange, hasBatch }) {
  return <div className="leaderboard-tabs" role="tablist" aria-label="Leaderboard scope">
    {hasBatch && <button type="button" role="tab" aria-selected={scope === 'BATCH'} className={scope === 'BATCH' ? 'is-active' : ''} onClick={() => onChange('BATCH')}>Batch</button>}
    <button type="button" role="tab" aria-selected={scope === 'GLOBAL'} className={scope === 'GLOBAL' ? 'is-active' : ''} onClick={() => onChange('GLOBAL')}>Global</button>
  </div>;
}

function RankCell({ row }) {
  return <td className="leaderboard-rank">{row.rank}{row.isCurrentUser && <span className="leaderboard-you">You</span>}</td>;
}

function Progress({ row }) {
  return <div className="leaderboard-progress"><div className="leaderboard-progress__value"><strong>{row.completionPercentage}%</strong><span>{row.solved} / {row.assigned} solved</span></div><div className="leaderboard-progress__track" role="progressbar" aria-valuenow={row.completionPercentage} aria-valuemin="0" aria-valuemax="100" aria-label={`${row.name}: ${row.completionPercentage}% completion`}><i style={{ width: `${row.completionPercentage}%` }} /></div></div>;
}

function Skeleton() {
  return <div className="leaderboard-skeleton" role="status" aria-label="Loading leaderboard">{[1, 2, 3, 4, 5].map(item => <div key={item} />)}</div>;
}

function DesktopTable({ rows }) {
  return <div className="leaderboard-table-wrap"><table className="leaderboard-table"><caption className="leaderboard-sr-only">Students ranked by completion percentage, then solved problems</caption><thead><tr><th scope="col">Rank</th><th scope="col">Student</th><th scope="col">Solved</th><th scope="col">Assigned</th><th scope="col">Completion</th></tr></thead><tbody>{rows.map(row => <tr className={row.isCurrentUser ? 'is-current' : ''} key={row.studentId}><RankCell row={row} /><th scope="row">{row.name}</th><td>{row.solved}</td><td>{row.assigned}</td><td><Progress row={row} /></td></tr>)}</tbody></table></div>;
}

function MobileRows({ rows }) {
  return <div className="leaderboard-mobile-list">{rows.map(row => <article className={`leaderboard-mobile-card ${row.isCurrentUser ? 'is-current' : ''}`} key={row.studentId}><div className="leaderboard-mobile-card__heading"><strong>#{row.rank}</strong><h3>{row.name}</h3>{row.isCurrentUser && <span className="leaderboard-you">You</span>}</div><div className="leaderboard-mobile-card__stats"><span><b>{row.solved}</b> solved</span><span><b>{row.assigned}</b> assigned</span></div><Progress row={row} /></article>)}</div>;
}

export default function Leaderboard() {
  const [scope, setScope] = useState('GLOBAL');
  const [batchId, setBatchId] = useState(null);
  const [activeBatches, setActiveBatches] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (nextScope, nextBatchId) => {
    setLoading(true); setError(null); setData(null);
    try {
      const response = await getStudentLeaderboard({ scope: nextScope, ...(nextScope === 'BATCH' && nextBatchId ? { batchId: nextBatchId } : {}) });
      const result = response.data?.data || EMPTY;
      setData(result);
      setActiveBatches(result.activeBatches || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Unable to load leaderboard.');
      if (requestError?.response?.data?.data?.activeBatches) setActiveBatches(requestError.response.data.data.activeBatches);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(scope, batchId); }, [load, scope, batchId]);

  const changeScope = (nextScope) => {
    setScope(nextScope);
    if (nextScope === 'BATCH' && !batchId) setBatchId(activeBatches[0]?.id || null);
    if (nextScope === 'GLOBAL') setBatchId(null);
  };

  const rows = data?.leaderboard || [];
  const hasBatch = activeBatches.length > 0;
  const empty = data && rows.length === 0;

  return <main className="leaderboard-page">
    <header className="leaderboard-header"><span className="leaderboard-eyebrow">Academic progress</span><h1>Leaderboard</h1><p>Compare your problem-solving progress with other students.</p></header>
    <ScopeTabs scope={scope} onChange={changeScope} hasBatch={hasBatch} />
    {scope === 'BATCH' && hasBatch && <label className="leaderboard-batch-select">Batch<select value={batchId || activeBatches[0].id} onChange={event => setBatchId(event.target.value)}>{activeBatches.map(batch => <option value={batch.id} key={batch.id}>{batch.name}{batch.code ? ` · ${batch.code}` : ''}</option>)}</select></label>}
    {loading && <Skeleton />}
    {!loading && error && <div className="leaderboard-message" role="alert" aria-live="polite"><p>{error}</p><button type="button" onClick={() => load(scope, batchId)}>Retry</button></div>}
    {!loading && !error && data && <>
      <section className="leaderboard-context"><div><span className="leaderboard-eyebrow">{scope === 'BATCH' ? 'Selected batch' : 'All active students'}</span><h2>{scope === 'BATCH' ? data.batch?.name : 'Global Leaderboard'}</h2><p>{scope === 'BATCH' ? 'Only active members of this batch are included.' : 'Published global problems across the platform.'}</p></div><div className="leaderboard-context__summary"><strong>{data.metrics.assignedProblems}</strong><span>assigned problems</span></div></section>
      {empty ? <section className="leaderboard-message"><h2>{scope === 'BATCH' ? 'No active batch leaderboard is available.' : 'No global leaderboard data is available yet.'}</h2><p>{data.metrics.assignedProblems === 0 ? 'There are no published problems in this scope yet.' : 'There are no eligible students to display.'}</p></section> : <section className="leaderboard-card" aria-labelledby="leaderboard-table-heading"><div className="leaderboard-card__heading"><div><span className="leaderboard-eyebrow">{scope === 'BATCH' ? 'Batch ranking' : 'Global ranking'}</span><h2 id="leaderboard-table-heading">Progress rankings</h2></div>{data.currentUserRank && <span className="leaderboard-your-rank">Your rank <strong>#{data.currentUserRank}</strong></span>}</div><DesktopTable rows={rows} /><MobileRows rows={rows} /></section>}
    </>}
  </main>;
}
