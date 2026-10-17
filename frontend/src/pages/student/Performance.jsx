// frontend/src/pages/student/Performance.jsx
//
// Stats — /student/performance. The fifth (and last) Student destination.
//
// The endpoint already scopes correctly: `GLOBAL` reports published GLOBAL
// problems, `BATCH` reports the published, available problems of ONE batch the
// student is actively enrolled in, and a `batchId` the student is not a member
// of is refused server-side. This page therefore never resolves membership, a
// batch or a submission itself — it renders what the response says.
//
// Everything on screen comes from the payload. Counts are never recomputed here,
// and a failed request never becomes a row of zeros.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Target } from 'lucide-react';
import { getStudentPerformance } from '../../api/student';
import './Performance.css';

/** The scope this page opens on. Global needs no membership. */
const DEFAULT_SCOPE = 'GLOBAL';

/**
 * A missing metric must read as "not known", not as a confident zero. These are
 * the fallbacks used only until the first successful response arrives.
 */
const PENDING_METRICS = {
  assigned: 0,
  solved: 0,
  attempted: 0,
  notStarted: 0,
  completionPercentage: 0,
};

const verdictLabel = (verdict) =>
  (verdict || 'unknown').charAt(0).toUpperCase() + (verdict || 'unknown').slice(1).toLowerCase().replace(/_/g, ' ');

const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

function Kpi({ label, value, detail }) {
  return (
    <article className="pf-kpi">
      <span className="pf-kpi__label">{label}</span>
      <strong className="pf-kpi__value">{value}</strong>
      {detail ? <small className="pf-kpi__detail">{detail}</small> : null}
    </article>
  );
}

function ProgressCard({ scopeLabel, metrics }) {
  const { assigned, solved, completionPercentage } = metrics;
  return (
    <section className="pf-card">
      <div className="pf-card__heading">
        <div>
          <span className="pf-eyebrow">Overall progress</span>
          <h2>{scopeLabel}</h2>
        </div>
        <strong className="pf-progress__value">{completionPercentage}%</strong>
      </div>
      <div
        className="pf-progress"
        role="progressbar"
        aria-label={`${scopeLabel} completion`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completionPercentage}
        aria-valuetext={`${solved} of ${assigned} problems solved`}
      >
        <span style={{ width: `${completionPercentage}%` }} />
      </div>
      <p className="pf-card__caption">{solved} of {assigned} problems solved</p>
    </section>
  );
}

