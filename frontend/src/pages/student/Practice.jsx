import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getStudentCollections,
  getStudentCollectionTopics,
  getStudentTopicProblems,
  getStudentNextPracticeProblem,
} from '../../api/student';
import './Practice.css';

// ──────────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────────

const idOf = (item) => item?._id || item?.id;

const progressOf = (total = 0, completed = 0) => ({
  total,
  completed,
  percentage: total ? Math.min(100, Math.round((completed / total) * 100)) : 0,
});

const statusOf = ({ percentage, total }) => {
  if (total > 0 && percentage === 100) return 'COMPLETED';
  if (percentage > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
};

// ──────────────────────────────────────────────────────────────────────
// Presentational Components
// ──────────────────────────────────────────────────────────────────────

function Progress({ value, label }) {
  return (
    <div className="practice-progress" role="progressbar" aria-valuenow={value} aria-valuemin="0" aria-valuemax="100" aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function Status({ progress }) {
  const status = statusOf(progress);
  return (
    <span className={`practice-status practice-status--${status.toLowerCase()}`}>
      {status === 'COMPLETED' ? 'Collection Completed' : status === 'IN_PROGRESS' ? 'In Progress' : 'Not Started'}
    </span>
  );
}

function LoadingCards({ label }) {
  return (
    <div className="practice-skeletons" aria-label={`Loading ${label}`} role="status">
      {[1, 2, 3].map((item) => (
        <div className="practice-skeleton" key={item}>
          <i />
          <b />
          <em />
        </div>
      ))}
    </div>
  );
}

function Empty({ title, children }) {
  return (
    <div className="practice-empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function InlineError({ message, onRetry }) {
  return (
    <div className="practice-inline-error" role="alert">
      <span>{message}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────────

export default function Practice() {
  const navigate = useNavigate();

  // ──────────────────────────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────────────────────────
  const [collections, setCollections] = useState([]);
  const [topics, setTopics] = useState([]);
  const [problems, setProblems] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [view, setView] = useState('collections');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [continueState, setContinueState] = useState({ id: null, error: null });
  const [searchTerm, setSearchTerm] = useState('');

  // ──────────────────────────────────────────────────────────────────
  // Data Loading
  // ──────────────────────────────────────────────────────────────────
  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const collectionsResponse = await getStudentCollections();
      setCollections(collectionsResponse.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load practice.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const selectCollection = async (collection) => {
    setSelectedCollection(collection);
    setSelectedTopic(null);
    setView('topics');
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await getStudentCollectionTopics(idOf(collection));
      setTopics(response.data?.data || []);
    } catch (err) {
      setDetailError(err?.response?.data?.message || 'Unable to load topics.');
      setTopics([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const selectTopic = async (topic) => {
    setSelectedTopic(topic);
    setView('problems');
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await getStudentTopicProblems(idOf(topic), { scope: 'GLOBAL' });
      setProblems(response.data?.data || []);
    } catch (err) {
      setDetailError(err?.response?.data?.message || 'Unable to load problems.');
      setProblems([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const back = () => {
    if (view === 'problems') {
      setView('topics');
      setSelectedTopic(null);
    } else if (view === 'topics') {
      setView('collections');
      setSelectedCollection(null);
    }
  };

  const handleContinue = useCallback(async (collection) => {
    setContinueState({ id: idOf(collection), error: null });
    try {
      const res = await getStudentNextPracticeProblem({ collectionId: idOf(collection) });
      const next = res.data?.data;
      if (next && next.problemId) {
        navigate(`/student/problems/${next.problemId}`);
      } else {
        setContinueState({ id: null, error: 'no-problems' });
      }
    } catch (err) {
      setContinueState({ id: null, error: err?.response?.data?.message || 'Unable to find next problem.' });
    }
  }, [navigate]);

  // ──────────────────────────────────────────────────────────────────
  // Computed Data
  // ──────────────────────────────────────────────────────────────────
  const collectionProgress = (collection) => progressOf(collection.problemCount, collection.completedProblemCount);
  const topicProgress = (topic) => progressOf(topic.problemCount, topic.completedProblemCount);

  const title = view === 'collections'
    ? 'Practice'
    : view === 'topics'
      ? selectedCollection?.name
      : selectedTopic?.name;

  const subtitle = view === 'collections'
    ? 'Explore collections and keep your skills sharp.'
    : view === 'topics'
      ? 'Choose a topic and build your fluency one problem at a time.'
      : 'Solve, review, and strengthen your understanding.';

  const filteredCollections = collections.filter((c) =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalProblems = collections.reduce((sum, c) => sum + (c.problemCount || 0), 0);
  const solvedProblems = collections.reduce((sum, c) => sum + (c.completedProblemCount || 0), 0);
  const attemptedProblems = collections.reduce((sum, c) => {
    const attempted = c.problemCount || 0 - (c.completedProblemCount || 0);
    return sum + Math.max(0, attempted);
  }, 0);
  const completionPercentage = totalProblems ? Math.round((solvedProblems / totalProblems) * 100) : 0;

  // ──────────────────────────────────────────────────────────────────
  // Render Functions
  // ──────────────────────────────────────────────────────────────────
  const renderCollectionCard = (collection) => {
    const progress = collectionProgress(collection);
    const isComplete = progress.total > 0 && progress.completed === progress.total;
    const busy = continueState.id === idOf(collection);

    return (
      <div className="practice-card" key={idOf(collection)}>
        <button className="practice-card__open" onClick={() => selectCollection(collection)} aria-label={`Open ${collection.name}`}>
          <span className="practice-card-kicker">Collection</span>
          <strong>{collection.name}</strong>
          <small>
            {collection.topicCount || 0} Topics
            <i>•</i>
            {progress.total} Problems
          </small>
          <Progress value={progress.percentage} label={`${collection.name} progress`} />
          <span className="practice-card-foot">
            <b>{progress.completed} / {progress.total} completed</b>
            <Status progress={progress} />
            <span className="practice-arrow">→</span>
          </span>
        </button>
        {isComplete ? (
          <button
            className="practice-continue practice-continue--secondary"
            onClick={() => selectCollection(collection)}
          >
            Review Topics
          </button>
        ) : (
          <button
            className="practice-continue"
            onClick={() => handleContinue(collection)}
            disabled={Boolean(continueState.id) && !busy}
          >
            {busy ? 'Finding…' : continueState.error === 'no-problems' && continueState.id === null ? 'Nothing left' : 'Continue Practice'}
          </button>
        )}
      </div>
    );
  };

  const renderTopicCard = (topic, index) => {
    const progress = topicProgress(topic);
    return (
      <button
        className="practice-card practice-card--topic"
        key={idOf(topic)}
        onClick={() => selectTopic(topic)}
      >
        <span className="practice-card-kicker">
          Topic {String(index + 1).padStart(2, '0')}
        </span>
        <strong>{topic.name}</strong>
        <small>{progress.total} Problems</small>
        <Progress value={progress.percentage} label={`${topic.name} progress`} />
        <span className="practice-card-foot">
          <b>{progress.completed} / {progress.total} completed</b>
          <Status progress={progress} />
          <span className="practice-arrow">→</span>
        </span>
      </button>
    );
  };

  const renderProblemCard = (problem, index) => {
    const progress = problem.progress || 'NOT_STARTED';
    const solved = progress === 'SOLVED';
    const attempted = progress === 'ATTEMPTED';

    return (
      <button
        className="practice-problem"
        key={idOf(problem)}
        onClick={() => navigate(`/student/problems/${idOf(problem)}`)}
      >
        <span className="practice-problem-number">#{index + 1}</span>
        <div className="practice-problem-main">
          <strong>{problem.title}</strong>
          <small>
            <em className={`difficulty difficulty--${(problem.difficulty || 'easy').toLowerCase()}`}>
              {problem.difficulty || 'EASY'}
            </em>
          </small>
        </div>
        <div className="practice-problem-meta">
          <span className={`problem-state problem-state--${progress.toLowerCase()}`}>
            {solved ? '✓ Solved' : attempted ? '◐ Attempted' : '○ Not Started'}
          </span>
          <span className="practice-problem-action">
            {solved ? 'Review' : attempted ? 'Continue' : 'Solve'}
            <b>→</b>
          </span>
        </div>
      </button>
    );
  };

  // ──────────────────────────────────────────────────────────────────
  // Content Rendering
  // ──────────────────────────────────────────────────────────────────
  const content = useMemo(() => {
    if (loading) return <LoadingCards label="collections" />;

    if (view === 'collections') {
      return filteredCollections.length ? (
        <div className="practice-card-grid">
          {filteredCollections.map(renderCollectionCard)}
        </div>
      ) : (
        <Empty title="No collections yet">
          Global practice collections will appear here. Check back soon.
        </Empty>
      );
    }

    if (detailLoading) return <LoadingCards label={view === 'topics' ? 'topics' : 'problems'} />;

    if (detailError) {
      return (
        <InlineError
          message={detailError}
          onRetry={() => view === 'topics' ? selectCollection(selectedCollection) : selectTopic(selectedTopic)}
        />
      );
    }

    if (view === 'topics') {
      return topics.length ? (
        <div className="practice-card-grid">
          {topics.map(renderTopicCard)}
        </div>
      ) : (
        <Empty title="No topics yet">
          This collection has no global topics. Others may appear soon.
        </Empty>
      );
    }

    return problems.length ? (
      <div className="practice-problem-list">
        {problems.map(renderProblemCard)}
      </div>
    ) : (
      <Empty title="No problems yet">
        This topic has no global problems to practice.
      </Empty>
    );
  }, [collections, continueState, detailError, detailLoading, filteredCollections, handleContinue, loading, navigate, problems, selectedCollection, selectedTopic, topics, view]);

  // ──────────────────────────────────────────────────────────────────
  // Final JSX
  // ──────────────────────────────────────────────────────────────────
  return (
    <main className="practice-container">
      {/* Breadcrumb */}
      {view === 'collections' && (
        <nav className="practice-breadcrumb" aria-label="Breadcrumb">
          <a href="/" className="breadcrumb-link">Home</a>
          <span className="breadcrumb-separator">›</span>
          <a href="/student" className="breadcrumb-link">Student Workspace</a>
          <span className="breadcrumb-separator">›</span>
          <span className="breadcrumb-current">Practice</span>
        </nav>
      )}

      {/* Page Header */}
      <header className="practice-header">
        <div className="practice-header-content">
          {view !== 'collections' && (
            <button className="practice-back" onClick={back}>
              ← {view === 'problems' ? selectedCollection?.name : 'Practice'}
            </button>
          )}
          <p className="practice-eyebrow">
            {view === 'collections' ? 'Learning Space' : view === 'topics' ? 'Collection' : 'Topic'}
          </p>
          <h1>{title}</h1>
          <p className="practice-subtitle">{subtitle}</p>
        </div>
      </header>

      {/* KPI Metrics */}
      {view === 'collections' && (
        <section className="practice-metrics">
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Total Problems</span>
              <span className="kpi-value">{totalProblems}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Solved</span>
              <span className="kpi-value">{solvedProblems}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Attempted</span>
              <span className="kpi-value">{attemptedProblems}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Completion</span>
              <span className="kpi-value">{completionPercentage}%</span>
            </div>
          </div>
        </section>
      )}

      {/* Error Messages */}
      {error && <InlineError message={error} onRetry={loadCollections} />}
      {continueState.error && continueState.error !== 'no-problems' && (
        <InlineError message={continueState.error} onRetry={() => setContinueState({ id: null, error: null })} />
      )}

      {/* Collections Toolbar */}
      {view === 'collections' && (
        <section className="practice-collections-header">
          <div className="collections-header-left">
            <h2>Collections</h2>
            <p>Choose a collection to start practicing.</p>
          </div>
          <div className="collections-header-right">
            <input
              type="search"
              className="collections-search"
              placeholder="Search collections…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search collections"
            />
          </div>
        </section>
      )}

      {/* Summary Bar */}
      {view === 'topics' && selectedCollection && (
        <div className="practice-summary">
          <strong>{selectedCollection.name}</strong>
          <span>
            {selectedCollection.topicCount || 0} Topics •
            {selectedCollection.problemCount || 0} Problems
          </span>
          <Progress value={collectionProgress(selectedCollection).percentage} label="Collection progress" />
          <b>
            {collectionProgress(selectedCollection).completed} / {collectionProgress(selectedCollection).total} completed
          </b>
        </div>
      )}
      {view === 'problems' && selectedTopic && (
        <div className="practice-summary">
          <strong>{selectedTopic.name}</strong>
          <span>{selectedTopic.problemCount || 0} Problems</span>
          <Progress value={topicProgress(selectedTopic).percentage} label="Topic progress" />
          <b>
            {topicProgress(selectedTopic).completed} / {topicProgress(selectedTopic).total} completed
          </b>
        </div>
      )}

      {/* Content */}
      <section className="practice-content">{content}</section>
    </main>
  );
}
