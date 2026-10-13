import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminLeaderboard } from '../../api/admin';
import '../../styles/pages/admin.css';
import '../../styles/pages/admin-users.css';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import './Leaderboard.css';

export default function LeaderboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminLeaderboard({ offset, limit, search });
      setData(res.data?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load leaderboard');
      setToast({ message: err?.response?.data?.message || 'Failed to load leaderboard', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [offset, limit, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setOffset(0);
  };

  const leaderboard = data?.leaderboard || [];
  const metrics = data?.metrics || { assignedProblems: 0, eligibleStudents: 0 };
  const totalCount = data?.totalCount || 0;

  return (
    <div className="admin-page leaderboard-page">
      {/* Page Header */}
      <div className="admin-page-header">
        <nav className="admin-breadcrumb" aria-label="Breadcrumb">
          <Link to="/admin" className="admin-breadcrumb__item">Home</Link>
          <span className="admin-breadcrumb__separator">/</span>
          <span className="admin-breadcrumb__current" aria-current="page">Global Leaderboard</span>
        </nav>
        <div className="admin-page-header-content">
          <div className="admin-page-header-text">
            <h1 className="admin-page-title">Global Leaderboard</h1>
            <p className="admin-page-description">Ranking students across the entire platform by problem-solving progress.</p>
          </div>
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="admin-dashboard__kpi-grid">
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Total Students</span>
          </div>
          <div className="admin-dashboard__stat-value">{metrics.eligibleStudents}</div>
          <div className="admin-dashboard__stat-meta">Active students ranked</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Assigned Problems</span>
          </div>
          <div className="admin-dashboard__stat-value">{metrics.assignedProblems}</div>
          <div className="admin-dashboard__stat-meta">Published global problems</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <span className="admin-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by student name..."
            value={search}
            onChange={handleSearchChange}
            className="admin-input admin-input--with-icon"
          />
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {loading && (
        <div className="admin-card">
          <div className="admin-table-skeleton" />
        </div>
      )}

      {error && !loading && (
        <div className="admin-error-box">
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={loadData}>Retry</Button>
        </div>
      )}

      {!loading && !error && (
        <div className="admin-card">
          {leaderboard.length === 0 ? (
            <div className="admin-card-empty">
              <EmptyState
                message={search ? 'No students found matching your search' : 'No leaderboard data available yet'}
              />
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Student</th>
                    <th>Problems Solved</th>
                    <th>Assigned</th>
                    <th>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row) => (
                    <tr key={row.studentId}>
                      <td>{row.rank}</td>
                      <td>{row.name}</td>
                      <td>{row.solved}</td>
                      <td>{row.assigned}</td>
                      <td>
                        <div className="progress-bar-container">
                          <span className="progress-text">{row.completionPercentage}%</span>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${row.completionPercentage}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="admin-pagination">
                <div className="admin-pagination-info">
                  Showing {Math.min(offset + 1, totalCount)} - {Math.min(offset + limit, totalCount)} of {totalCount}
                </div>
                <div className="admin-pagination-controls">
                  <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(o => o - limit)}>Previous</Button>
                  <Button variant="secondary" size="sm" disabled={offset + limit >= totalCount} onClick={() => setOffset(o => o + limit)}>Next</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

