import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import { getTrainerBatches, getTrainerAnalytics } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Icon from '../../components/ui/Icon';
import '../../styles/pages/trainer-dashboard.css';

export default function TrainerDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const batchesRes = await getTrainerBatches();
        const batchList = batchesRes.data?.data || [];
        setBatches(batchList);
        if (batchList.length > 0) {
          const initialBatchId = batchList[0].id;
          setSelectedBatchId(initialBatchId);
          await loadAnalytics(initialBatchId);
        }
      } catch (err) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const loadAnalytics = async (batchId) => {
    try {
      const res = await getTrainerAnalytics({ batchId });
      setAnalytics(res.data?.data);
    } catch (err) {
      setError('Failed to load analytics.');
    }
  };

  const handleBatchChange = async (e) => {
    const newBatchId = e.target.value;
    setSelectedBatchId(newBatchId);
    await loadAnalytics(newBatchId);
  };

  if (loading) return <Spinner />;
  if (error) return <div>{error}</div>;

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  return (
    <div className="trainer-dashboard">
      <header className="trainer-dashboard__header">
        <h1 className="trainer-dashboard__title">Trainer Dashboard</h1>
        <p className="trainer-dashboard__description">Manage your batches, training, problems, and student progress.</p>
        <div className="trainer-dashboard__context">
          {batches.length > 1 ? (
            <select value={selectedBatchId} onChange={handleBatchChange}>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : (
            <span>Batch: {selectedBatch?.name || 'No batch'}</span>
          )}
        </div>
      </header>

      {analytics && (
        <section className="trainer-dashboard__kpi-grid">
          <Card className="trainer-dashboard__stat-card">
            <div className="trainer-dashboard__stat-header">
              <span className="trainer-dashboard__stat-label">Active Students</span>
              <Icon name="users" />
            </div>
            <div className="trainer-dashboard__stat-value">{analytics.kpis.activeStudents}</div>
          </Card>
          <Card className="trainer-dashboard__stat-card">
            <div className="trainer-dashboard__stat-header">
              <span className="trainer-dashboard__stat-label">Problems Assigned</span>
              <Icon name="fileCode" />
            </div>
            <div className="trainer-dashboard__stat-value">{analytics.kpis.assignedProblems}</div>
          </Card>
          <Card className="trainer-dashboard__stat-card">
            <div className="trainer-dashboard__stat-header">
              <span className="trainer-dashboard__stat-label">Completion Rate</span>
              <Icon name="barChart" />
            </div>
            <div className="trainer-dashboard__stat-value">{analytics.kpis.completionRate}%</div>
          </Card>
        </section>
      )}

      {selectedBatch && (
        <section className="trainer-dashboard__section">
          <h2>Batch Overview</h2>
          <p>{selectedBatch.name} • {selectedBatch.status}</p>
          <p>{analytics?.kpis.activeStudents} active of {selectedBatch.studentCount} enrolled</p>
          <Link to={`/trainer/batches/${selectedBatch.id}`} className="btn btn-secondary">View Batch</Link>
        </section>
      )}

      <section className="trainer-dashboard__section">
        <h2>Quick Actions</h2>
        <div className="trainer-dashboard__actions">
          <Link to="/trainer/problems/create" className="btn btn-primary">Add Problem</Link>
          <Link to="/trainer/training" className="btn btn-secondary">Training</Link>
          <Link to="/trainer/students" className="btn btn-secondary">Students</Link>
          <Link to="/trainer/monitoring" className="btn btn-secondary">Monitoring</Link>
        </div>
      </section>
    </div>
  );
}
