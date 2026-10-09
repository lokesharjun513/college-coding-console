import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStudentDashboard } from '../../api/student';
import './StudentDashboard.css';

function ActionLink({ to, children, primary = false }) {
  return <Link className={`student-dashboard__action ${primary ? 'student-dashboard__action--primary' : ''}`} to={to}>{children}</Link>;
}

export default function StudentDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getStudentDashboard();
      setDashboard(response.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) return <main className="student-dashboard" role="status"><div className="student-dashboard__loading">Loading your dashboard…</div></main>;
  if (error) return <main className="student-dashboard"><div className="student-dashboard__error" role="alert"><p>{error}</p><button type="button" onClick={loadDashboard}>Retry</button></div></main>;

  const student = dashboard?.student;
  const batch = dashboard?.batch;
  const metrics = dashboard?.metrics;
  const completion = metrics && metrics.totalProblems > 0
    ? Math.round((metrics.solvedProblems / metrics.totalProblems) * 100)
    : null;

  if (!batch) {
    return (
      <main className="student-dashboard">
        <section className="student-dashboard__empty">
          <span className="student-dashboard__eyebrow">Your learning space</span>
          <h1>You are not enrolled in any batch.</h1>
          <p>Your global practice environment is still available.</p>
          <div className="student-dashboard__actions">
            <ActionLink to="/student/practice" primary>Practice Global <span>→</span></ActionLink>
            <ActionLink to="/student/freeconsole">Free Console <span>→</span></ActionLink>
            <ActionLink to="/student/performance">Global Performance <span>→</span></ActionLink>
            <ActionLink to="/student/leaderboard">Global Leaderboard <span>→</span></ActionLink>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="student-dashboard">
      <section className="student-dashboard__hero">
        <div>
          <span className="student-dashboard__eyebrow">Welcome back</span>
          <h1>{student?.name || 'Student'}</h1>
          <p>{batch.name}{batch.code ? ` · ${batch.code}` : ''}</p>
        </div>
        <span className="student-dashboard__status">{batch.status || 'Active'}</span>
      </section>

      <section className="student-dashboard__section" aria-labelledby="batch-context-title">
        <div className="student-dashboard__section-heading"><div><span className="student-dashboard__eyebrow">Your cohort</span><h2 id="batch-context-title">Current Batch</h2></div><ActionLink to="/student/batch">View Batch <span>→</span></ActionLink></div>
        <div className="student-dashboard__batch-card">
          <div><strong>{batch.name}</strong><p>{batch.trainer ? `Trainer: ${batch.trainer}` : 'Your assigned learning environment'}</p></div>
          <span>{batch.status || 'Active'}</span>
        </div>
      </section>

      {metrics && <section className="student-dashboard__section" aria-labelledby="progress-title">
        <div className="student-dashboard__section-heading"><div><span className="student-dashboard__eyebrow">Practice progress</span><h2 id="progress-title">Keep your momentum</h2></div>{completion !== null && <strong className="student-dashboard__completion">{completion}%</strong>}</div>
        <div className="student-dashboard__progress-card">
          <div className="student-dashboard__progress-track"><span style={{ width: `${completion ?? 0}%` }} /></div>
          <div className="student-dashboard__progress-meta"><span>Assigned <b>{metrics.totalProblems}</b></span><span>Solved <b>{metrics.solvedProblems}</b></span>{completion !== null && <span>Completion <b>{completion}%</b></span>}</div>
        </div>
      </section>}

      <section className="student-dashboard__section">
        <div className="student-dashboard__section-heading"><div><span className="student-dashboard__eyebrow">Next step</span><h2>What should you do next?</h2></div></div>
        <div className="student-dashboard__actions"><ActionLink to="/student/batch" primary>Continue Training <span>→</span></ActionLink><ActionLink to="/student/practice">Practice Global <span>→</span></ActionLink><ActionLink to="/student/freeconsole">Free Console <span>→</span></ActionLink><ActionLink to="/student/performance">Performance <span>→</span></ActionLink></div>
      </section>
    </main>
  );
}
