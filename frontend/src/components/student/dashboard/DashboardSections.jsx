import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Code2,
  FileCode2,
  Layers,
  RefreshCw,
  Target,
  XCircle,
} from 'lucide-react';

/* ── shared primitives ──────────────────────────────────────────────── */

export function SectionCard({ title, description, icon: Icon, action, children, labelledBy }) {
  return (
    <section className="sd-card" aria-labelledby={labelledBy}>
      <header className="sd-card__header">
        <div className="sd-card__heading">
          <span className="sd-card__icon" aria-hidden="true">
            <Icon size={17} strokeWidth={2} />
          </span>
          <div className="sd-card__heading-text">
            <h2 id={labelledBy}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Single place for the loading / error / empty wording so states stay consistent. */
export function StateMessage({ variant = 'empty', title, children, action }) {
  const className = `sd-state sd-state--${variant}`;
  const body = (
    <>
      {title && <p className="sd-state__title">{title}</p>}
      {children && <p className="sd-state__body">{children}</p>}
    </>
  );

  return (
    <div className={className} role={variant === 'error' ? 'alert' : undefined}>
      {body}
      {action}
    </div>
  );
}

/* ── KPI cards ──────────────────────────────────────────────────────── */

const VERDICT_TONE = {
  ACCEPTED: 'positive',
  COMPILATION_ERROR: 'negative',
  RUNTIME_ERROR: 'negative',
  WRONG_ANSWER: 'negative',
  TIME_LIMIT_EXCEEDED: 'negative',
  MEMORY_LIMIT_EXCEEDED: 'negative',
  EXECUTION_ERROR: 'negative',
};

export function verdictLabel(verdict) {
  if (!verdict) return 'Unknown';
  return verdict.charAt(0) + verdict.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * A KPI whose value may legitimately be unavailable. `loading` and `error` are
 * distinct states so a failed request is never rendered as a zero metric.
 */
export function KpiCard({ label, value, hint, icon: Icon, tone = 'default', loading, error, unavailable }) {
  const showUnavailable = !loading && !error && unavailable;

  return (
    <article className="sd-kpi" data-tone={tone}>
      <div className="sd-kpi__top">
        <span className="sd-kpi__label">{label}</span>
        <span className="sd-kpi__icon" aria-hidden="true">
          <Icon size={16} strokeWidth={2} />
        </span>
      </div>

      {loading ? (
        <>
          <span className="sd-kpi__value sd-kpi__value--placeholder" aria-hidden="true" />
          <span className="sd-skeleton sd-kpi__hint" aria-hidden="true" />
        </>
      ) : error ? (
        <>
          <span className="sd-kpi__value sd-kpi__value--muted">Unavailable</span>
          <span className="sd-kpi__hint sd-kpi__hint--error">{error}</span>
        </>
      ) : (
        <>
          <span className="sd-kpi__value">{showUnavailable ? '—' : value}</span>
          <span className="sd-kpi__hint">{hint}</span>
        </>
      )}
    </article>
  );
}

/* ── batch overview ─────────────────────────────────────────────────── */

export function BatchOverview({ dashboard, onRetry }) {
  const { status, data, error } = dashboard;
  const loading = status === 'loading';
  const batch = data?.batch ?? null;
  const metrics = data?.metrics ?? null;

  const assigned = metrics?.assignedBatchProblems;
  const solved = metrics?.batchSolvedProblems;
  const remaining = typeof assigned === 'number' && typeof solved === 'number' ? Math.max(0, assigned - solved) : null;
  const percent = assigned ? Math.round((solved / assigned) * 100) : 0;

  return (
    <SectionCard
      labelledBy="sd-batch-title"
      title="Batch Overview"
      description="Your assigned learning space and its progress"
      icon={Layers}
      action={batch ? (
        <Link className="sd-link-button" to="/student/batch">
          View batch
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      ) : null}
    >
      {loading && <StateMessage variant="loading" title="Loading your batch…" />}

      {!loading && error && !batch && (
        <StateMessage
          variant="error"
          title="We could not load your batch."
          action={onRetry ? (
            <button type="button" className="sd-button sd-button--quiet" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" />
              Retry
            </button>
          ) : null}
        >
          {error}
        </StateMessage>
      )}

      {!loading && !batch && (
        <StateMessage variant="empty" title="You are not enrolled in a batch yet.">
          Global practice and the free console are still available to you.
        </StateMessage>
      )}

      {batch && (
        <>
          <dl className="sd-fact-grid">
            <div className="sd-fact">
              <dt>Batch</dt>
              <dd>{batch.name}</dd>
            </div>
            <div className="sd-fact">
              <dt>Trainer</dt>
              <dd>{batch.trainerName || 'Not assigned'}</dd>
            </div>
            <div className="sd-fact">
              <dt>Started</dt>
              <dd>
                {batch.startDate
                  ? new Date(batch.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Not recorded'}
              </dd>
            </div>
            <div className="sd-fact">
              <dt>Status</dt>
              <dd>{batch.status || 'Active'}</dd>
            </div>
          </dl>

          {error && (
            <StateMessage variant="error" title="Batch metrics could not be refreshed.">
              {error}
            </StateMessage>
          )}

          <div className="sd-progress-block">
            <div className="sd-progress-block__head">
              <span className="sd-progress-block__title">Assigned problems completed</span>
              <span className="sd-progress-block__value">
                {typeof solved === 'number' && typeof assigned === 'number' ? `${percent}%` : '—'}
              </span>
            </div>
            <div
              className="sd-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={typeof percent === 'number' && !loading && !error ? percent : undefined}
              aria-valuetext={
                typeof solved === 'number' && typeof assigned === 'number'
                  ? `${solved} of ${assigned} batch problems solved`
                  : 'Batch completion unavailable'
              }
            >
              <span style={{ width: `${loading || error ? 0 : percent}%` }} />
            </div>
            <p className="sd-progress-block__caption">
              {typeof solved === 'number' && typeof assigned === 'number'
                ? `${solved} of ${assigned} solved · ${remaining} remaining`
                : 'Completion details are unavailable right now.'}
            </p>
          </div>

          <div className="sd-actions">
            <Link className="sd-button sd-button--primary" to="/student/problems">
              Open assigned problems
            </Link>
            {onRetry && (
              <button type="button" className="sd-button sd-button--quiet" onClick={onRetry}>
                <RefreshCw size={14} aria-hidden="true" />
                Refresh
              </button>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ── weekly activity ────────────────────────────────────────────────── */

export function WeeklyActivity({ submissions, weeklyActivity }) {
  const { status, error } = submissions;
  const loading = status === 'loading';
  const days = weeklyActivity;
  const peak = Math.max(1, ...days.map((day) => day.total));
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const accepted = days.reduce((sum, day) => sum + day.accepted, 0);

  const summary = `${total} submission${total === 1 ? '' : 's'} over the last 7 days, ${accepted} accepted.`;
  const dayLabel = (date) => date.toLocaleDateString('en-GB', { weekday: 'short' });
  const fullLabel = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <SectionCard
      labelledBy="sd-weekly-title"
      title="Weekly Activity"
      description="Submissions over the last 7 days"
      icon={Activity}
    >
      {loading && <StateMessage variant="loading" title="Building your week…" />}

      {!loading && error && <StateMessage variant="error" title="Weekly activity is unavailable.">{error}</StateMessage>}

      {!loading && !error && total === 0 && (
        <StateMessage variant="empty" title="No submissions in the last 7 days.">
          Solve a problem to start building your streak.
        </StateMessage>
      )}

      {!loading && !error && total > 0 && (
        <>
          <p className="sd-visually-hidden">{summary}</p>
          <div className="sd-chart" role="img" aria-label={`Weekly activity chart. ${summary}`}>
            {days.map((day) => (
              <div className="sd-chart__column" key={day.key}>
                <span className="sd-chart__count">{day.total || ''}</span>
                <div className="sd-chart__bar-track">
                  <div
                    className="sd-chart__bar"
                    style={{ height: `${Math.max(day.total ? 8 : 0, (day.total / peak) * 100)}%` }}
                    title={`${fullLabel(day.date)}: ${day.total} submission${day.total === 1 ? '' : 's'}, ${day.accepted} accepted`}
                  />
                </div>
                <span className="sd-chart__label">{dayLabel(day.date)}</span>
              </div>
            ))}
          </div>
          <dl className="sd-chart__legend">
            <div>
              <dt>Submissions</dt>
              <dd>{total}</dd>
            </div>
            <div>
              <dt>Accepted</dt>
              <dd>{accepted}</dd>
            </div>
          </dl>
        </>
      )}
    </SectionCard>
  );
}

/* ── recent activity ────────────────────────────────────────────────── */

export function RecentActivity({ dashboard }) {
  const { status, data, error } = dashboard;
  const loading = status === 'loading';
  const items = data?.recentSubmissions ?? [];

  return (
    <SectionCard
      labelledBy="sd-activity-title"
      title="Recent Activity"
      description="Your latest submissions"
      icon={FileCode2}
    >
      {loading && items.length === 0 && <StateMessage variant="loading" title="Loading your activity…" />}

      {!loading && error && items.length === 0 && (
        <StateMessage variant="error" title="Recent activity could not be loaded.">{error}</StateMessage>
      )}

      {!loading && !error && items.length === 0 && (
        <StateMessage variant="empty" title="No submissions yet.">
          Your solved and attempted problems will appear here.
        </StateMessage>
      )}

      {items.length > 0 && (
        <ul className="sd-activity-list">
          {items.map((item) => {
            const accepted = item.verdict === 'ACCEPTED';
            const label = verdictLabel(item.verdict);
            const stamp = new Date(item.createdAt);
            const time = Number.isNaN(stamp.getTime()) ? '' : stamp.toLocaleString();
            const scope = item.scope === 'BATCH' ? 'Batch' : item.scope === 'GLOBAL' ? 'Global' : null;
            const body = (
              <>
                <span className={`sd-activity-list__icon sd-activity-list__icon--${VERDICT_TONE[item.verdict] || 'muted'}`} aria-hidden="true">
                  {accepted ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                </span>
                <span className="sd-activity-list__body">
                  <span className="sd-activity-list__title">{item.problem}</span>
                  <span className="sd-activity-list__meta">
                    <span className={`sd-verdict sd-verdict--${accepted ? 'accepted' : 'failed'}`}>
                      {accepted ? 'Accepted' : label}
                    </span>
                    {scope && <span className="sd-scope">{scope}</span>}
                    {time && <span className="sd-activity-list__time">{time}</span>}
                  </span>
                </span>
              </>
            );

            return (
              <li className="sd-activity-list__item" key={item.id}>
                {item.problemId ? (
                  <Link className="sd-activity-list__link" to={`/student/problems/${item.problemId}`}>
                    {body}
                  </Link>
                ) : (
                  <span className="sd-activity-list__link sd-activity-list__link--static">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {items.length === 0 && !loading && !error && (
        <div className="sd-actions sd-actions--centered">
          <Link className="sd-button sd-button--primary" to="/student/problems">
            Browse problems
          </Link>
        </div>
      )}
    </SectionCard>
  );
}

/* ── continue practicing ────────────────────────────────────────────── */

const CONTEXT_LIMIT = 3;

/**
 * Picks what the student should pick up next. Batch work comes from trainer
 * assignments and global work from the problem list; the two are never mixed in
 * one list without a scope label on every card.
 */
export function pickContinuePracticing(assignments, problems) {
  const seen = new Set();
  const items = [];

  for (const assignment of assignments) {
    const problem = assignment.problem;
    // Without a problem id there is no route to send the student to, so the
    // row could only ever render a dead end. It is skipped rather than shown.
    if (!problem?.id) continue;
    const seenId = problem.id;
    if (seen.has(seenId)) continue;
    seen.add(seenId);
    items.push({
      key: `assignment-${assignment.id}`,
      id: problem.id,
      title: problem.title || assignment.title || 'Untitled problem',
      difficulty: problem.difficulty ?? null,
      scope: 'BATCH',
      status: assignment.completed ? 'Completed' : 'In progress',
      action: assignment.completed ? 'Review' : 'Continue',
      done: Boolean(assignment.completed),
    });
    if (items.length >= CONTEXT_LIMIT) break;
  }

  if (items.length < CONTEXT_LIMIT) {
    const global = problems
      .filter((problem) => problem.scope === 'GLOBAL' && problem.progress !== 'SOLVED')
      .sort((a, b) => (a.progress === 'ATTEMPTED' ? -1 : 1) - (b.progress === 'ATTEMPTED' ? -1 : 1));

    for (const problem of global) {
      if (seen.has(problem.id)) continue;
      seen.add(problem.id);
      items.push({
        key: `problem-${problem.id}`,
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty ?? null,
        scope: 'GLOBAL',
        status: problem.progress === 'ATTEMPTED' ? 'In progress' : 'Not started',
        action: problem.progress === 'ATTEMPTED' ? 'Continue' : 'Solve',
        done: false,
      });
      if (items.length >= CONTEXT_LIMIT) break;
    }
  }

  return items;
}

export function ContinuePracticing({ assignments, problems }) {
  const loading = assignments.status === 'loading' || problems.status === 'loading';
  const failed = assignments.status === 'error' && problems.status === 'error';
  const items = failed ? [] : pickContinuePracticing(assignments.data, problems.data);

  return (
    <SectionCard
      labelledBy="sd-continue-title"
      title="Continue Practicing"
      description="Pick up where you left off"
      icon={Target}
      action={
        <Link className="sd-link-button" to="/student/problems">
          All problems
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      {loading && <StateMessage variant="loading" title="Finding your next problem…" />}

      {!loading && failed && (
        <StateMessage variant="error" title="Your practice list could not be loaded.">
          {assignments.error || problems.error}
        </StateMessage>
      )}

      {!loading && !failed && items.length === 0 && (
        <StateMessage variant="empty" title="Nothing in progress right now.">
          Pick a problem to solve, or take the console for a free run.
        </StateMessage>
      )}

      {items.length > 0 && (
        <ul className="sd-continue-list">
          {items.map((item) => (
            <li className="sd-continue-list__item" key={item.key} data-scope={item.scope}>
              <div className="sd-continue-list__body">
                <span className="sd-continue-list__title">{item.title}</span>
                <span className="sd-continue-list__meta">
                  {item.difficulty && <span className="sd-tag sd-tag--difficulty">{item.difficulty}</span>}
                  <span className="sd-tag sd-tag--scope">
                    {item.scope === 'BATCH' ? 'Batch' : 'Global'}
                  </span>
                  <span className={`sd-continue-list__status${item.done ? ' is-done' : ''}`}>{item.status}</span>
                </span>
              </div>
              {item.id ? (
                <Link
                  className={`sd-button sd-button--compact${item.done ? '' : ' sd-button--primary'}`}
                  to={`/student/problems/${item.id}`}
                >
                  {item.action}
                </Link>
              ) : (
                <span className="sd-continue-list__status">Problem unavailable</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && !loading && !failed && (
        <div className="sd-actions sd-actions--centered sd-actions--wrap">
          <Link className="sd-button sd-button--primary" to="/student/problems">
            <FileCode2 size={14} aria-hidden="true" />
            Problems
          </Link>
          <Link className="sd-button sd-button--quiet" to="/student/practice">
            <Target size={14} aria-hidden="true" />
            Practice
          </Link>
          <Link className="sd-button sd-button--quiet" to="/student/freeconsole">
            <Code2 size={14} aria-hidden="true" />
            Free Console
          </Link>
        </div>
      )}
    </SectionCard>
  );
}