// frontend/src/pages/student/Practice.jsx
//
// Practice — the GLOBAL curriculum published by Admin, as a
// Collection → Topic → Problems tree.
//
// The whole tree arrives in one request (`GET /student/practice/library`).
// The previous version chained three endpoints and re-fetched per collection and
// per topic; it also listed the student's own BATCH curriculum and had no
// search. Scope is enforced by the server's query, so nothing from a trainer's
// batch can appear here.
//
// Each level expands and collapses independently. Expanding is pure local state:
// no request is made, so the accordion cannot fight with the in-flight fetch.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Globe,
  Layers,
  RotateCcw,
  Search,
  Target,
} from 'lucide-react';
import { getStudentPracticeLibrary } from '../../api/student';
import './Practice.css';

const SEARCH_DEBOUNCE_MS = 300;

/** `1 Problem` / `2 Problems` — never "1 Problems". */
const plural = (count, singular, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * Status precedence mirrors the backend: one accepted submission makes a problem
 * Solved no matter how many failures precede it, and a code run that produced no
 * submission never counts as progress.
 */
const STATUS_META = {
  SOLVED: { label: 'Solved', className: 'pr-status--solved', Icon: CheckCircle2, action: 'Review', primary: false },
  ATTEMPTED: { label: 'Attempted', className: 'pr-status--attempted', Icon: RotateCcw, action: 'Continue', primary: true },
  NOT_STARTED: { label: 'Not started', className: 'pr-status--not-started', Icon: Clock3, action: 'Solve', primary: true },
};

const DIFFICULTY_CLASS = {
  EASY: 'pr-difficulty--easy',
  MEDIUM: 'pr-difficulty--medium',
  HARD: 'pr-difficulty--hard',
};

const statusMeta = (progress) => STATUS_META[progress] || STATUS_META.NOT_STARTED;

function StateMessage({ tone = 'empty', title, children, action }) {
  return (
    <div className={`pr-state pr-state--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <p className="pr-state__title">{title}</p>
      {children ? <p className="pr-state__body">{children}</p> : null}
      {action}
    </div>
  );
}

function SummaryCard({ label, value, Icon }) {
  return (
    <article className="pr-summary__item">
      <span className="pr-summary__icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span className="pr-summary__label">{label}</span>
      <span className="pr-summary__value">{value}</span>
    </article>
  );
}

/**
 * Decorative chevron for a disclosure row.
 *
 * It is `aria-hidden` and sits INSIDE the row's single button: one control per
 * row, with `aria-expanded` on it, is the accessible accordion pattern. A second
 * chevron button would expose a duplicate control to assistive technology.
 */
function Chevron({ expanded }) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <span className="pr-toggle" aria-hidden="true">
      <Icon size={16} />
    </span>
  );
}

function ProblemRow({ problem, onOpen }) {
  const meta = statusMeta(problem.progress);
  const StatusIcon = meta.Icon;
  const difficultyKey = String(problem.difficulty || '').toUpperCase();

  return (
    <li className="pr-problem" data-status={problem.progress}>
      <div className="pr-problem__main">
        <span className="pr-problem__title">{problem.title}</span>
        {problem.description ? (
          <span className="pr-problem__description">{problem.description}</span>
        ) : null}
      </div>

      <div className="pr-problem__side">
        <span className={`pr-difficulty ${DIFFICULTY_CLASS[difficultyKey] || 'pr-difficulty--unspecified'}`}>
          {difficultyKey || 'Unspecified'}
        </span>
        <span className={`pr-status ${meta.className}`}>
          <StatusIcon size={13} aria-hidden="true" />
          {meta.label}
        </span>
        {/* stopPropagation keeps the click off the parent Topic accordion. */}
        <button
          type="button"
          className={`pr-button pr-button--compact${meta.primary ? ' pr-button--primary' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(problem);
          }}
          aria-label={`${meta.action} ${problem.title}`}
        >
          {meta.action}
        </button>
      </div>
    </li>
  );
}

export default function Practice() {
  const navigate = useNavigate();

  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('ALL');
  const [progress, setProgress] = useState('ALL');
  const [topic, setTopic] = useState('ALL');

  // Expand state is keyed by id so two topics called "Arrays" stay independent.
  const [expandedCollections, setExpandedCollections] = useState(() => new Set());
  const [expandedTopics, setExpandedTopics] = useState(() => new Set());

  // Supersession guard. The flag is re-armed in the effect BODY: React 18
  // StrictMode unmounts and remounts components in development, and a
  // cleanup-only flag would stay false and silently discard every response,
  // leaving this page permanently blank.
  const requestId = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchDraft.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const load = useCallback(async () => {
    requestId.current += 1;
    const ticket = requestId.current;
    setStatus('loading');
    setError(null);
    try {
      const response = await getStudentPracticeLibrary({
        search: search || undefined,
        difficulty: difficulty === 'ALL' ? undefined : difficulty,
        status: progress === 'ALL' ? undefined : progress,
        topic: topic === 'ALL' ? undefined : topic,
      });
      if (!mounted.current || ticket !== requestId.current) return;
      setData(Array.isArray(response.data?.data) ? response.data.data : []);
      setMeta(response.data?.meta || null);
      setStatus('ready');
    } catch (err) {
      if (!mounted.current || ticket !== requestId.current) return;
      setError(err?.response?.data?.message || 'Unable to load the practice library.');
      setStatus('error');
    }
  }, [search, difficulty, progress, topic]);

  useEffect(() => {
    load();
  }, [load]);

  const changeFilter = useCallback((setter) => (value) => setter(value), []);

  const resetFilters = useCallback(() => {
    setSearchDraft('');
    setSearch('');
    setDifficulty('ALL');
    setProgress('ALL');
    setTopic('ALL');
  }, []);

  const toggle = useCallback((setter) => (key) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const openProblem = useCallback(
    (problem) => {
      const id = problem?.id;
      if (id === undefined || id === null || id === '') return;
      navigate(`/student/problems/${id}`);
    },
    [navigate],
  );

  const counts = meta?.counts;
  const difficulties = meta?.difficulties || [];
  const topics = meta?.topics || [];
  const filtering = Boolean(search) || difficulty !== 'ALL' || progress !== 'ALL' || topic !== 'ALL';

  const displayedProblemCount = useMemo(
    () => data.reduce(
      (sum, collection) => sum + new Set(
        collection.topics.flatMap((t) => t.problems.map((p) => String(p.id)))
      ).size,
      0,
    ),
    [data],
  );

  if (status === 'loading' && !meta) {
    return (
      <main className="practice-container pr-container">
        <div className="pr-inner" aria-busy="true">
          <p className="student-visually-hidden" role="status">Loading the practice library…</p>
          <div className="pr-skeleton pr-skeleton--title" aria-hidden="true" />
          <div className="pr-skeleton pr-skeleton--summary" aria-hidden="true" />
          <div className="pr-skeleton pr-skeleton--card" aria-hidden="true" />
        </div>
      </main>
    );
  }

  return (
    <main className="practice-container pr-container">
      <div className="pr-inner">
        <nav className="student-breadcrumb" aria-label="Breadcrumb">
          <Link className="student-breadcrumb__link" to="/student">Student</Link>
          <span className="student-breadcrumb__separator" aria-hidden="true">/</span>
          <span className="student-breadcrumb__current" aria-current="page">Practice</span>
        </nav>

        <header className="pr-header">
          <div className="pr-header__intro">
            <h1 className="pr-header__title">Practice</h1>
            <p className="pr-header__subtitle">
              The global curriculum published for the whole platform. Browse by collection and
              topic, and build your skills at your own pace — outside any batch.
            </p>
          </div>
          {counts && counts.problems > 0 ? (
            <section className="pr-summary" aria-label="Global practice overview">
              <SummaryCard label="Problems" value={counts.problems} Icon={Globe} />
              <SummaryCard label="Solved" value={counts.solved} Icon={CheckCircle2} />
              <SummaryCard label="Attempted" value={counts.attempted} Icon={RotateCcw} />
              <SummaryCard label="Completion" value={`${meta.completionPercentage}%`} Icon={Target} />
            </section>
          ) : null}
        </header>

        {status === 'error' ? (
          <StateMessage
            tone="error"
            title="We could not load the practice library."
            action={(
              <button type="button" className="pr-button pr-button--primary" onClick={load}>
                <RotateCcw size={14} aria-hidden="true" />
                Try again
              </button>
            )}
          >
            {error}
          </StateMessage>
        ) : null}

        {status === 'ready' ? (
          <section className="pr-card" aria-labelledby="pr-library-title">
            <div className="pr-card__header">
              <div className="pr-card__heading-text">
                <h2 id="pr-library-title">Collections</h2>
                <p>
                  {counts
                    ? `${plural(counts.collections, 'collection')} · ${plural(counts.topics, 'topic')} · ${plural(displayedProblemCount, 'problem')}`
                    : ''}
                </p>
              </div>
            </div>

            <div className="student-filter-bar">
              <label className="student-filter-field" htmlFor="pr-search">
                <Search size={16} aria-hidden="true" />
                <span className="student-visually-hidden">Search practice problems</span>
                <input
                  id="pr-search"
                  className="student-filter-input"
                  type="search"
                  placeholder="Search by title or description…"
                  value={searchDraft}
                  onChange={(e) => changeFilter(setSearchDraft)(e.target.value)}
                />
              </label>

              <label className="student-visually-hidden" htmlFor="pr-difficulty">Difficulty</label>
              <select
                id="pr-difficulty"
                className="student-filter-select"
                value={difficulty}
                onChange={(e) => changeFilter(setDifficulty)(e.target.value)}
              >
                <option value="ALL">All difficulties</option>
                {difficulties.map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0) + value.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>

              <label className="student-visually-hidden" htmlFor="pr-status">Status</label>
              <select
                id="pr-status"
                className="student-filter-select"
                value={progress}
                onChange={(e) => changeFilter(setProgress)(e.target.value)}
              >
                <option value="ALL">All statuses</option>
                <option value="NOT_STARTED">Not started</option>
                <option value="ATTEMPTED">Attempted</option>
                <option value="SOLVED">Solved</option>
              </select>

              {topics.length > 1 ? (
                <>
                  <label className="student-visually-hidden" htmlFor="pr-topic">Topic</label>
                  <select
                    id="pr-topic"
                    className="student-filter-select"
                    value={topic}
                    onChange={(e) => changeFilter(setTopic)(e.target.value)}
                  >
                    <option value="ALL">All topics</option>
                    {topics.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </>
              ) : null}

              <button
                type="button"
                className="student-filter-reset"
                onClick={resetFilters}
                disabled={!filtering}
              >
                Reset filters
              </button>
            </div>

            {!filtering && counts && counts.collections === 0 ? (
              <StateMessage title="No global collections are published yet.">
                Practice collections appear here as soon as an administrator publishes them.
                Your trainer&apos;s batch assignments live on the Problems page.
              </StateMessage>
            ) : null}

            {filtering && data.length === 0 ? (
              <StateMessage
                title="No problems match your filters."
                action={(
                  <button type="button" className="pr-button pr-button--quiet" onClick={resetFilters}>
                    Clear filters
                  </button>
                )}
              >
                Try a different search term, or reset the filters to see the whole library.
              </StateMessage>
            ) : null}

            <ul className="pr-tree">
              {data.map((collection) => {
                const key = String(collection.id);
                const expanded = expandedCollections.has(key);
                return (
                  <li className="pr-collection" key={key}>
                    {/* The whole row is one disclosure button, so clicking the
                        name, the counts or the chevron does the same thing. */}
                    <div className="pr-collection__row">
                      <button
                        type="button"
                        className="pr-collection__toggle"
                        aria-expanded={expanded}
                        onClick={() => toggle(setExpandedCollections)(key)}
                      >
                        <Chevron expanded={expanded} />
                        <span className="pr-collection__name">{collection.name}</span>
                        <span className="pr-collection__counts">
                          {plural(collection.topicCount, 'topic')} · {plural(collection.problemCount, 'problem')}
                        </span>
                      </button>
                      {collection.description ? (
                        <span className="pr-collection__description">{collection.description}</span>
                      ) : null}
                    </div>

                    {expanded ? (
                      <ul className="pr-topics">
                        {collection.topics.length === 0 ? (
                          <li className="pr-topics__empty">
                            This collection has no topics yet.
                          </li>
                        ) : collection.topics.map((entry) => {
                          const topicKey = `${key}:${entry.id}`;
                          const topicExpanded = expandedTopics.has(topicKey);
                          return (
                            <li className="pr-topic" key={String(entry.id)}>
                              <div className="pr-topic__row">
                                <button
                                  type="button"
                                  className="pr-topic__toggle"
                                  aria-expanded={topicExpanded}
                                  onClick={() => toggle(setExpandedTopics)(topicKey)}
                                >
                                  <Chevron expanded={topicExpanded} />
                                  <span className="pr-topic__name">{entry.name}</span>
                                  <span className="pr-topic__counts">
                                    {plural(entry.problemCount, 'problem')}
                                  </span>
                                </button>
                              </div>

                              {topicExpanded ? (
                                entry.problems.length === 0 ? (
                                  <p className="pr-topic__empty">
                                    This topic has no published problems yet.
                                  </p>
                                ) : (
                                  <ul className="pr-problems">
                                    {entry.problems.map((problem) => (
                                      <ProblemRow
                                        key={String(problem.id)}
                                        problem={problem}
                                        onOpen={openProblem}
                                      />
                                    ))}
                                  </ul>
                                )
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {status === 'error' ? (
          <div className="pr-actions pr-actions--centered">
            <Link className="pr-button pr-button--quiet" to="/student/problems">
              <Layers size={14} aria-hidden="true" />
              Go to your assigned problems
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}