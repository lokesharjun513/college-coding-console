import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Practice.css';
import Spinner from '../../components/ui/Spinner';
import { getStudentProblems } from '../../api/student';

// Helper to deduplicate problem arrays by canonical ID (_id or id)
const dedupeById = (arr) => {
  const map = new Map();
  arr.forEach((item) => {
    const id = item.id || item._id;
    if (id && !map.has(id)) {
      map.set(id, item);
    }
  });
  return Array.from(map.values());
};

export default function Practice() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problems, setProblems] = useState([]);

  // Filters
  const [difficultyFilter, setDifficultyFilter] = useState('ALL');
  const [topicFilter, setTopicFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    const fetchPracticeProblems = async () => {
      try {
        setLoading(true);
        const res = await getStudentProblems();
        // Deduplicate the problem list by canonical ID.
        setProblems(dedupeById(res.data?.data || []));
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load practice problems.');
      } finally {
        setLoading(false);
      }
    };
    fetchPracticeProblems();
  }, []);

  if (loading && problems.length === 0) {
    return <div className="practice-container" style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>;
  }

  if (error && problems.length === 0) {
    return <div className="practice-container" style={{ color: 'red', padding: '24px' }}>{error}</div>;
  }

  const filteredProblems = problems.filter((item) => {
    const matchesDiff = difficultyFilter === 'ALL' || item.difficulty === difficultyFilter;
    const matchesTopic = topicFilter === 'ALL' || item.topic === topicFilter;
    const matchesStatus = statusFilter === 'ALL' || item.progress === statusFilter;
    return matchesDiff && matchesTopic && matchesStatus;
  });

  const totalCount = problems.length;
  const solvedCount = problems.filter(p => p.progress === 'SOLVED').length;
  const remainingCount = totalCount - solvedCount;
  const solvedPercentage = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;
  const remainingPercentage = totalCount > 0 ? 100 - solvedPercentage : 0;

  const getStatusClass = (progress) => {
    if (progress === 'SOLVED') return 'solved';
    if (progress === 'ATTEMPTED') return 'attempted';
    return 'not-started';
  };

  const getStatusLabel = (progress) => {
    if (progress === 'SOLVED') return 'Solved';
    if (progress === 'ATTEMPTED') return 'Attempted';
    return 'Not Started';
  };

  const getDiffClass = (diff) => {
    if (!diff) return 'easy';
    const d = diff.toLowerCase();
    if (d.includes('easy')) return 'easy';
    if (d.includes('med')) return 'medium';
    return 'hard';
  };

  return (
    <div className="practice-container">
      {/* Top Hero Section */}
      <header className="practice-hero">
        <div className="hero-top-row">
          <div className="hero-text-content">
            <h1 className="practice-title">Practice</h1>
            <p className="practice-subtitle">
              Explore problems from the global practice library and improve your coding skills.
            </p>
          </div>

          <div className="hero-banner-group">
            <div className="banner-illustration-purple">
              <span className="code-icon-text">&lt;/&gt;</span>
            </div>
            <div className="quote-box">
              <span className="quote-mark">“</span>
              <p className="quote-text">Practice today builds the expert you&apos;ll become tomorrow.</p>
            </div>
          </div>
        </div>

        {/* 3-Column Metric Cards Row */}
        <div className="hero-metrics-row">
          <div className="metric-box">
            <div className="m-icon red">📝</div>
            <div className="m-info">
              <h2>{totalCount}</h2>
              <p>Total Problems</p>
            </div>
          </div>
          <div className="metric-box">
            <div className="m-icon blue">✔️</div>
            <div className="m-info">
              <h2>{solvedCount}</h2>
              <p>Solved</p>
            </div>
            <div className="m-progress-bar"><div className="fill blue" style={{ width: `${solvedPercentage}%` }}></div></div>
            <span className="m-percent">{solvedPercentage}%</span>
          </div>
          <div className="metric-box">
            <div className="m-icon pink">🎯</div>
            <div className="m-info">
              <h2>{remainingCount}</h2>
              <p>Remaining</p>
            </div>
            <div className="m-progress-bar"><div className="fill pink" style={{ width: `${remainingPercentage}%` }}></div></div>
            <span className="m-percent">{remainingPercentage}%</span>
          </div>
        </div>
      </header>

      {/* Filter Options Bar */}
      <div className="filter-bar">
        <div className="difficulty-tabs">
          <button className={`d-tab ${difficultyFilter === 'ALL' ? 'active' : ''}`} onClick={() => setDifficultyFilter('ALL')}>All Problems</button>
          <button className={`d-tab ${difficultyFilter === 'EASY' ? 'active' : ''}`} onClick={() => setDifficultyFilter('EASY')}>Easy</button>
          <button className={`d-tab ${difficultyFilter === 'MEDIUM' ? 'active' : ''}`} onClick={() => setDifficultyFilter('MEDIUM')}>Medium</button>
          <button className={`d-tab ${difficultyFilter === 'HARD' ? 'active' : ''}`} onClick={() => setDifficultyFilter('HARD')}>Hard</button>
        </div>
        <div className="dropdown-filters">
          <select className="filter-select" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
            <option value="ALL">All Topics</option>
            {Array.from(new Set(problems.map(p => p.topic).filter(Boolean))).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="SOLVED">Solved</option>
            <option value="ATTEMPTED">Attempted</option>
            <option value="NOT_STARTED">Not Started</option>
          </select>
        </div>
      </div>

      {/* Global Practice Table Section */}
      <section className="table-card">
        <div className="table-header-info">
          <div className="table-title-wrap">
            <h3>🌐 Global Practice</h3>
            <p>Practice additional problems beyond your assigned work.</p>
          </div>
          <span className="total-problems-badge">{filteredProblems.length} Problems</span>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Problem</th>
                <th>Topic</th>
                <th>Difficulty</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProblems.length > 0 ? (
                filteredProblems.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="id-col">{idx + 1}</td>
                    <td>
                      <span className={`status-badge ${getStatusClass(item.progress)}`}>
                        {item.progress === 'SOLVED' && '✔ '}
                        {item.progress === 'ATTEMPTED' && '⏳ '}
                        {item.progress === 'NOT_STARTED' && '⏱ '}
                        {getStatusLabel(item.progress)}
                      </span>
                    </td>
                    <td className="problem-col">
                      <span className="p-title">{item.title}</span>
                      <span className="p-desc">{item.description}</span>
                    </td>
                    <td>
                      <span className={`tag array`}>{item.topic || 'General'}</span>
                    </td>
                    <td>
                      <span className={`tag ${getDiffClass(item.difficulty)}`}>{item.difficulty}</span>
                    </td>
                    <td>
                      <button className="action-btn" onClick={() => navigate(`/student/problems/${item.id}`)}>Practice →</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                    No problems found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
