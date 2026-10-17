import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCode2,
  Layers,
  RotateCcw,
  Search,
  Target,
  XCircle,
} from 'lucide-react';
import { getStudentAssignedProblems } from '../../api/student';
import './Problems.css';

const PAGE_SIZE = 20;

/**
 * Status precedence mirrors the backend: one accepted submission makes a
 * problem Solved regardless of how many failures precede it, and failures never
 * count as progress towards Solved.
 */
const STATUS_META = {
  SOLVED: { label: 'Solved', className: 'student-status-pill--solved', Icon: CheckCircle2 },
  ATTEMPTED: { label: 'Attempted', className: 'student-status-pill--attempted', Icon: RotateCcw },
  NOT_STARTED: { label: 'Not started', className: 'student-status-pill--not-started', Icon: Clock3 },
};

/** `Solve` / `Continue` / `Review` all point at the one existing solving route. */
const ACTION_META = {
  NOT_STARTED: { label: 'Solve', primary: true },
  ATTEMPTED: { label: 'Continue', primary: true },
  SOLVED: { label: 'Review', primary: false },
};

const difficultyClass = (value) => {
  const key = String(value || '').toUpperCase();
  if (key === 'EASY') return 'student-difficulty--easy';
  if (key === 'MEDIUM') return 'student-difficulty--medium';
  if (key === 'HARD') return 'student-difficulty--hard';
  return 'student-difficulty--unspecified';
};

