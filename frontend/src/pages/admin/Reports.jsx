import React, { useEffect, useState } from 'react';
import { getAdminReportsOverview } from '../../api/admin';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Spinner from '../../components/ui/Spinner';
import Toast from '../../components/ui/Toast';

export default function Reports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAdminReportsOverview();
        setData(res.data?.data || {});
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load reports');
        setToast({ message: err?.response?.data?.message || 'Failed to load reports', type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const renderStats = () => {
    if (!data) return null;
    const items = [
      { label: 'Total Users', value: data.totalUsers },
      { label: 'Active Users', value: data.totalActiveUsers },
      { label: 'Trainers', value: data.totalTrainers },
      { label: 'Students', value: data.totalStudents },
      { label: 'Total Batches', value: data.totalBatches },
      { label: 'Active Batches', value: data.activeBatches },
      { label: 'Total Problems', value: data.totalProblems },
      { label: 'Published Problems', value: data.publishedProblems },
      { label: 'Total Submissions', value: data.totalSubmissions },
      { label: 'Accepted Submissions', value: data.acceptedSubmissions },
    ];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        {items.map((item, idx) => (
          <StatCard key={idx} label={item.label} value={item.value ?? 0} />
        ))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Platform-wide metrics and analytics"
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {loading && <Spinner />}
      {error && <div style={{ color: 'var(--color-danger)' }}>{error}</div>}
      {!loading && !error && renderStats()}
    </>
  );
}
