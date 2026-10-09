import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentTraining, getStudentTopicProblems, getStudentNextPracticeProblem } from '../../api/student';
import './Practice.css';
import './DailyTraining.css';

/**
 * DailyTraining – Student Daily Training progress.
 *
 * Renders the authoritative backend contract from GET /api/student/collections/training:
 *   Training (collection) -> Days (topics) -> Problems.
 *
 * Training and Day totals/percentages are taken verbatim from the backend response
 * (totalProblems / solvedProblems / progressPercentage / status). They are NEVER
 * recomputed from the lazily loaded per-day problem lists (problemsCache).
 */
const STATUS_LABEL = {
  NO_PROBLEMS: 'No problems assigned',
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In Progress',
  NOT_STARTED: 'Not Started',
};

function StatusBadge({ status }) {
  const text = STATUS_LABEL[status] || status || '';
  return (
    <span className={`training-status training-status--${(status || '').toLowerCase()}`}>
      {text}
    </span>
  );
}

export default function DailyTraining() {
  const navigate = useNavigate();

  // Authoritative training-level data (single request)
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Expansion state – ID based, purely a UI concern (never used for progress)
  const [expandedTrainingId, setExpandedTrainingId] = useState(null);
  const [expandedDayIds, setExpandedDayIds] = useState(() => new Set());

  // Per-day problem lists – used ONLY for display, never for progress totals
  const [problemsCache, setProblemsCache] = useState({});
  const [loadingProblems, setLoadingProblems] = useState({});
  const [problemsError, setProblemsError] = useState({});
  const inFlight = useRef({});

  // Continue action state
  const [continueId, setContinueId] = useState(null);
  const [continueError, setContinueError] = useState(null);

  const fetchTraining = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getStudentTraining();
      setTrainings(res.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load your training progress.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on mount (authoritative) and on focus return so a just-finished
  // submission is reflected when the student comes back to this page.
  useEffect(() => {
    fetchTraining();
    const onFocus = () => fetchTraining();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchTraining]);

  const fetchDayProblems = useCallback(async (dayId) => {
    if (problemsCache[dayId] || inFlight.current[`day:${dayId}`]) return;
    inFlight.current[`day:${dayId}`] = true;
    try {
      setLoadingProblems(prev => ({ ...prev, [dayId]: true }));
      setProblemsError(prev => ({ ...prev, [dayId]: null }));
      const res = await getStudentTopicProblems(dayId);
      setProblemsCache(prev => ({ ...prev, [dayId]: res.data?.data || [] }));
    } catch (err) {
      setProblemsError(prev => ({
        ...prev,
        [dayId]: err?.response?.data?.message || 'Unable to load problems.',
      }));
    } finally {
      setLoadingProblems(prev => ({ ...prev, [dayId]: false }));
      delete inFlight.current[`day:${dayId}`];
    }
  }, [problemsCache]);

  const toggleTraining = useCallback((training) => {
    setExpandedDayIds(new Set());
    setExpandedTrainingId(prev => (prev === training.id ? null : training.id));
  }, []);

  const toggleDay = useCallback((day) => {
    setExpandedDayIds(prev => {
      const next = new Set(prev);
      if (next.has(day.id)) {
        next.delete(day.id);
      } else {
        next.add(day.id);
        fetchDayProblems(day.id);
      }
      return next;
    });
  }, [fetchDayProblems]);

  // Ask the backend for the next unsolved problem within this Training.
  // The backend prioritizes ATTEMPTED before NOT_STARTED. Never pick locally.
  const handleContinue = useCallback(async (training) => {
    setContinueId(training.id);
    setContinueError(null);
    try {
      const res = await getStudentNextPracticeProblem({ collectionId: training.id });
      const next = res.data?.data;
      if (next && next.problemId) {
        navigate(`/student/problems/${next.problemId}`);
      } else {
        // No problems remain – expand to reveal the completed days
        setExpandedDayIds(new Set());
        setExpandedTrainingId(training.id);
      }
    } catch (err) {
      setContinueError(err?.response?.data?.message || 'Unable to find next problem.');
    } finally {
      setContinueId(null);
    }
  }, [navigate]);

  const navigateToProblem = useCallback((problemId) => {
    navigate(`/student/problems/${problemId}`);
  }, [navigate]);

  if (loading && trainings.length === 0) {
    return (
      <div className="practice-container">
        <div className="practice-loading" role="status" aria-label="Loading training">
          <div className="practice-loading-spinner"></div>
          <p>Loading your batch training…</p>
        </div>
      </div>
    );
  }

  if (error && trainings.length === 0) {
    return (
      <div className="practice-container">
        <div className="practice-error" role="alert">
          <p>{error}</p>
          <button onClick={fetchTraining} className="practice-retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-container">
      <header className="practice-header">
        <div className="practice-header__content">
          <span className="practice-eyebrow">Batch learning</span>
          <h1 className="practice-title">Training</h1>
          <p className="practice-subtitle">
            Work through your assigned days and build a consistent coding habit.
          </p>
        </div>
      </header>

      {continueError && (
        <div className="practice-error practice-error--inline" role="alert">
          <p>{continueError}</p>
          <button onClick={() => setContinueError(null)} className="practice-retry-btn">
            Dismiss
          </button>
        </div>
      )}

      {trainings.length === 0 && (
        <div className="practice-empty-state">
          <div className="practice-empty-icon">📚</div>
          <h2>No Training has been assigned to this batch yet.</h2>
          <p>Your trainer has not assigned any daily training to your batch.</p>
        </div>
      )}

      <div className="practice-collections-grid">
        {trainings.map((training) => {
          const isExpanded = expandedTrainingId === training.id;
          const isCompleted = training.status === 'COMPLETED';
          const isNoProblems = training.status === 'NO_PROBLEMS';

          return (
            <div
              key={training.id}
              className={`practice-collection-card ${isExpanded ? 'practice-collection-card--expanded' : ''}`}
            >
              <div className="practice-collection-card__header">
                <div className="practice-collection-card__info">
                  <h2 className="practice-collection-card__title">{training.name}</h2>
                  <p className="practice-collection-card__description">
                    {training.description || `${training.topicCount || training.days.length} Days • ${training.totalProblems} Problems`}
                  </p>
                </div>
                <button
                  className="practice-expand-btn"
                  onClick={() => toggleTraining(training)}
                  aria-expanded={isExpanded}
                  aria-controls={`training-${training.id}`}
                  aria-label={isExpanded ? `Collapse ${training.name}` : `Expand ${training.name}`}
                >
                  <span className={`practice-expand-btn__icon ${isExpanded ? 'practice-expand-btn__icon--up' : ''}`}>
                    ↓
                  </span>
                </button>
              </div>

              <div className="practice-collection-card__progress">
                <div
                  className="practice-progress-bar"
                  role="progressbar"
                  aria-valuenow={isNoProblems ? 0 : training.progressPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Training progress for ${training.name}`}
                >
                  <div
                    className="practice-progress-bar__fill"
                    style={{ width: `${isNoProblems ? 0 : training.progressPercentage}%` }}
                  />
                </div>
                <div className="practice-progress-info">
                  <span className="practice-progress-percentage">
                    {isNoProblems ? '' : `${training.progressPercentage}%`}
                  </span>
                  <span className="practice-progress-count">
                    {isNoProblems
                      ? 'No problems assigned.'
                      : `${training.solvedProblems} / ${training.totalProblems} solved`}
                  </span>
                </div>
              </div>

              <div className="practice-collection-card__action">
                {isCompleted ? (
                  <span className="practice-completed-badge">✓ Training Completed</span>
                ) : isNoProblems ? (
                  <button className="practice-action-btn" disabled>
                    No problems yet
                  </button>
                ) : (
                  <button
                    className="practice-action-btn practice-action-btn--primary"
                    onClick={() => handleContinue(training)}
                    disabled={continueId === training.id}
                  >
                    {continueId === training.id ? 'Finding…' : 'Continue Practice'}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div id={`training-${training.id}`} className="practice-collection-card__topics">
                  <h3 className="practice-topics-header">Days</h3>

                  {training.days.length === 0 ? (
                    <div className="practice-topics-empty">No Days have been created for this Training yet.</div>
                  ) : (
                    <div className="practice-topics-list">
                      {training.days.map((day, index) => {
                        const isDayExpanded = expandedDayIds.has(day.id);
                        const isDayNoProblems = day.status === 'NO_PROBLEMS';
                        const daysProblems = problemsCache[day.id] || [];

                        return (
                          <div key={day.id} className="practice-topic-row">
                            <button
                              className="practice-topic-row__header"
                              onClick={() => toggleDay(day)}
                              aria-expanded={isDayExpanded}
                              aria-controls={`day-${day.id}`}
                            >
                              <span className="practice-topic-row__number">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <span className="practice-topic-row__title">{day.name}</span>
                              <span className="practice-topic-row__stats">
                                {isDayNoProblems
                                  ? '—'
                                  : `${day.solvedProblems}/${day.totalProblems}`}
                              </span>
                              <span className={`practice-topic-row__percentage ${day.status === 'COMPLETED' ? 'practice-topic-row__percentage--completed' : ''}`}>
                                {isDayNoProblems ? '—' : `${day.progressPercentage}%`}
                              </span>
                              <span className={`practice-topic-row__icon ${isDayExpanded ? 'practice-topic-row__icon--up' : ''}`}>
                                {day.status === 'COMPLETED' ? '✓' : '↓'}
                              </span>
                            </button>

                            {isDayExpanded && (
                              <div id={`day-${day.id}`} className="practice-topic-row__problems">
                                <div className="training-day-meta">
                                  <StatusBadge status={day.status} />
                                </div>

                                {loadingProblems[day.id] ? (
                                  <div className="practice-problems-loading">Loading problems…</div>
                                ) : problemsError[day.id] ? (
                                  <div className="practice-problems-error" role="alert">
                                    <p>{problemsError[day.id]}</p>
                                    <button
                                      onClick={() => fetchDayProblems(day.id)}
                                      className="practice-retry-btn"
                                    >
                                      Retry
                                    </button>
                                  </div>
                                ) : daysProblems.length === 0 ? (
                                  <div className="practice-problems-empty">
                                    {isDayNoProblems
                                       ? 'No problems have been assigned to this Day yet.'
                                       : 'No problems have been assigned to this Day yet.'}
                                  </div>
                                ) : (
                                  daysProblems.map((problem, pIndex) => {
                                    const progress = problem.progress || 'NOT_STARTED';
                                    let statusText = '○ Not Started';
                                    const solved = progress === 'SOLVED';
                                    const attempted = progress === 'ATTEMPTED';
                                    if (solved) statusText = '✓ Solved';
                                    else if (attempted) statusText = '◐ In Progress';

                                    return (
                                      <div
                                        key={problem.id}
                                        className={`practice-problem-row ${solved ? 'practice-problem-row--completed' : ''}`}
                                      >
                                        <span className="practice-problem-row__number">
                                          #{pIndex + 1}
                                        </span>
                                        <span className="practice-problem-row__title">
                                          {problem.title}
                                        </span>
                                        <span className="practice-problem-row__difficulty">
                                          {problem.difficulty || ''}
                                        </span>
                                        <span className={`practice-problem-row__status ${solved ? 'practice-problem-row__status--completed' : ''}`}>
                                          {statusText}
                                        </span>
                                        <button
                                          className={`practice-problem-row__action ${solved ? 'practice-problem-row__action--review' : ''}`}
                                          onClick={() => navigateToProblem(problem.id)}
                                        >
                                          {solved ? 'Review' : 'Practice →'}
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
