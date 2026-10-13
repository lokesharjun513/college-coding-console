import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { getTrainerBatches, getTrainerAnalytics } from '../../api/trainer';
import { getTrainerCollections } from '../../api/trainer';
import Icon from '../../components/ui/Icon';
import Spinner from '../../components/ui/Spinner';
import '../../styles/pages/trainer.css';
import '../../styles/pages/trainer-dashboard.css';

export default function TrainerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [collections, setCollections] = useState([]);
  const [recentSubmissions, setRecentSubmissions] = useState([]);
  const [topStudents, setTopStudents] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [batchesRes, collectionsRes] = await Promise.all([
          getTrainerBatches(),
          getTrainerCollections({ limit: 5 })
        ]);
        const batchList = batchesRes.data?.data || [];
        const collectionList = collectionsRes.data?.data || [];
        setBatches(batchList);
        setCollections(collectionList);
        
        if (batchList.length > 0) {
          const initialBatchId = batchList[0].id;
          setSelectedBatchId(initialBatchId);
          await loadDashboardData(initialBatchId, collectionList);
        }
      } catch (err) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const loadDashboardData = async (batchId, collectionList) => {
    try {
      const [analyticsRes] = await Promise.all([
        getTrainerAnalytics({ batchId })
      ]);
      setAnalytics(analyticsRes.data?.data);
      
      // Simulate recent submissions from analytics
      if (analyticsRes.data?.data?.recentSubmissions) {
        setRecentSubmissions(analyticsRes.data.data.recentSubmissions.slice(0, 5));
      }
      
      // Simulate top students from analytics
      if (analyticsRes.data?.data?.leaderboard) {
        setTopStudents(analyticsRes.data.data.leaderboard.slice(0, 5));
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  };

  const handleBatchChange = async (e) => {
    const newBatchId = e.target.value;
    setSelectedBatchId(newBatchId);
    await loadDashboardData(newBatchId, collections);
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '—';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
  };

  if (loading) return <Spinner />;
  if (error) return <div className="trainer-error"><h2>Error</h2><p>{error}</p></div>;

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  return (
    <div className="trainer-dashboard">
      {/* Header */}
      <header className="trainer-dashboard__header">
        <div className="trainer-dashboard__header-content">
          <div className="trainer-dashboard__header-text">
            <p className="trainer-dashboard__eyebrow">Overview</p>
            <h1 className="trainer-dashboard__title">Trainer Dashboard</h1>
            <p className="trainer-dashboard__description">
              Manage your batches, training, problems, and student progress.
            </p>
            {selectedBatch && (
              <div className="trainer-dashboard__context">
                <span className="trainer-eyebrow">Current Batch:</span>
                {batches.length > 1 ? (
                  <select value={selectedBatchId} onChange={handleBatchChange}>
                    {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                ) : (
                  <span>{selectedBatch.name}</span>
                )}
              </div>
            )}
          </div>
          <div className="trainer-dashboard__header-actions">
            <Link to="/trainer/training" className="trainer-btn trainer-btn--secondary">
              <Icon name="play" size={14} />
              Training
            </Link>
            <Link to="/trainer/analytics" className="trainer-btn trainer-btn--secondary">
              <Icon name="barChart" size={14} />
              Analytics
            </Link>
          </div>
        </div>
      </header>

      {/* KPI Grid */}
      {analytics && (
        <div className="trainer-dashboard__kpi-grid">
          <div className="trainer-dashboard__stat-card">
            <div className="trainer-dashboard__stat-header">
              <p className="trainer-dashboard__stat-label">My Batches</p>
              <Icon name="layers" size={16} />
            </div>
            <p className="trainer-dashboard__stat-value">{formatNumber(batches.length)}</p>
            <p className="trainer-dashboard__stat-meta">Total batches assigned</p>
          </div>
          <div className="trainer-dashboard__stat-card">
            <div className="trainer-dashboard__stat-header">
              <p className="trainer-dashboard__stat-label">Total Students</p>
              <Icon name="users" size={16} />
            </div>
            <p className="trainer-dashboard__stat-value">{formatNumber(analytics.kpis?.totalStudents || 0)}</p>
            <p className="trainer-dashboard__stat-meta">Across all batches</p>
          </div>
          <div className="trainer-dashboard__stat-card">
            <div className="trainer-dashboard__stat-header">
              <p className="trainer-dashboard__stat-label">Problems Assigned</p>
              <Icon name="fileCode" size={16} />
            </div>
            <p className="trainer-dashboard__stat-value">{formatNumber(analytics.kpis?.assignedProblems || 0)}</p>
            <p className="trainer-dashboard__stat-meta">Across all batches</p>
          </div>
          <div className="trainer-dashboard__stat-card">
            <div className="trainer-dashboard__stat-header">
              <p className="trainer-dashboard__stat-label">Completion Rate</p>
              <Icon name="barChart" size={16} />
            </div>
            <p className="trainer-dashboard__stat-value">{analytics.kpis?.completionRate?.toFixed(1) || '—'}%</p>
            <p className="trainer-dashboard__stat-meta">Average across all problems</p>
          </div>
        </div>
      )}

      {/* Quick Actions Card */}
      <div className="trainer-dashboard__qa-card">
        <div className="trainer-dashboard__qa-header">
          <h2 className="trainer-dashboard__qa-title">Quick Actions</h2>
          <p className="trainer-dashboard__qa-subtitle">Common tasks for trainers</p>
        </div>
        <div className="trainer-dashboard__qa-grid">
          <button
            type="button"
            className="trainer-dashboard__qa-btn trainer-dashboard__qa-btn--primary"
            onClick={() => navigate('/trainer/problems/create')}
          >
            <span className="trainer-dashboard__qa-icon">
              <Icon name="plus" size={16} />
            </span>
            <span className="trainer-dashboard__qa-label">Create Problem</span>
            <span className="trainer-dashboard__qa-arrow">
              <Icon name="arrowRight" size={14} />
            </span>
          </button>
          <button
            type="button"
            className="trainer-dashboard__qa-btn"
            onClick={() => navigate('/trainer/training')}
          >
            <span className="trainer-dashboard__qa-icon">
              <Icon name="upload" size={16} />
            </span>
            <span className="trainer-dashboard__qa-label">Upload Problems</span>
            <span className="trainer-dashboard__qa-arrow">
              <Icon name="arrowRight" size={14} />
            </span>
          </button>
          <button
            type="button"
            className="trainer-dashboard__qa-btn"
            onClick={() => navigate('/trainer/batches')}
          >
            <span className="trainer-dashboard__qa-icon">
              <Icon name="layers" size={16} />
            </span>
            <span className="trainer-dashboard__qa-label">View My Batches</span>
            <span className="trainer-dashboard__qa-arrow">
              <Icon name="arrowRight" size={14} />
            </span>
          </button>
          <button
            type="button"
            className="trainer-dashboard__qa-btn"
            onClick={() => navigate('/trainer/analytics')}
          >
            <span className="trainer-dashboard__qa-icon">
              <Icon name="trophy" size={16} />
            </span>
            <span className="trainer-dashboard__qa-label">View Leaderboard</span>
            <span className="trainer-dashboard__qa-arrow">
              <Icon name="arrowRight" size={14} />
            </span>
          </button>
        </div>
      </div>

      {/* Data Grid - My Batches & Recent Submissions */}
      <div className="trainer-dashboard__grid-2col">
        {/* My Batches */}
        <section className="trainer-submissions-card">
          <div className="trainer-submissions-header">
            <div className="trainer-submissions-heading">
              <div className="trainer-submissions-icon">
                <Icon name="layers" size={17} />
              </div>
              <div>
                <h2>My Batches</h2>
                <p>Your active and archived batches</p>
              </div>
            </div>
            <button
              type="button"
              className="trainer-view-all-btn"
              onClick={() => navigate('/trainer/batches')}
            >
              <span>View All</span>
              <Icon name="arrowRight" size={12} />
            </button>
          </div>
          <div className="trainer-table-wrapper">
            {batches.length > 0 ? (
              <table className="trainer-table">
                <thead>
                  <tr>
                    <th>Batch Name</th>
                    <th>Status</th>
                    <th>Students</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 5).map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <Link
                          to={`/trainer/batches/${batch.id}`}
                          style={{ color: 'var(--trainer-text-primary)', textDecoration: 'none', fontWeight: '500' }}
                        >
                          {batch.name}
                        </Link>
                      </td>
                      <td>
                        <span className={`trainer-badge trainer-badge--${String(batch.status || '').toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
                          {batch.status || '—'}
                        </span>
                      </td>
                      <td>{batch.studentCount || 0}</td>
                      <td>
                        {batch.createdAt ? new Date(batch.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="trainer-empty">
                <h2>No batches yet</h2>
                <p>Create your first batch to get started</p>
              </div>
            )}
          </div>
        </section>

        {/* Recent Submissions */}
        <section className="trainer-submissions-card">
          <div className="trainer-submissions-header">
            <div className="trainer-submissions-heading">
              <div className="trainer-submissions-icon">
                <Icon name="fileCode" size={17} />
              </div>
              <div>
                <h2>Recent Submissions</h2>
                <p>Latest student activity</p>
              </div>
            </div>
            <button
              type="button"
              className="trainer-view-all-btn"
              onClick={() => navigate('/trainer/monitoring')}
            >
              <span>View All</span>
              <Icon name="arrowRight" size={12} />
            </button>
          </div>
          <div className="trainer-table-wrapper">
            {recentSubmissions.length > 0 ? (
              <table className="trainer-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Problem</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubmissions.map((sub) => (
                    <tr key={sub.id}>
                      <td>
                        <span className="trainer-avatar trainer-avatar--student">
                          {sub.studentName?.charAt(0) || 'S'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'left' }}>{sub.problemName || '—'}</td>
                      <td>
                        <span className={`trainer-badge trainer-badge--${sub.status === 'ACCEPTED' ? 'active' : 'inactive'}`}>
                          {sub.status || '—'}
                        </span>
                      </td>
                      <td>{sub.timeAgo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="trainer-empty">
                <h2>No submissions yet</h2>
                <p>Student activity will appear here</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Top Performing Students / Leaderboard */}
      <section className="trainer-leaderboard-card">
        <div className="trainer-leaderboard-header">
          <div className="trainer-leaderboard-heading">
            <div className="trainer-leaderboard-icon">
              <Icon name="trophy" size={17} />
            </div>
            <div>
              <h2>Top Performing Students</h2>
              <p>Leaderboard preview</p>
            </div>
          </div>
          <button
            type="button"
            className="trainer-view-all-btn"
            onClick={() => navigate('/trainer/analytics')}
          >
            <span>View All</span>
            <Icon name="arrowRight" size={12} />
          </button>
        </div>
        <div className="trainer-table-wrapper">
          {topStudents.length > 0 ? (
            <table className="trainer-leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Problems Solved</th>
                  <th>Avg. Time</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {topStudents.map((student, idx) => (
                  <tr key={student.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                        <span className="trainer-avatar trainer-avatar--student">
                          {student.name?.charAt(0) || 'S'}
                        </span>
                        <span style={{ textAlign: 'left' }}>{student.name || '—'}</span>
                      </div>
                    </td>
                    <td>{formatNumber(student.problemsSolved || 0)}</td>
                    <td>{student.avgTime || '—'}</td>
                    <td>{student.accuracy?.toFixed(0) || '—'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="trainer-empty">
              <h2>No leaderboard data yet</h2>
              <p>Student performance will appear here</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
