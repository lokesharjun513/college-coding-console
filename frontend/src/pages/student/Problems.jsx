import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Problems.css';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { getStudentProblems, getStudentCollections, getStudentCollectionTopics, getStudentTopicProblems } from '../../api/student';

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

export default function Problems() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problems, setProblems] = useState([]);
  const [todayProblems, setTodayProblems] = useState([]);
  const [enrolled, setEnrolled] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, SOLVED, ATTEMPTED, NOT_STARTED
  const [difficultyFilter, setDifficultyFilter] = useState('ALL');
  const [topicFilter, setTopicFilter] = useState('ALL');

  // Collections / Topics view states
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'collections' | 'topics' | 'topic-problems'
  const [collections, setCollections] = useState([]);
  const [topics, setTopics] = useState([]);
  const [topicProblems, setTopicProblems] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);

  useEffect(() => {
    fetchProblems();
  }, []);

  const fetchProblems = async () => {
    try {
      setLoading(true);
      const res = await getStudentProblems();
      // Deduplicate the main problem list by canonical ID.
      const uniqueData = dedupeById(res.data?.data || []);
      setProblems(uniqueData);
      const meta = res.data?.meta || {};
      setEnrolled(meta.enrolled ?? false);
      // Deduplicate today problems by canonical ID (backend returns full problem objects).
      const uniqueToday = dedupeById(meta.today || []);
      setTodayProblems(uniqueToday);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load problems');
    } finally {
      setLoading(false);
    }
  };

  const fetchCollectionsList = async () => {
    try {
      setLoading(true);
      const res = await getStudentCollections();
      setCollections(res.data?.data || []);
      setViewMode('collections');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopicsList = async (collection) => {
    try {
      setSelectedCollection(collection);
      setLoading(true);
      const res = await getStudentCollectionTopics(collection.id);
      setTopics(res.data?.data || []);
      setViewMode('topics');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load topics');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopicProblemsList = async (topic) => {
    try {
      setSelectedTopic(topic);
      setLoading(true);
      const res = await getStudentTopicProblems(topic.id);
      setTopicProblems(res.data?.data || []);
      setViewMode('topic-problems');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load topic problems');
    } finally {
      setLoading(false);
    }
  };

  if (loading && problems.length === 0 && collections.length === 0) {
    return <div className="problems-container" style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>;
  }

  if (error && problems.length === 0) {
    return <div className="problems-container" style={{ color: 'red', padding: '24px' }}>{error}</div>;
  }

  // Not Enrolled Hero
  if (!loading && !enrolled && !error) {
    return (
      <div className="problems-container">
        <section className="not-enrolled-hero">
          <div className="hero-content">
            <h2 className="hero-title">You are not enrolled in a batch</h2>
            <p className="hero-description">Your batch has not been assigned yet. Once you are enrolled, your trainer&apos;s assigned problems will appear here.</p>
            <p className="hero-support">Contact your administrator or trainer to get enrolled.</p>
          </div>
        </section>
      </div>
    );
  }

  // Filter problems for list view
  const filteredProblems = problems.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase()) ||
                          (item.description && item.description.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || item.progress === statusFilter;
    const matchesDiff = difficultyFilter === 'ALL' || item.difficulty === difficultyFilter;
    const matchesTopic = topicFilter === 'ALL' || item.topic === topicFilter;

    return matchesSearch && matchesStatus && matchesDiff && matchesTopic;
  });

  const totalCount = problems.length;
  const solvedCount = problems.filter(p => p.progress === 'SOLVED').length;
  const attemptedCount = problems.filter(p => p.progress === 'ATTEMPTED').length;
  const remainingCount = totalCount - solvedCount;
  const overallProgress = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;

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
    <div className="problems-container">
      {/* Top Header & Navigation Toggle */}
      <header className="top-header-row">
        <div className="title-area">
          <h1>Practice</h1>
          <p>Build your coding skills one problem at a time.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {viewMode !== 'list' ? (
            <Button variant="secondary" onClick={() => { setViewMode('list'); setError(null); }}>← Back to All Problems</Button>
          ) : (
            <Button variant="secondary" onClick={fetchCollectionsList}>View Collections</Button>
          )}
        </div>
      </header>

      {viewMode === 'collections' && (
        <section className="dashboard-section">
          <h2>Practice Collections</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Explore structured problem collections curated for your learning path.</p>
          <div className="horizontal-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {collections.length > 0 ? collections.map((col) => (
              <div className="problem-card-item" key={col.id} onClick={() => fetchTopicsList(col)} style={{ cursor: 'pointer' }}>
                <div className="card-body">
                  <h4>{col.title}</h4>
                  <p>{col.description || 'No description provided.'}</p>
                </div>
                <button className="card-action-btn solved">Explore Topics →</button>
              </div>
            )) : <p>No collections available.</p>}
          </div>
        </section>
      )}

      {viewMode === 'topics' && (
        <section className="dashboard-section">
          <h2>Topics in {selectedCollection?.title}</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Select a topic to view associated practice problems.</p>
          <div className="horizontal-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {topics.length > 0 ? topics.map((topic) => (
              <div className="problem-card-item" key={topic.id} onClick={() => fetchTopicProblemsList(topic)} style={{ cursor: 'pointer' }}>
                <div className="card-body">
                  <h4>{topic.title}</h4>
                  <p>{topic.description || 'Practice core concepts.'}</p>
                </div>
                <button className="card-action-btn solved">View Problems →</button>
              </div>
            )) : <p>No topics found in this collection.</p>}
          </div>
        </section>
      )}

      {viewMode === 'topic-problems' && (
        <section className="dashboard-section">
          <h2>Problems in {selectedTopic?.title}</h2>
          <div className="table-wrapper" style={{ marginTop: '16px' }}>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Problem</th>
                  <th>Difficulty</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {topicProblems.length > 0 ? topicProblems.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td>
                      <span className={`status-badge ${getStatusClass(item.progress)}`}>
                        {getStatusLabel(item.progress)}
                      </span>
                    </td>
                    <td className="problem-col">
                      <span className="p-title">{item.title}</span>
                      <span className="p-desc">{item.description}</span>
                    </td>
                    <td><span className={`tag ${getDiffClass(item.difficulty)}`}>{item.difficulty}</span></td>
                    <td><button className="action-btn" onClick={() => navigate(`/student/problems/${item.id}`)}>Practice →</button></td>
                  </tr>
                )) : <tr><td colSpan="4" style={{ textAlign: 'center', padding: '24px' }}>No problems found for this topic.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {viewMode === 'list' && (
        <>
          {/* Hero Greeting Card */}
          <section className="hero-greeting-card">
            <div className="hero-left">
              <h2>Keep building your coding skills</h2>
              <p>Practice daily to maintain your streak and mastery.</p>
            </div>
            <div className="hero-banner-group">
              <div className="banner-illustration-purple">
                <span className="code-tag">&lt;/&gt;</span>
              </div>
              <div className="quote-box">
                <span className="quote-mark">“</span>
                <p>Practice today builds the expert you&apos;ll become tomorrow.</p>
              </div>
            </div>
          </section>

          {/* Today's Assigned Problems */}
          {todayProblems.length > 0 && (
            <section className="dashboard-section">
              <div className="section-header-flex">
                <div className="section-title-box">
                  <div className="sec-icon red">📅</div>
                  <div>
                    <h3>Today&apos;s Assigned Problems</h3>
                    <p>Problems assigned for today by your trainer.</p>
                  </div>
                </div>
              </div>
              <div className="horizontal-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {todayProblems.map((item) => (
                  <div className="problem-card-item" key={item.id}>
                    <div className="card-body">
                      <h4>{item.title}</h4>
                    </div>
                    <button className="card-action-btn solved" onClick={() => navigate(`/student/problems/${item.id}`)}>Start →</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Your Practice Section / Stats */}
          <section className="dashboard-section">
            <div className="section-header-flex">
              <div className="section-title-box">
                <div className="sec-icon red">🎯</div>
                <div>
                  <h3>Your Practice</h3>
                  <p>Overall coding practice progress.</p>
                </div>
              </div>
            </div>

            <div className="stats-row-4">
              <div className="stat-card">
                <div className="icon red">📝</div>
                <div className="info"><h2>{totalCount}</h2><p>Total Problems</p></div>
              </div>
              <div className="stat-card">
                <div className="icon blue">✔️</div>
                <div className="info"><h2>{solvedCount}</h2><p>Solved</p></div>
              </div>
              <div className="stat-card">
                <div className="icon purple">🎯</div>
                <div className="info"><h2>{attemptedCount}</h2><p>Attempted</p></div>
              </div>
              <div className="stat-card">
                <div className="icon orange">⏳</div>
                <div className="info"><h2>{remainingCount}</h2><p>Remaining</p></div>
              </div>
              <div className="stat-card progress-card">
                <div className="prog-header">
                  <span>Overall Progress</span>
                  <strong>{overallProgress}%</strong>
                </div>
                <div className="prog-track"><div className="prog-fill" style={{ width: `${overallProgress}%` }}></div></div>
                <span className="prog-footer">{solvedCount} of {totalCount} problems completed</span>
              </div>
            </div>
          </section>

          {/* More Practice Table Section */}
          <section className="dashboard-section table-section-box">
            <div className="section-header-flex">
              <div className="section-title-box">
                <div className="sec-icon red">🔥</div>
                <div>
                  <h3>All Practice Problems</h3>
                  <p>Browse and practice available problems.</p>
                </div>
              </div>
              <span className="badge-count">{filteredProblems.length} Problems</span>
            </div>

            {/* Tab Filters & Toolbar */}
            <div className="more-practice-toolbar">
              <div className="status-subtabs">
                <button className={`subtab ${statusFilter === 'ALL' ? 'active' : ''}`} onClick={() => setStatusFilter('ALL')}>All Problems</button>
                <button className={`subtab ${statusFilter === 'NOT_STARTED' ? 'active' : ''}`} onClick={() => setStatusFilter('NOT_STARTED')}>Unsolved Problems</button>
                <button className={`subtab ${statusFilter === 'ATTEMPTED' ? 'active' : ''}`} onClick={() => setStatusFilter('ATTEMPTED')}>Attempted Problems</button>
                <button className={`subtab ${statusFilter === 'SOLVED' ? 'active' : ''}`} onClick={() => setStatusFilter('SOLVED')}>Solved Problems</button>
              </div>
            </div>

            <div className="filter-tools-row">
              <div className="search-input-wrap">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search problems..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select className="filter-select" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="ALL">All Topics</option>
                {Array.from(new Set(problems.map(p => p.topic).filter(Boolean))).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select className="filter-select" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
                <option value="ALL">All Difficulties</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>

              <button className="reset-filters-btn" onClick={() => { setSearch(''); setStatusFilter('ALL'); setDifficultyFilter('ALL'); setTopicFilter('ALL'); }}>Reset Filters</button>
            </div>

            {/* Table */}
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
                          <span className="p-title">{item.title}{todayProblems.some(p => p.id === item.id) ? ' (All)' : ''}</span>
                          <span className="p-desc">{item.description}</span>
                        </td>
                        <td><span className={`tag array`}>{item.topic || 'General'}</span></td>
                        <td><span className={`tag ${getDiffClass(item.difficulty)}`}>{item.difficulty}</span></td>
                        <td><button className="action-btn" onClick={() => navigate(`/student/problems/${item.id}`)}>Practice →</button></td>
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
        </>
      )}
    </div>
  );
}
