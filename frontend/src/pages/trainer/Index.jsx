import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import {
  getTrainerBatches,
  getBatchPerformance,
  getBatchProblems,
} from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';

export default function TrainerDashboard() {
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [totalBatches, setTotalBatches] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [activeStudentsToday, setActiveStudentsToday] = useState(0);
  const [problemsToday, setProblemsToday] = useState([]);
  const [performanceData, setPerformanceData] = useState(null);

  // Load all required data
  useEffect(() => {
    const fetchAll = async () => {
      try {
        // 1️⃣ Load batches
        const batchesRes = await getTrainerBatches();
        const batchList = batchesRes.data?.data || [];
        setBatches(batchList);
        setTotalBatches(batchList.length);
        const totalStu = batchList.reduce(
          (sum, b) => sum + (b.studentCount || 0),
          0
        );
        setTotalStudents(totalStu);

        // Limit to first 5 batches to keep request count low
        const limited = batchList.slice(0, 5);

        // 2️⃣ Load performance for each batch
        const perfPromises = limited.map((b) =>
          getBatchPerformance(b.id)
            .then((r) => ({ batchId: b.id, data: r.data?.data }))
            .catch(() => null)
        );

        // 3️⃣ Load problems for each batch
        const probPromises = limited.map((b) =>
          getBatchProblems(b.id)
            .then((r) => ({ batchId: b.id, data: r.data?.data }))
            .catch(() => null)
        );

        const [perfResults, probResults] = await Promise.all([
          Promise.all(perfPromises),
          Promise.all(probPromises),
        ]);

        // Aggregate active students (today) from performance data
        const activeSum = perfResults.reduce(
          (sum, p) => (p && p.data?.activeStudents ? sum + p.data.activeStudents : sum),
          0
        );
        setActiveStudentsToday(activeSum);

        // Aggregate problems created today
        const todayStr = new Date().toDateString();
        const todayProblems = [];
        probResults.forEach((res) => {
          if (res && res.data) {
            res.data.forEach((p) => {
              if (new Date(p.createdAt).toDateString() === todayStr) {
                todayProblems.push({ ...p, batchId: res.batchId });
              }
            });
          }
        });
        setProblemsToday(todayProblems.slice(0, 5));

        // Store the first batch performance for a quick snapshot
        const firstPerf = perfResults.find((p) => p && p.data);
        setPerformanceData(firstPerf?.data || null);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }

  // Helper to find batch name by id
  const findBatchName = (id) => {
    const b = batches.find((batch) => batch.id === id);
    return b ? b.name : '—';
  };

  const currentDate = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="trainer-dashboard">
      {/* Page Header */}
      <PageHeader
        title={`Good morning, ${user?.name || ''}`}
        description="Here&#39;s what's happening across your batches today."
        actions={<span>{currentDate}</span>}
      />

      {/* KPI Row */}
      <section className="kpi-row" style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 'var(--space-8)' }}>
        <Card>
          <h3>Total Batches</h3>
          <p>{totalBatches}</p>
        </Card>
        <Card>
          <h3>Total Students</h3>
          <p>{totalStudents}</p>
        </Card>
        {activeStudentsToday > 0 && (
          <Card>
            <h3>Active Students Today</h3>
            <p>{activeStudentsToday}</p>
          </Card>
        )}
        {problemsToday.length > 0 && (
          <Card>
            <h3>Today&#39;s Problems</h3>
            <p>{problemsToday.length}</p>
          </Card>
        )}
      </section>

      {/* Performance Snapshot (first batch) */}
      {performanceData && (
        <section className="performance-snapshot" style={{ marginBottom: 'var(--space-8)' }}>
          <h2>Performance Snapshot</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <Card>
              <h4>Total Students</h4>
              <p>{performanceData.totalStudents}</p>
            </Card>
            <Card>
              <h4>Active Students</h4>
              <p>{performanceData.activeStudents}</p>
            </Card>
            <Card>
              <h4>Total Problems</h4>
              <p>{performanceData.totalProblems}</p>
            </Card>
            <Card>
              <h4>Total Submissions</h4>
              <p>{performanceData.totalSubmissions}</p>
            </Card>
            <Card>
              <h4>Solved Problems</h4>
              <p>{performanceData.solvedProblems}</p>
            </Card>
            <Card>
              <h4>Progress</h4>
              <p>{performanceData.progress}%</p>
            </Card>
          </div>
        </section>
      )}

      {/* Batch Overview */}
      <section className="batch-overview" style={{ marginBottom: 'var(--space-8)' }}>
        <h2>Recent Batches</h2>
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          {batches.slice(0, 5).map((batch) => (
            <Card key={batch.id} variant="interactive">
              <h3>{batch.name}</h3>
              <p>Students: {batch.studentCount || 0}</p>
              {performanceData && (
                <p>Progress: {performanceData.progress}%</p>
              )}
              <Link to={`/trainer/batches/${batch.id}`} className="btn btn-secondary" style={{ marginTop: 'var(--space-2)' }}>
                View
              </Link>
            </Card>
          ))}
        </div>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Link to="/trainer/batches" className="btn btn-primary">
            View All Batches
          </Link>
        </div>
      </section>

      {/* Today's Problems */}
      {problemsToday.length > 0 && (
        <section className="todays-problems" style={{ marginBottom: 'var(--space-8)' }}>
          <h2>Today&#39;s Problems</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Batch</th>
                <th>Difficulty</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {problemsToday.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>{findBatchName(p.batchId)}</td>
                  <td>{p.difficulty}</td>
                  <td>{p.status}</td>
                  <td>
                    <Link to={`/trainer/batches/${p.batchId}/problems/${p.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Quick Actions */}
      <section className="quick-actions" style={{ marginBottom: 'var(--space-8)' }}>
        <h2>Quick Actions</h2>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <Link to="/trainer/batches" className="btn btn-secondary">
            View Batches
          </Link>
          {batches[0] && (
            <Link to={`/trainer/batches/${batches[0].id}/performance`} className="btn btn-secondary">
              View Performance
            </Link>
          )}
          {batches[0] && (
            <Link to={`/trainer/batches/${batches[0].id}/problems`} className="btn btn-secondary">
              View Problems
            </Link>
          )}
          <Link to="/trainer/profile" className="btn btn-secondary">
            Profile
          </Link>
        </div>
      </section>

      {/* Logout */}
      <div style={{ marginTop: 'var(--space-8)' }}>
        <Button onClick={logout} variant="secondary">
          Logout
        </Button>
      </div>
    </div>
  );
}
