import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock3, Code2, Globe, Layers, Sparkles, Target, User } from 'lucide-react';
import useDashboardData from '../../components/student/dashboard/useDashboardData';
import {
  BatchOverview,
  ContinuePracticing,
  KpiCard,
  RecentActivity,
  WeeklyActivity,
} from '../../components/student/dashboard/DashboardSections';
import './StudentDashboard.css';

/** No practice-session duration is recorded anywhere yet, so the KPI states that plainly. */
const PRACTICE_TIME_UNAVAILABLE = 'Practice sessions are not timed yet';

function greetingFor(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatToday(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Roll number, department and section when the profile actually carries them. */
function batchLine(student) {
  const parts = [
    student?.academicBatch,
    student?.department,
    student?.section,
    student?.rollNumber ? `Roll ${student.rollNumber}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export default function StudentDashboard() {
  const { dashboard, assignments, problems, submissions, weeklyActivity } = useDashboardData();

  const today = new Date();
  const loadingDashboard = dashboard.status === 'loading';
  const student = dashboard.data?.student ?? null;
  const metrics = dashboard.data?.metrics ?? null;
  const batch = dashboard.data?.batch ?? null;

  const name = student?.name?.trim() || 'there';
  const subtitle = batchLine(student);

  return (
    <main className="student-dashboard">
      <div className="student-dashboard__inner">
        <header className="sd-header">
          <nav className="sd-breadcrumb" aria-label="Breadcrumb">
            <Link className="sd-breadcrumb__link" to="/student">Home</Link>
            <span className="sd-breadcrumb__separator" aria-hidden="true">/</span>
            <span className="sd-breadcrumb__current" aria-current="page">Dashboard</span>
          </nav>

          <div className="sd-header__row">
            <div className="sd-header__intro">
              <h1 className="sd-header__title">
                {greetingFor(today.getHours())}, {name}
              </h1>
              <p className="sd-header__subtitle">
                Track your progress, solve problems and keep your batch pace.
              </p>
              <div className="sd-header__chips">
                <span className="sd-chip">
                  <CalendarDays size={14} aria-hidden="true" />
                  {formatToday(today)}
                </span>
                {subtitle && (
                  <span className="sd-chip">
                    <User size={14} aria-hidden="true" />
                    {subtitle}
                  </span>
                )}
                {batch && (
                  <span className="sd-chip sd-chip--accent">
                    <Layers size={14} aria-hidden="true" />
                    {batch.name}
                  </span>
                )}
              </div>
            </div>

            <div className="sd-header__actions">
              <Link className="sd-button sd-button--quiet" to="/student/problems">
                <Globe size={15} aria-hidden="true" />
                Global problems
              </Link>
              <Link className="sd-button sd-button--primary" to="/student/freeconsole">
                <Code2 size={15} aria-hidden="true" />
                Open console
              </Link>
            </div>
          </div>
        </header>

        <section className="sd-kpi-grid" aria-label="Your progress at a glance">
          <KpiCard
            label="Assigned batch problems"
            value={metrics?.assignedBatchProblems}
            hint={batch ? `In ${batch.name}` : 'Join a batch to be assigned'}
            icon={Layers}
            loading={loadingDashboard}
            error={dashboard.status === 'error' ? dashboard.error : null}
            unavailable={!batch}
          />
          <KpiCard
            label="Batch problems solved"
            value={metrics?.batchSolvedProblems}
            hint={
              batch && typeof metrics?.assignedBatchProblems === 'number' && metrics.assignedBatchProblems > 0
                ? `${Math.round((metrics.batchSolvedProblems / metrics.assignedBatchProblems) * 100)}% of your batch`
                : 'No batch problems yet'
            }
            icon={Target}
            tone="positive"
            loading={loadingDashboard}
            error={dashboard.status === 'error' ? dashboard.error : null}
            unavailable={!batch}
          />
          <KpiCard
            label="Global problems solved"
            value={metrics?.globalSolvedProblems}
            hint="Across the shared problem library"
            icon={Globe}
            loading={loadingDashboard}
            error={dashboard.status === 'error' ? dashboard.error : null}
          />
          <KpiCard
            label="Practice time"
            unavailable
            hint={PRACTICE_TIME_UNAVAILABLE}
            icon={Clock3}
          />
        </section>

        <div className="sd-grid sd-grid--split">
          <BatchOverview dashboard={dashboard} onRetry={dashboard.reload} />
          <WeeklyActivity submissions={submissions} weeklyActivity={weeklyActivity} />
        </div>

        <div className="sd-grid sd-grid--split">
          <RecentActivity dashboard={dashboard} />
          <ContinuePracticing assignments={assignments} problems={problems} />
        </div>

        <footer className="sd-footer">
          <Sparkles size={14} aria-hidden="true" />
          <span>Small steps, every day. Your batch progress updates as you solve problems.</span>
        </footer>
      </div>
    </main>
  );
}