const verdictLabel = (verdict) => {
  if (!verdict) return '';
  return verdict.charAt(0) + verdict.slice(1).toLowerCase().replace(/_/g, ' ');
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

function StateMessage({ tone = 'empty', title, children, action }) {
  return (
    <div className={`sp-state sp-state--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <p className="sp-state__title">{title}</p>
      {children && <p className="sp-state__body">{children}</p>}
      {action}
    </div>
  );
}

function ProgressBar({ percent, solved, total, label }) {
  return (
    <div className="sp-progress">
      <div className="sp-progress__head">
        <span className="sp-progress__label">{label}</span>
        <span className="sp-progress__value">{percent}%</span>
      </div>
      <div
        className="student-progress"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${solved} of ${total} assigned problems solved`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="sp-progress__caption">{solved} of {total} solved</p>
    </div>
  );
}

/**
 * Rows are keyed by problem id.
 *
 * The endpoint returns one row per problem, so this is not expected to drop
 * anything — but the list is rendered with `row.id` as the React key and every
 * action navigates by that id, so an entry without one (or a second copy of a
 * problem already on the page) is a broken row and a potential
 * `/student/problems/undefined`. Uniqueness is therefore enforced at the point
 * of rendering instead of assumed.
 */
function dedupeById(list) {
  const seen = new Set();
  return list.filter((row) => {
    const key = row?.id === undefined || row?.id === null ? null : String(row.id);
    if (key === null || key === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function Problems() {
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('ALL');
  const [progress, setProgress] = useState('ALL');
  const [topic, setTopic] = useState('ALL');
  const [page, setPage] = useState(1);

  // Guards against a slow response overwriting a newer one — and against writing
  // state after the page has gone away.
  //
  // The effect BODY must set `mounted.current = true`. React 18 StrictMode
  // (enabled in main.jsx) mounts, unmounts and remounts every component in
  // development. A cleanup-only flag is therefore set to false by the simulated
  // unmount and never restored, so every later response was treated as
  // "superseded", no state was ever written, and the page stayed on its loading
  // skeleton forever — a blank screen with a silent, permanently pending request.
  const requestId = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    requestId.current += 1;
    const ticket = requestId.current;
    setStatus('loading');
    setError(null);
    try {
      const response = await getStudentAssignedProblems({
        search: search.trim() || undefined,
        difficulty: difficulty === 'ALL' ? undefined : difficulty,
        status: progress === 'ALL' ? undefined : progress,
        topic: topic === 'ALL' ? undefined : topic,
        page,
        pageSize: PAGE_SIZE,
      });
      if (!mounted.current || ticket !== requestId.current) return;
      setData(Array.isArray(response.data?.data) ? response.data.data : []);
      setMeta(response.data?.meta || null);
      setStatus('ready');
    } catch (err) {
      if (!mounted.current || ticket !== requestId.current) return;
      setError(err?.response?.data?.message || 'Unable to load your assigned problems.');
      setStatus('error');
    }
  }, [search, difficulty, progress, topic, page]);

  // Debounced search so each keystroke does not fire a request.
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // Any filter change returns to the first page; otherwise a narrowed result set
  // can land the user on an empty page beyond the new total.
  const changeFilter = useCallback((setter) => (value) => {
    setPage(1);
    setter(value);
  }, []);

  const counts = meta?.counts;
  const batches = meta?.batches || [];
  const pagination = meta?.pagination;
  const enrolled = meta?.enrolled !== false;
  const topics = meta?.topics || [];
  const difficulties = meta?.difficulties || [];

  const showMultiBatchLabel = batches.length > 1;
  const filtersActive = Boolean(search.trim()) || difficulty !== 'ALL' || progress !== 'ALL' || topic !== 'ALL';

  // Overall completion comes from the endpoint's own percentage over the whole
  // assigned set. It is recomputed from the counts only as a fallback for a
  // response that omits it, never invented when there is nothing assigned.
  const completionPercent = counts && counts.total > 0
    ? (Number.isFinite(meta?.completionPercentage)
      ? meta.completionPercentage
      : Math.round((counts.solved / counts.total) * 100))
    : 0;

  const resetFilters = useCallback(() => {
    setPage(1);
    setSearch('');
    setDifficulty('ALL');
    setProgress('ALL');
    setTopic('ALL');
  }, []);

  const pageNumbers = useMemo(() => {
    if (!pagination || pagination.totalPages <= 1) return [];
    const current = pagination.page;
    const last = pagination.totalPages;
    const wanted = [1, current - 1, current, current + 1, last]
      .filter((n, i, arr) => n >= 1 && n <= last && arr.indexOf(n) === i)
      .sort((a, b) => a - b);
    return wanted;
  }, [pagination]);

  // Topic is filtered server-side alongside search, difficulty and status, so the
  // result and `pagination.total` always describe the same dataset. The rows
  // still pass through dedupeById because they are the React key and the
  // navigation target.
  const visibleRows = useMemo(() => dedupeById(data), [data]);

  // Today's work comes from the endpoint's own `meta.today`, which is resolved
  // over the whole assigned set. Deriving it from the current page made the
  // panel disappear whenever today's problems fell on another page or were
  // filtered out, contradicting the `todayCount` shown next to it. The page-local
  // `isToday` flags remain the fallback for a response without `meta.today`.
  const todayRows = useMemo(() => {
    const fromMeta = Array.isArray(meta?.today) ? meta.today : null;
    return dedupeById(
      (fromMeta || data)
        .filter((row) => (fromMeta ? true : row.isToday))
        .map((row) => ({
          ...row,
          progress: row.progress || 'NOT_STARTED',
        }))
    );
  }, [data, meta]);

  // Every action resolves to the registered solving route with the id the API
  // actually returned. A row without an id has no destination, so it is never
  // navigated to.
  const openProblem = useCallback(
    (row) => {
      const id = row?.id;
      if (id === undefined || id === null || id === '') return;
      navigate(`/student/problems/${id}`);
    },
    [navigate],
  );

  if (status === 'loading' && !meta) {
    return (
      <main className="student-problems">
        <div className="student-problems__inner" aria-busy="true">
          <p className="student-visually-hidden" role="status">Loading your assigned problems…</p>
          <div className="sp-skeleton sp-skeleton--title" aria-hidden="true" />
          <div className="sp-skeleton sp-skeleton--card" aria-hidden="true" />
          <div className="sp-skeleton sp-skeleton--list" aria-hidden="true" />
        </div>
      </main>
    );
  }

  return (
    <main className="student-problems">
      <div className="student-problems__inner">
        <div className="sp-top">
          <nav className="student-breadcrumb" aria-label="Breadcrumb">
            <Link className="student-breadcrumb__link" to="/student">Student</Link>
            <span className="student-breadcrumb__separator" aria-hidden="true">/</span>
            <span className="student-breadcrumb__current" aria-current="page">Problems</span>
          </nav>

          <header className="sp-header">
            <div className="sp-header__intro">
              <h1 className="sp-header__title">Assigned Problems</h1>
              <p className="sp-header__subtitle">
                Problems your trainer has assigned to your batch. Solve them to track your progress.
              </p>
            </div>
            <div className="sp-header__aside">
              {counts && counts.total > 0 && (
                <div className="sp-header__summary">
                  <span className="sp-summary-pill">
                    <Layers size={14} aria-hidden="true" />
                    {counts.total} assigned
                  </span>
                  <span className="sp-summary-pill sp-summary-pill--positive">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    {counts.solved} solved
                  </span>
                  <span className="sp-summary-pill">
                    <FileCode2 size={14} aria-hidden="true" />
                    {Math.max(counts.total - counts.solved, 0)} remaining
                  </span>
                </div>
              )}
              {counts && counts.total > 0 && (
                <div className="sp-header__progress">
                  <ProgressBar
                    percent={completionPercent}
                    solved={counts.solved}
                    total={counts.total}
                    label="Overall completion"
                  />
                </div>
              )}
            </div>
          </header>
        </div>

        {status === 'error' && (
          <StateMessage
            tone="error"
            title="We could not load your assigned problems."
            action={(
              <button type="button" className="sp-button sp-button--primary" onClick={load}>
                <RotateCcw size={14} aria-hidden="true" />
                Try again
              </button>
            )}
          >
            {error}
          </StateMessage>
        )}

        {status !== 'error' && !enrolled && (
          <section className="sp-card" aria-labelledby="sp-no-batch-title">
            <span className="sp-card__icon" aria-hidden="true"><Layers size={17} /></span>
            <div className="sp-card__heading-text">
              <h2 id="sp-no-batch-title">No batch assignments yet</h2>
              <p>You are not currently enrolled in a batch.</p>
            </div>
            <StateMessage title="Batch assignments appear here after enrollment.">
              Once your administrator enrolls you in a batch, the problems your trainer assigns
              will appear on this page with their difficulty and progress.
            </StateMessage>
            <div className="sp-actions">
              <Link className="sp-button sp-button--primary" to="/student/practice">
                <Target size={14} aria-hidden="true" />
                Go to Global Practice
              </Link>
            </div>
          </section>
        )}

        {status !== 'error' && enrolled && (
          <>
            <section className="sp-batch-grid" aria-label="Your batch assignments">
              {batches.map((batch) => (
                <article className="sp-card sp-card--batch" key={batch.id}>
                  <div className="sp-card__header">
                    <span className="sp-card__icon" aria-hidden="true"><Layers size={17} /></span>
                    <div className="sp-card__heading-text">
                      <h2>{batch.name}</h2>
                      <p>
                        {[
                          batch.code,
                          batch.trainerName ? `Trainer ${batch.trainerName}` : null,
                          batch.status,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  {batch.startDate && <p className="sp-card__meta">Started {formatDate(batch.startDate)}</p>}
                  <ProgressBar
                    percent={batch.assigned ? Math.round((batch.solved / batch.assigned) * 100) : 0}
                    solved={batch.solved}
                    total={batch.assigned}
                    label={`${batch.name} completion`}
                  />
                </article>
              ))}
            </section>

            {counts && (
              <section className="sp-stat-grid" aria-label="Assigned problem summary">
                {[
                  { key: 'total', label: 'Total assigned', value: counts.total, Icon: Layers },
                  { key: 'solved', label: 'Solved', value: counts.solved, Icon: CheckCircle2, tone: 'positive' },
                  { key: 'attempted', label: 'Attempted', value: counts.attempted, Icon: RotateCcw },
                  { key: 'notStarted', label: 'Not started', value: counts.notStarted, Icon: Clock3 },
                ].map(({ key, label, value, Icon, tone }) => (
                  <article className="sp-stat" key={key} data-tone={tone || 'default'}>
                    <span className="sp-stat__label">{label}</span>
                    <span className="sp-stat__value">{value}</span>
                    <span className="sp-stat__icon" aria-hidden="true"><Icon size={16} /></span>
                  </article>
                ))}
              </section>
            )}

            {todayRows.length > 0 && (
              <section className="sp-card sp-card--today" aria-labelledby="sp-today-title">
                <div className="sp-card__header">
                  <span className="sp-card__icon" aria-hidden="true"><CalendarDays size={17} /></span>
                  <div className="sp-card__heading-text">
                    <h2 id="sp-today-title">Today&apos;s Assigned Problems</h2>
                    <p>Problems scheduled for today by your trainer.</p>
                  </div>
                </div>
                <ul className="sp-today-list">
                  {todayRows.map((row) => {
                    const action = ACTION_META[row.progress] || ACTION_META.NOT_STARTED;
                    return (
                      <li className="sp-today-item" key={row.id}>
                        <div className="sp-today-item__body">
                          <span className="sp-today-item__title">{row.title}</span>
                          <span className={`student-difficulty ${difficultyClass(row.difficulty)}`}>
                            {row.difficulty || 'Unspecified'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`sp-button sp-button--compact${action.primary ? ' sp-button--primary' : ''}`}
                          onClick={() => openProblem(row)}
                          aria-label={`${action.label} ${row.title}`}
                        >
                          {action.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="sp-card sp-card--list" aria-labelledby="sp-list-title">
              <div className="sp-card__header sp-card__header--wrap">
                <span className="sp-card__icon" aria-hidden="true"><FileCode2 size={17} /></span>
                <div className="sp-card__heading-text">
                  <h2 id="sp-list-title">Assigned problem library</h2>
                  <p>{pagination ? `${pagination.total} problem${pagination.total === 1 ? '' : 's'} match your filters` : ''}</p>
                </div>
              </div>

              <div className="student-filter-bar">
                <label className="student-filter-field" htmlFor="sp-search">
                  <Search size={16} aria-hidden="true" />
                  <span className="student-visually-hidden">Search assigned problems by title</span>
                  <input
                    id="sp-search"
                    className="student-filter-input"
                    type="search"
                    placeholder="Search by title…"
                    value={search}
                    onChange={(event) => changeFilter(setSearch)(event.target.value)}
                  />
                </label>

                <label className="student-visually-hidden" htmlFor="sp-difficulty">Difficulty</label>
                <select
                  id="sp-difficulty"
                  className="student-filter-select"
                  value={difficulty}
                  onChange={(event) => changeFilter(setDifficulty)(event.target.value)}
                >
                  <option value="ALL">All difficulties</option>
                  {difficulties.map((value) => (
                    <option key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</option>
                  ))}
                </select>

                <label className="student-visually-hidden" htmlFor="sp-status">Status</label>
                <select
                  id="sp-status"
                  className="student-filter-select"
                  value={progress}
                  onChange={(event) => changeFilter(setProgress)(event.target.value)}
                >
                  <option value="ALL">All statuses</option>
                  <option value="NOT_STARTED">Not started</option>
                  <option value="ATTEMPTED">Attempted</option>
                  <option value="SOLVED">Solved</option>
                </select>

                {topics.length > 1 && (
                  <>
                    <label className="student-visually-hidden" htmlFor="sp-topic">Topic</label>
                    <select
                      id="sp-topic"
                      className="student-filter-select"
                      value={topic}
                      onChange={(event) => changeFilter(setTopic)(event.target.value)}
                    >
                      <option value="ALL">All topics</option>
                      {topics.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </>
                )}

                <button
                  type="button"
                  className="student-filter-reset"
                  onClick={resetFilters}
                  disabled={!filtersActive}
                >
                  Reset filters
                </button>
              </div>

              {status === 'loading' && (
                <ul className="sp-list" aria-hidden="true">
                  {[1, 2, 3, 4].map((row) => (
                    <li className="sp-row" key={row}>
                      <div className="sp-row__main"><div className="sp-skeleton sp-skeleton__line" /><div className="sp-skeleton sp-skeleton__thin" /></div>
                      <div className="sp-skeleton sp-skeleton__pill" />
                    </li>
                  ))}
                </ul>
              )}

              {status === 'ready' && counts.total === 0 && (
                <StateMessage title="No problems have been assigned to your batch yet.">
                  When your trainer assigns problems to {batches.length === 1 ? batches[0].name : 'your batch'},
                  they will appear here.
                </StateMessage>
              )}

              {status === 'ready' && counts.total > 0 && pagination.total === 0 && (
                <StateMessage
                  title="No problems match your filters."
                  action={(
                    <button type="button" className="sp-button sp-button--quiet" onClick={resetFilters}>
                      Clear filters
                    </button>
                  )}
                >
                  Try a different search term, or reset the filters to see all {counts.total} assigned problems.
                </StateMessage>
              )}

              {status === 'ready' && visibleRows.length > 0 && (
                <>
                  <ul className="sp-list">
                    {visibleRows.map((row) => {
                      const statusMeta = STATUS_META[row.progress] || STATUS_META.NOT_STARTED;
                      const action = ACTION_META[row.progress] || ACTION_META.NOT_STARTED;
                      const StatusIcon = statusMeta.Icon;
                      return (
                        <li className="sp-row" key={row.id} data-status={row.progress}>
                          <div className="sp-row__status">
                            <span className={`student-status-pill ${statusMeta.className}`}>
                              <StatusIcon size={13} aria-hidden="true" />
                              {statusMeta.label}
                            </span>
                          </div>

                          <div className="sp-row__main">
                            <span className="sp-row__title">{row.title}</span>
                            <span className="sp-row__meta">
                              {row.topic && <span className="sp-row__topic">{row.topic}</span>}
                              <span className={`student-difficulty ${difficultyClass(row.difficulty)}`}>
                                {row.difficulty || 'Unspecified'}
                              </span>
                              {showMultiBatchLabel && row.batch && (
                                <span className="sp-row__batch">{row.batch.name}</span>
                              )}
                              {row.attempts > 0 && (
                                <span className="sp-row__attempts">
                                  {row.attempts} attempt{row.attempts === 1 ? '' : 's'}
                                </span>
                              )}
                              {row.latestVerdict && row.progress !== 'SOLVED' && (
                                <span className="sp-row__verdict">
                                  <XCircle size={12} aria-hidden="true" />
                                  Last: {verdictLabel(row.latestVerdict)}
                                </span>
                              )}
                              {row.lastAttemptAt && <span className="sp-row__date">{formatDate(row.lastAttemptAt)}</span>}
                            </span>
                          </div>

                          <div className="sp-row__action">
                            <button
                              type="button"
                              className={`sp-button sp-button--compact${action.primary ? ' sp-button--primary' : ''}`}
                              onClick={() => openProblem(row)}
                              aria-label={`${action.label} ${row.title}`}
                            >
                              {action.label}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {pagination.totalPages > 1 && (
                    <nav className="sp-pagination" aria-label="Assigned problems pagination">
                      <button
                        type="button"
                        className="sp-page-btn"
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        disabled={pagination.page <= 1}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={15} aria-hidden="true" />
                      </button>
                      {pageNumbers.map((number, index) => {
                        const previous = pageNumbers[index - 1];
                        const showGap = previous !== undefined && number - previous > 1;
                        return (
                          <React.Fragment key={number}>
                            {showGap && <span className="sp-page-gap" aria-hidden="true">…</span>}
                            <button
                              type="button"
                              className={`sp-page-btn${number === pagination.page ? ' is-current' : ''}`}
                              onClick={() => setPage(number)}
                              aria-current={number === pagination.page ? 'page' : undefined}
                              aria-label={`Page ${number}`}
                            >
                              {number}
                            </button>
                          </React.Fragment>
                        );
                      })}
                      <button
                        type="button"
                        className="sp-page-btn"
                        onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                        disabled={pagination.page >= pagination.totalPages}
                        aria-label="Next page"
                      >
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    </nav>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {status === 'error' && (
          <div className="sp-actions sp-actions--centered">
            <Link className="sp-button sp-button--quiet" to="/student/practice">
              <Target size={14} aria-hidden="true" />
              Go to Global Practice
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}