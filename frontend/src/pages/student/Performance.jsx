import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Performance.css';
import Spinner from '../../components/ui/Spinner';
import { getStudentProblems, getStudentSubmissions } from '../../api/student';

export default function Performance() {
  const navigate = useNavigate();
  const [trendTab, setTrendTab] = useState('30D');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problems, setProblems] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [probsRes, subsRes] = await Promise.all([
        getStudentProblems(),
        getStudentSubmissions(),
      ]);
      setProblems(probsRes.data?.data || []);
      setSubmissions(subsRes.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived statistics (before early returns to satisfy Rules of Hooks)
  const total = problems.length;
  const solved = problems.filter(p => p.progress === 'SOLVED').length;
  const attempted = problems.filter(p => p.progress === 'ATTEMPTED').length;
  const remaining = total - solved;
  const overallPercent = total > 0 ? Math.round((solved / total) * 100) : 0;

  // Topic performance
  const topicStats = useMemo(() => {
    const map = {};
    problems.forEach(p => {
      const topic = p.topic || 'General';
      if (!map[topic]) map[topic] = { total: 0, solved: 0 };
      map[topic].total += 1;
      if (p.progress === 'SOLVED') map[topic].solved += 1;
    });
    return Object.entries(map).map(([topic, d]) => ({
      topic,
      total: d.total,
      solved: d.solved,
      percent: d.total > 0 ? Math.round((d.solved / d.total) * 100) : 0,
    }));
  }, [problems]);

  // Difficulty performance
  const difficultyStats = useMemo(() => {
    const map = {};
    problems.forEach(p => {
      const diff = p.difficulty || 'UNKNOWN';
      if (!map[diff]) map[diff] = { total: 0, solved: 0 };
      map[diff].total += 1;
      if (p.progress === 'SOLVED') map[diff].solved += 1;
    });
    return Object.entries(map).map(([diff, d]) => ({
      difficulty: diff,
      total: d.total,
      solved: d.solved,
      percent: d.total > 0 ? Math.round((d.solved / d.total) * 100) : 0,
    }));
  }, [problems]);

  // Today's problems
  const todaysProblems = useMemo(() => problems.filter(p => p.progress !== 'SOLVED').slice(0, 5), [problems]);

  // Recent activity derived from submissions
  const recentActivity = useMemo(() => {
    if (!submissions || submissions.length === 0) return [];
    return submissions.slice(0, 5).map(sub => {
      const prob = sub.problem || {};
      const solved = sub.verdict === 'ACCEPTED';
      return {
        title: solved ? `Solved ${prob.title || 'Problem'}` : `Attempted ${prob.title || 'Problem'}`,
        meta: `${prob.topic || 'General'} • ${prob.difficulty || 'Easy'}`,
        time: new Date(sub.createdAt).toLocaleString(),
        type: solved ? 'solved' : 'attempted',
      };
    });
  }, [submissions]);

  // Trend data derived from real submissions
  const trendData = useMemo(() => {
    if (!submissions || submissions.length === 0) return [];
    const map = {};
    const sorted = [...submissions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    sorted.forEach(sub => {
      const d = new Date(sub.createdAt);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!map[dateStr]) map[dateStr] = { date: dateStr, solved: 0, attempted: 0 };
      map[dateStr].attempted += 1;
      if (sub.verdict === 'ACCEPTED') {
        map[dateStr].solved += 1;
      }
    });
    return Object.values(map);
  }, [submissions]);

  // Generate SVG path strings for solved and attempted series
  const { solvedPath, attemptedPath, maxVal, len } = useMemo(() => {
    if (trendData.length === 0) return { solvedPath: '', attemptedPath: '', maxVal: 1, len: 0 };
    const maxVal = Math.max(...trendData.map(d => Math.max(d.solved, d.attempted)), 1);
    const pointsSolved = [];
    const pointsAttempted = [];
    const len = trendData.length;
    trendData.forEach((d, i) => {
      const x = len === 1 ? 350 : (i / (len - 1)) * 700;
      const ySolved = 160 - (d.solved / maxVal) * 120;
      const yAttempted = 160 - (d.attempted / maxVal) * 120;
      pointsSolved.push(`${x},${ySolved}`);
      pointsAttempted.push(`${x},${yAttempted}`);
    });
    const solvedPath = `M ${pointsSolved.join(' L ')}`;
    const attemptedPath = `M ${pointsAttempted.join(' L ')}`;
    return { solvedPath, attemptedPath, maxVal, len };
  }, [trendData]);

  if (loading) return <div className="perf-container" style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>;
  if (error) return <div className="perf-container" style={{ color: 'red', padding: '24px' }}>{error}</div>;

  const getStatusClass = (progress) => {
    if (progress === 'SOLVED') return 'solved';
    if (progress === 'ATTEMPTED') return 'attempted';
    return 'not-started';
  };

  return (
    <div className="perf-container">
      {/* Header */}
      <header className="perf-header">
        <div className="perf-title-area">
          <h1>Performance</h1>
          <p>Track your coding progress, consistency, and problem-solving growth.</p>
        </div>
        <div className="perf-header-right">
          <button className="date-filter-dropdown">
            <span>📅 All Time</span>
            <span className="arrow">▾</span>
          </button>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="perf-hero-banner">
        <div className="overall-perf-box">
          <span className="box-tag">Overall Performance</span>
          <div className="perf-number-row">
            <h2>{overallPercent}%</h2>
            <div className="trend-badge">
              <span>Live Progress</span>
              <small>Based on accessible problems</small>
            </div>
          </div>
          <div className="main-progress-track">
            <div className="main-progress-fill" style={{ width: `${overallPercent}%` }}></div>
          </div>
          <span className="goals-achieved-text">{solved} of {total} practice goals achieved</span>
        </div>

        <div className="hero-motivation-card">
          <div className="hero-msg">
            <h3>Keep going!</h3>
            <p>Your consistency and problem-solving skills are improving steadily.</p>
            <button className="continue-practice-btn" onClick={() => navigate('/student/problems')}>Continue Practice <span className="arrow-icon">→</span></button>
          </div>
          <div className="hero-graphics">
            <div className="purple-code-box"><span className="code-symbol">&lt;/&gt;</span></div>
            <div className="quote-bubble"><span className="red-quote">“</span><p>Practice turns effort into expertise.</p></div>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="metrics-5-grid">
        <div className="metric-box"><div className="icon red">📝</div><div className="info"><h2>{total}</h2><p>Total Problems</p></div></div>
        <div className="metric-box"><div className="icon blue">✔️</div><div className="info"><h2>{solved}</h2><p>Solved</p></div><div className="mini-bottom-bar"><div className="fill blue" style={{ width: `${overallPercent}%` }}></div></div><span className="mini-pct">{overallPercent}%</span></div>
        <div className="metric-box"><div className="icon purple">🎯</div><div className="info"><h2>{attempted}</h2><p>Attempted</p></div><div className="mini-bottom-bar"><div className="fill purple" style={{ width: `${attempted > 0 ? Math.round((attempted / total) * 100) : 0}%` }}></div></div><span className="mini-pct">{attempted > 0 ? Math.round((attempted / total) * 100) : 0}%</span></div>
        <div className="metric-box"><div className="icon orange">⏳</div><div className="info"><h2>{remaining}</h2><p>Remaining</p></div><div className="mini-bottom-bar"><div className="fill orange" style={{ width: `${remaining > 0 ? Math.round((remaining / total) * 100) : 0}%` }}></div></div><span className="mini-pct">{remaining > 0 ? Math.round((remaining / total) * 100) : 0}%</span></div>
        <div className="metric-box"><div className="icon dark-blue">⏱️</div><div className="info"><h2 title="Backend data gap — practice duration not tracked">N/A</h2><p>Practice Time</p></div></div>
      </section>

      {/* Middle Grid */}
      <div className="analytics-middle-grid">
        {/* Performance Trend Chart */}
        <div className="card trend-card">
          <div className="card-header-flex">
            <div>
              <h3>Performance Trend</h3>
              <p>Problems solved and attempted over time.</p>
            </div>
            <div className="time-tabs">
              <button className={trendTab === '7D' ? 'active' : ''} onClick={() => setTrendTab('7D')}>7D</button>
              <button className={trendTab === '30D' ? 'active' : ''} onClick={() => setTrendTab('30D')}>30D</button>
              <button className={trendTab === '90D' ? 'active' : ''} onClick={() => setTrendTab('90D')}>90D</button>
              <button className={trendTab === 'All Time' ? 'active' : ''} onClick={() => setTrendTab('All Time')}>All Time</button>
            </div>
          </div>
          <div className="chart-container">
            {trendData.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No submission history for trend analysis yet.
              </div>
            ) : (
              <>
                <div className="chart-y-axis"><span>15</span><span>10</span><span>5</span><span>0</span></div>
                <div className="chart-graph-area">
                  <div className="grid-line"></div><div className="grid-line"></div><div className="grid-line"></div><div className="grid-line"></div>
                  <svg className="trend-svg" viewBox="0 0 700 160" preserveAspectRatio="none">
                    <path className="trend-path-attempted" d={attemptedPath} />
                    <path className="trend-path-solved" d={solvedPath} />
                  </svg>
                  <div className="chart-points">
                    {trendData.map((d, i) => {
                      const x = len === 1 ? 350 : (i / (len - 1)) * 700;
                      const ySolved = 160 - (d.solved / maxVal) * 120;
                      const yAttempted = 160 - (d.attempted / maxVal) * 120;
                      return (
                        <React.Fragment key={i}>
                          <div className="pt solved" style={{ left: `${(x / 700) * 100}%`, top: `${(ySolved / 160) * 100}%` }}></div>
                          <div className="pt attempted" style={{ left: `${(x / 700) * 100}%`, top: `${(yAttempted / 160) * 100}%` }}></div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="chart-x-axis">
            {trendData.length > 0 ? trendData.slice(-7).map((d, i) => <span key={i}>{d.date}</span>) : (<span>No Data</span>)}
          </div>
          <div className="chart-legend"><span className="legend-item"><span className="dot blue"></span> Solved</span><span className="legend-item"><span className="dot pink"></span> Attempted</span></div>
        </div>

        {/* Side Performance Stack */}
        <div className="side-performance-stack">
          {/* Topic Performance */}
          <div className="card topic-perf-card">
            <div className="card-header-flex"><div><h3>Topic Performance</h3><p>Your success rate by topic.</p></div></div>
            <div className="topic-bars-list">
              {topicStats.map((t, idx) => (
                <div className="topic-row" key={idx}>
                  <div className="topic-info-left"><strong>{t.topic}</strong><span>{t.solved} / {t.total} solved</span></div>
                  <div className="topic-bar-wrap"><div className="fill blue" style={{ width: `${t.percent}%` }}></div></div>
                  <span className="pct-val">{t.percent}%</span>
                </div>
              ))}
            </div>
            <button className="view-all-topics-link" onClick={() => navigate('/student/problems')}>View All Topics →</button>
          </div>

          {/* Difficulty Performance */}
          <div className="card diff-perf-card">
            <h3>Difficulty Performance</h3>
            <p className="sub">Your success rate by difficulty level.</p>
            <div className="diff-rows">
              {difficultyStats.map((d, idx) => (
                <div className="diff-row" key={idx}>
                  <div className="d-left"><strong>{d.difficulty}</strong><span>{d.solved} / {d.total} solved</span></div>
                  <div className="d-bar"><div className="fill green" style={{ width: `${d.percent}%` }}></div></div>
                  <span className="d-pct">{d.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="analytics-bottom-grid">
        {/* Today's Performance Section */}
        <div className="card todays-perf-section">
          <div className="card-header-flex">
            <div className="title-with-icon">
              <div className="sec-icon red">📅</div>
              <div>
                <h3>Today&apos;s Performance <span className="date-pill">{new Date().toLocaleDateString()}</span></h3>
                <p>Your progress on accessible problems.</p>
              </div>
            </div>
          </div>
          <div className="mini-stats-row-4">
            <div className="mini-stat"><span className="icon">📝</span><div><strong>{total}</strong><span>Total</span></div></div>
            <div className="mini-stat"><span className="icon">✔️</span><div><strong>{solved}</strong><span>Solved</span></div></div>
            <div className="mini-stat"><span className="icon">⏳</span><div><strong>{attempted}</strong><span>Attempted</span></div></div>
            <div className="mini-stat"><span className="icon">🎯</span><div><strong>{remaining}</strong><span>Remaining</span></div></div>
            <div className="donut-stat-box"><div className="donut-circle"><span className="donut-num">{overallPercent}%</span></div><span className="donut-label">{solved} of {total} completed</span></div>
          </div>
          <div className="table-responsive">
            <table className="perf-table">
              <thead><tr><th>#</th><th>Problem</th><th>Topic</th><th>Difficulty</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {todaysProblems.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="id-col">{idx + 1}</td>
                    <td className="bold-col">{item.title}</td>
                    <td><span className="tag blue-tag">{item.topic || 'General'}</span></td>
                    <td><span className={`tag ${item.difficulty?.toLowerCase()}-tag`}>{item.difficulty}</span></td>
                    <td><span className={`status-pill ${getStatusClass(item.progress)}`}>{item.progress}</span></td>
                    <td><button className="table-action-btn" onClick={() => navigate(`/student/problems/${item.id}`)}>Review →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column */}
        <div className="right-stack">
          {/* Recent Activity */}
          <div className="card recent-activity-card">
            <div className="card-header-flex">
              <div className="title-with-icon"><div className="sec-icon red">⚡</div><h3>Recent Activity</h3></div>
              <button className="view-all-btn" onClick={() => navigate('/student/submissions')}>View All →</button>
            </div>
            <div className="activity-list">
              {recentActivity.length > 0 ? recentActivity.map((act, i) => (
                <div className="activity-item" key={i}>
                  <div className={`act-icon-bullet ${act.type}`}>✓</div>
                  <div className="act-details"><h4>{act.title}</h4><p>{act.meta}</p></div>
                  <span className="act-time">{act.time}</span>
                </div>
              )) : <div className="activity-item"><p>No recent activity yet.</p></div>}
            </div>
          </div>

          {/* Areas to Improve */}
          <div className="card areas-improve-card">
            <div className="card-header-flex"><div className="title-with-icon"><div className="sec-icon red">🎯</div><div><h3>Areas to Improve</h3><p>Focus on these areas to grow faster.</p></div></div></div>
            <div className="improvement-list">
              {difficultyStats.filter(d => d.percent < 70).map((d, i) => (
                <div className="improve-item" key={i}>
                  <div className="imp-icon orange">📊</div>
                  <div className="imp-content">
                    <h4>{d.difficulty}</h4>
                    <p>Your success rate on {d.difficulty.toLowerCase()} problems is {d.percent}%. Try solving more {d.difficulty.toLowerCase()}-level problems.</p>
                    <button className="imp-action-btn" onClick={() => navigate(`/student/problems?difficulty=${d.difficulty}`)}>Practice {d.difficulty} →</button>
                  </div>
                </div>
              ))}
              {topicStats.filter(t => t.percent < 60).map((t, i) => (
                <div className="improve-item" key={i + 100}>
                  <div className="imp-icon purple">📚</div>
                  <div className="imp-content">
                    <h4>{t.topic}</h4>
                    <p>You&apos;ve solved {t.solved} out of {t.total} {t.topic.toLowerCase()} problems. Practice more to improve.</p>
                    <button className="imp-action-btn" onClick={() => navigate(`/student/problems?topic=${encodeURIComponent(t.topic)}`)}>Practice {t.topic} →</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
