import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentAssignments } from '../../api/student';
import '../../styles/pages/student-assignments.css';

function formatDate(value) {
  if (!value) return 'Available now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Available now';
  return `Available ${date.toLocaleDateString()}`;
}

function formatCompletedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `Completed ${date.toLocaleDateString()}`;
}

/**
 * AssignmentFeed — open-ended practice assignments for the authenticated
 * student.
 *
 * Everything shown here comes from GET /api/student/assignments, which already
 * returns only ACTIVE, non-deleted, available assignments in batches where this
 * student holds an ACTIVE enrollment, using a safe problem allow-list (no test
 * cases, no hidden expected outputs).
 *
 * `completed` is the authoritative server value from AssignmentCompletion. This
 * component never sets it locally: starting an assignment or submitting a wrong
 * answer cannot complete anything.
 */
export default function AssignmentFeed() {
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudentAssignments();
      setAssignments(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load your assignments.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on mount and on window focus, the same pattern used by
  // DailyTraining, so a just-accepted submission is reflected on return.
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const { pending, completed } = useMemo(() => {
    const open = [];
    const done = [];
    for (const assignment of assignments) {
      (assignment.completed ? done : open).push(assignment);
    }
    return { pending: open, completed: done };
  }, [assignments]);

  const openProblem = useCallback((problemId) => {
    navigate(`/student/problems/${problemId}`);
  }, [navigate]);

  const renderCard = (assignment) => {
    const problemId = assignment.problem?.id;
    const isCompleted = Boolean(assignment.completed);
    const completedAt = formatCompletedAt(assignment.completion?.completedAt);

    return (
      <li
        key={assignment.id}
        className={`student-assignments__card ${isCompleted ? 'student-assignments__card--completed' : ''}`}
        data-status={isCompleted ? 'COMPLETED' : 'PENDING'}
      >
        <div className="student-assignments__info">
          <div className="student-assignments__head">
            <span className="student-assignments__title">
              {assignment.title || assignment.problem?.title || 'Assignment'}
            </span>
            <span className={`student-assignments__badge ${isCompleted ? 'student-assignments__badge--completed' : 'student-assignments__badge--pending'}`}>
              {isCompleted ? 'Completed' : 'Pending'}
            </span>
          </div>

          <div className="student-assignments__meta">
            {assignment.problem?.difficulty && (
              <span className="student-assignments__tag">{assignment.problem.difficulty}</span>
            )}
            {assignment.batch && (
              <span className="student-assignments__tag">
                {assignment.batch.name}{assignment.batch.code ? ` · ${assignment.batch.code}` : ''}
              </span>
            )}
            <span className="student-assignments__subtle">{formatDate(assignment.availableFrom)}</span>
            {isCompleted && completedAt && (
              <span className="student-assignments__subtle">{completedAt}</span>
            )}
          </div>
        </div>

        {problemId ? (
          <button
            type="button"
            className={`student-assignments__action ${isCompleted ? '' : 'student-assignments__action--primary'}`}
            onClick={() => openProblem(problemId)}
            aria-label={`${isCompleted ? 'Review' : 'Start'} ${assignment.problem?.title || 'assignment'}`}
          >
            {isCompleted ? 'Review' : 'Start'}
          </button>
        ) : (
          <span className="student-assignments__subtle">Problem unavailable</span>
        )}
      </li>
    );
  };

  return (
    <section className="student-assignments" aria-labelledby="student-assignments-title">
      <div className="student-assignments__heading">
        <div>
          <span className="student-assignments__eyebrow">Practice assignments</span>
          <h2 id="student-assignments-title">Your Assignments</h2>
        </div>
        {meta && meta.total > 0 && (
          <span className="student-assignments__summary">
            {meta.completed} completed · {meta.pending} pending
          </span>
        )}
      </div>

      {loading && assignments.length === 0 && (
        <div className="student-assignments__state" role="status">
          Loading your assignments…
        </div>
      )}

      {error && assignments.length === 0 && (
        <div className="student-assignments__state student-assignments__state--error" role="alert">
          <p>{error}</p>
          <button type="button" className="student-assignments__retry" onClick={load}>Try again</button>
        </div>
      )}

      {!loading && !error && assignments.length === 0 && (
        <div className="student-assignments__state">
          <p>No assignments are available right now.</p>
          <p className="student-assignments__subtle">
            Assignments appear here once your trainer assigns them and they become available.
          </p>
        </div>
      )}

      {!loading && !error && assignments.length > 0 && (
        <>
          {pending.length > 0 && (
            <div className="student-assignments__group">
              <h3 className="student-assignments__group-title">Pending ({pending.length})</h3>
              <ul className="student-assignments__list">{pending.map(renderCard)}</ul>
            </div>
          )}

          {completed.length > 0 && (
            <div className="student-assignments__group">
              <h3 className="student-assignments__group-title">Completed ({completed.length})</h3>
              <ul className="student-assignments__list">{completed.map(renderCard)}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}