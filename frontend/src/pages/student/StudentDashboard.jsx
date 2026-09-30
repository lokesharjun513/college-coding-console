import React, { useState } from 'react';
import './StudentDashboard.css';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Placeholder dashboard data – the real request has been removed per task.
const placeholderDashboard = {
  student: { name: 'Student' },
  batch: null,
  metrics: {
    totalProblems: 0,
    attemptedProblems: 0,
    solvedProblems: 0,
    accuracy: 0,
  },
  recentSubmissions: [],
};

export default function StudentDashboard() {
  const [dashboard] = useState(placeholderDashboard);
  const { student, batch, metrics, recentSubmissions } = dashboard;
  const { totalProblems, attemptedProblems, solvedProblems, accuracy } = metrics;
  const completionRate = totalProblems > 0 ? Math.round((solvedProblems / totalProblems) * 100) : 0;

  const getVerdictBadge = (verdict) => {
    const styles = {
      ACCEPTED: { bg: '#f0fdf4', color: '#16a34a' },
      COMPILE_ERROR: { bg: '#fffbeb', color: '#d97706' },
      RUNTIME_ERROR: { bg: '#fff1f2', color: '#e11d48' },
      TIME_LIMIT_EXCEEDED: { bg: '#fff1f2', color: '#e11d48' },
    };
    const style = styles[verdict] || { bg: '#f1f5f9', color: '#64748b' };
    return (
      <span style={{ background: style.bg, color: style.color, padding: '2px 8px', borderRadius: '6px', fontSize: '11px' }}>
        {verdict}
      </span>
    );
  };

  return (
    <div className="dashboard-container">
      {/* Top Hero Section */}
      <header className="hero-section">
        <div className="hero-content">
          <div className="greeting-badge">☀️ {getGreeting()},</div>
          <h1 className="user-name">{student?.name || 'Student'} <span className="wave-emoji">👋</span></h1>
          {batch && (
            <p className="hero-subtitle">
              Batch: <strong>{batch.code}</strong> • {batch.name}
            </p>
          )}
          <div className="hero-action">
            <button className="primary-btn">
              Continue Practice <span className="arrow">→</span>
            </button>
            <span className="hero-hint">Pick up where you left off</span>
          </div>
        </div>
        <div className="hero-banner-card">
          <div className="banner-illustration">
            <div className="avatar-placeholder">👨‍💻</div>
          </div>
          <div className="quote-box">
            <span className="quote-icon">“</span>
            <p className="quote-text">A little progress every day adds up to big results.</p>
          </div>
        </div>
      </header>

      {/* Middle Grid: Global Practice & Today's Practice */}
      <section className="middle-grid">
        {/* Global Practice Card */}
        <div className="card global-practice-card">
          <div className="card-header">
            <h3>🌐 Global Practice</h3>
            <p>Explore additional problems and sharpen your skills.</p>
          </div>
          <div className="global-progress-container">
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${completionRate}%` }}></div>
            </div>
            <button className="icon-btn">→</button>
          </div>
          <div className="badge-stat">
            <span className="stat-number">{totalProblems}</span>
            <span className="stat-label">Available Problems</span>
          </div>
        </div>

        {/* Today's Practice Card */}
        <div className="card todays-practice-card">
          <div className="card-header-row">
            <div className="card-header">
              <h3>📅 Recent Activity</h3>
              <p>Your latest submissions.</p>
            </div>
            <span className="view-all-link">{recentSubmissions?.length || 0} Submissions →</span>
          </div>
          <div className="problems-row">
            {recentSubmissions && recentSubmissions.length > 0 ? (
              recentSubmissions.slice(0, 3).map((sub) => (
                <div className="problem-item" key={sub.id}>
                  <div className="problem-info">
                    <h4>{sub.problem || 'Unknown'}</h4>
                    <div className="tags">
                      {getVerdictBadge(sub.verdict)}
                    </div>
                  </div>
                  <span className="status-in-progress">{formatDate(sub.createdAt)}</span>
                </div>
              ))
            ) : (
              <p style={{ color: '#64748b', fontSize: '13px', padding: '12px' }}>No submissions yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* Bottom Section: Daily Practice Statistics */}
      <section className="daily-practice-section">
        <div className="section-header-row">
          <div className="section-title">
            <h3>📈 Practice Stats</h3>
            <p>Your overall practice statistics</p>
          </div>
          <div className="filter-tabs">
            <button className="tab active">Today</button>
            <button className="tab">This Week</button>
            <button className="tab">This Month</button>
            <button className="tab">All Time</button>
          </div>
        </div>

        {/* Stats Metric Cards */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon red">📝</div>
            <div className="metric-data">
              <h2>{totalProblems}</h2>
              <p>Total Problems</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon blue">✔️</div>
            <div className="metric-data">
              <h2>{solvedProblems}</h2>
              <p>Solved</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon pink">🎯</div>
            <div className="metric-data">
              <h2>{attemptedProblems}</h2>
              <p>Attempted</p>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon purple">📊</div>
            <div className="metric-data">
              <h2>{accuracy}%</h2>
              <p>Accuracy</p>
            </div>
          </div>
        </div>

        {/* Progress Overview & Keep Going Card */}
        <div className="bottom-analytics-grid">
          <div className="card progress-overview">
            <h3>Progress Overview</h3>
            <div className="overview-row">
              <span>Total Problems</span>
              <div className="bar-track"><div className="bar-fill red" style={{ width: '100%' }}></div></div>
              <span className="val">{totalProblems}</span>
            </div>
            <div className="overview-row">
              <span>Solved</span>
              <div className="bar-track"><div className="bar-fill blue" style={{ width: `${totalProblems > 0 ? Math.round((solvedProblems / totalProblems) * 100) : 0}%` }}></div></div>
              <span className="val">{solvedProblems}</span>
            </div>
            <div className="overview-row">
              <span>Attempted</span>
              <div className="bar-track"><div className="bar-fill orange" style={{ width: `${totalProblems > 0 ? Math.round((attemptedProblems / totalProblems) * 100) : 0}%` }}></div></div>
              <span className="val">{attemptedProblems}</span>
            </div>
          </div>

          <div className="card circular-progress-card">
            <div className="circular-chart-container">
              <div className="circular-ring">
                <span className="circle-percent">{completionRate}%</span>
                <span className="circle-label">Overall Progress</span>
              </div>
            </div>
          </div>

          <div className="card motivation-card">
            <div className="motivate-header">
              <span className="trophy">🏆</span>
              <h3>Keep Going! 🚀</h3>
            </div>
            <p>
              {solvedProblems} solved out of {totalProblems} problems ({completionRate}%). Keep up the momentum!
            </p>
            <button className="secondary-btn">View Performance →</button>
          </div>
        </div>
      </section>
    </div>
  );
}