function DifficultyBreakdown({ rows }) {
  if (!rows?.length) return null;
  return (
    <section className="pf-card">
      <div className="pf-card__heading">
        <div>
          <span className="pf-eyebrow">Distribution</span>
          <h2>Difficulty performance</h2>
        </div>
      </div>
      <div className="pf-breakdown">
        {rows.map((item) => (
          <div className="pf-breakdown__row" key={item.label}>
            <div className="pf-breakdown__head">
              <strong>{item.label}</strong>
              <span>{item.completionPercentage}%</span>
            </div>
            <small className="pf-breakdown__meta">
              {item.solved} solved · {item.attempted} attempted · {item.notStarted} not started
            </small>
            <div className="pf-breakdown__track">
              <i style={{ width: `${item.completionPercentage}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentActivity({ items }) {
  if (!items?.length) return null;
  return (
    <section className="pf-card">
      <div className="pf-card__heading">
        <div>
          <span className="pf-eyebrow">Submission history</span>
          <h2>Recent activity</h2>
        </div>
      </div>
      <ul className="pf-activity">
        {items.map((item) => {
          const accepted = item.verdict === 'ACCEPTED';
          // A submission whose problem document is gone has no route to open;
          // it is shown as static text rather than as a link to nowhere.
          const body = (
            <>
              <span className={`pf-activity__mark${accepted ? ' is-solved' : ' is-attempted'}`} aria-hidden="true">
                {accepted ? '✓' : '•'}
              </span>
              <span className="pf-activity__body">
                <strong>{item.title || 'Untitled problem'}</strong>
                <small>
                  {verdictLabel(item.verdict)}
                  {formatWhen(item.createdAt) ? ` · ${formatWhen(item.createdAt)}` : ''}
                </small>
              </span>
            </>
          );
          return (
            <li className="pf-activity__item" key={item.id}>
              {item.problemId ? (
                <Link className="pf-activity__link" to={`/student/problems/${item.problemId}`}>
                  {body}
                </Link>
              ) : (
                <span className="pf-activity__link is-static">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Performance() {
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [batchId, setBatchId] = useState(null);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [activeBatches, setActiveBatches] = useState([]);

  // Supersession guard. The flag is re-armed in the effect BODY: React 18
  // StrictMode unmounts and remounts components in development, and a
  // cleanup-only flag stays false and silently discards every response.
  const requestId = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async (targetScope = scope, targetBatchId = batchId) => {
    requestId.current += 1;
    const ticket = requestId.current;
    setStatus((current) => (current === 'ready' ? 'refreshing' : 'loading'));
    setError(null);
    try {
      const response = await getStudentPerformance({
        scope: targetScope,
        ...(targetScope === 'BATCH' && targetBatchId ? { batchId: targetBatchId } : {}),
      });
      if (!mounted.current || ticket !== requestId.current) return;
      const result = response.data?.data || null;
      setData(result);
      // The batch list arrives with every response, so switching scope never
      // needs a second request to learn what the student is enrolled in.
      setActiveBatches(Array.isArray(result?.activeBatches) ? result.activeBatches : []);
      setStatus('ready');
    } catch (err) {
      if (!mounted.current || ticket !== requestId.current) return;
      setError(err?.response?.data?.message || 'Unable to load performance data.');
      // A 403 that carries the batch list (BATCH_SELECTION_REQUIRED) still
      // tells us what the student is enrolled in.
      const carried = err?.response?.data?.data?.activeBatches;
      if (Array.isArray(carried)) setActiveBatches(carried);
      setStatus('error');
    }
  }, [scope, batchId]);

  useEffect(() => {
    load(scope, batchId);
  }, [load, scope, batchId]);

  const changeScope = useCallback((nextScope) => {
    if (nextScope === scope) return;
    setScope(nextScope);
    // A global report has no batch, and switching batch must not carry a stale
    // selection into the global request.
    if (nextScope === 'GLOBAL') setBatchId(null);
  }, [scope]);

  const enrolled = activeBatches.length > 0;
  const metrics = data?.metrics || PENDING_METRICS;
  const hasData = Boolean(data);
  const empty = hasData && metrics.assigned === 0;
  const isBatch = scope === 'BATCH';

  if (status === 'loading' && !hasData) {
    return (
      <main className="pf-page">
        <div className="pf-inner" aria-busy="true">
          <p className="student-visually-hidden" role="status">Loading your performance…</p>
          <div className="pf-skeleton pf-skeleton--title" aria-hidden="true" />
          <div className="pf-skeleton pf-skeleton--kpi" aria-hidden="true" />
          <div className="pf-skeleton pf-skeleton--card" aria-hidden="true" />
        </div>
      </main>
    );
  }

  return (
    <main className="pf-page">
      <div className="pf-inner">
        <nav className="student-breadcrumb" aria-label="Breadcrumb">
          <Link className="student-breadcrumb__link" to="/student">Student</Link>
          <span className="student-breadcrumb__separator" aria-hidden="true">/</span>
          <span className="student-breadcrumb__current" aria-current="page">Stats</span>
        </nav>

        <header className="pf-header">
          <div className="pf-header__intro">
            <h1 className="pf-header__title">Performance</h1>
            <p className="pf-header__subtitle">
              See how far you have got, without mixing your batch&apos;s assigned work with your
              independent global practice.
            </p>
          </div>

          <div className="pf-header__controls">
            {/* A toggle group rather than a tablist: these two buttons swap one
                panel's contents, and a tab pattern without arrow-key handling and a
                matching tabpanel would only be half-implemented. */}
            <div className="pf-switcher" role="group" aria-label="Performance scope">
              {enrolled ? (
                <button
                  type="button"
                  className={isBatch ? 'is-active' : ''}
                  aria-pressed={isBatch}
                  onClick={() => changeScope('BATCH')}
                >
                  Batch
                </button>
              ) : null}
              <button
                type="button"
                className={!isBatch ? 'is-active' : ''}
                aria-pressed={!isBatch}
                onClick={() => changeScope('GLOBAL')}
              >
                Global
              </button>
            </div>

            {isBatch && enrolled && activeBatches.length > 1 ? (
              <label className="pf-batch-select" htmlFor="pf-batch">
                Batch
                <select
                  id="pf-batch"
                  value={batchId || activeBatches[0].id}
                  onChange={(event) => setBatchId(event.target.value)}
                >
                  {activeBatches.map((batch) => (
                    <option value={batch.id} key={batch.id}>
                      {batch.name}{batch.code ? ` · ${batch.code}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </header>

        {status === 'error' ? (
          <section className="pf-state pf-state--error" role="alert">
            <p className="pf-state__title">We could not load your performance.</p>
            <p className="pf-state__body">{error}</p>
            <button type="button" className="pf-button pf-button--primary" onClick={() => load(scope, batchId)}>
              <RotateCcw size={14} aria-hidden="true" />
              Try again
            </button>
          </section>
        ) : null}

        {status !== 'error' && !hasData ? null : (
          <section
            className="pf-context"
            aria-label={`${scope} performance`}
            aria-busy={status === 'refreshing'}
          >
            <div>
              <span className="pf-eyebrow">{isBatch ? 'Assigned learning' : 'Independent practice'}</span>
              <h2>{isBatch ? (data?.batch?.name || 'Batch') : 'Global performance'}</h2>
              <p>
                {isBatch
                  ? 'Published problems assigned to this batch.'
                  : 'Your progress across published global problems.'}
              </p>
            </div>
            <span className="pf-scope-pill">{isBatch ? 'Batch' : 'Global'}</span>
          </section>
        )}

        {status !== 'error' && hasData && empty ? (
          <section className="pf-state">
            <p className="pf-state__title">No {isBatch ? 'batch' : 'global'} problems available yet.</p>
            <p className="pf-state__body">
              {isBatch
                ? 'Your trainer has not published problems for this batch yet.'
                : 'Performance appears here once global problems are published.'}
            </p>
            {!isBatch ? (
              <Link className="pf-button pf-button--primary" to="/student/practice">
                <Target size={14} aria-hidden="true" />
                Go to Practice
              </Link>
            ) : null}
          </section>
        ) : null}

        {status !== 'error' && hasData && !empty ? (
          <>
            <section className="pf-kpis" aria-label={`${scope} performance summary`}>
              <Kpi
                label={isBatch ? 'Assigned problems' : 'Global problems'}
                value={metrics.assigned}
                detail="Available in this scope"
              />
              <Kpi label="Solved" value={metrics.solved} detail="Accepted submissions" />
              <Kpi
                label="Completion"
                value={`${metrics.completionPercentage}%`}
                detail={`${metrics.solved} of ${metrics.assigned} solved`}
              />
              <Kpi label="Attempted" value={metrics.attempted} detail={`${metrics.notStarted} not started`} />
            </section>

            <div className="pf-grid">
              <ProgressCard scopeLabel={isBatch ? 'Batch progress' : 'Global progress'} metrics={metrics} />
              <DifficultyBreakdown rows={data.breakdowns?.difficulty} />
              <RecentActivity items={data.recentActivity} />
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}