import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTrainerBatches } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import DataTable from '../../components/ui/DataTable';

export default function BatchesList() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTrainerBatches();
      setBatches(res.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filtered = batches.filter(
    (b) =>
      (b.name && b.name.toLowerCase().includes(search.toLowerCase())) ||
      (b.code && b.code.toLowerCase().includes(search.toLowerCase()))
  );

  const totalBatches = filtered.length;
  const totalStudents = filtered.reduce((sum, b) => sum + (b.studentCount || 0), 0);

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <EmptyState
        message={error}
        actionLabel="Retry"
        onAction={fetchData}
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        message="No batches assigned yet."
        actionLabel="Refresh"
        onAction={fetchData}
      />
    );
  }

  // Table columns for desktop view
  const columns = [
    {
      key: 'name',
      header: 'Batch',
      formatter: (value, row) => (
        <>
          <div>{row.name}</div>
          {row.code && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-muted)' }}>{row.code}</div>
          )}
        </>
      ),
    },
    { key: 'studentCount', header: 'Students', align: 'center' },
    {
      key: 'problems',
      header: 'Problems',
      formatter: () => '—',
      align: 'center',
    },
    {
      key: 'performance',
      header: 'Performance',
      formatter: () => '—',
      align: 'center',
    },
    {
      key: 'action',
      header: '',
      formatter: (_, row) => (
        <Link to={`/trainer/batches/${row.id}`} className="btn btn-secondary">
          View
        </Link>
      ),
      align: 'center',
    },
  ];

  return (
    <div className="trainer-batches-page" style={{ padding: 'var(--space-8)' }}>
      <PageHeader
        title="Batches"
        description="Manage and monitor the batches assigned to you."
      />
      {/* Summary Strip */}
      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 'var(--space-8)' }}>
        <Card>
          <h3>Total Batches</h3>
          <p>{totalBatches}</p>
        </Card>
        <Card>
          <h3>Total Students</h3>
          <p>{totalStudents}</p>
        </Card>
      </div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search batches..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search batches"
          style={{
            flex: '1 1 200px',
            padding: 'var(--space-2)',
            border: `1px solid var(--border-subtle)`,
            borderRadius: 'var(--radius-md)',
          }}
        />
      </div>
      {/* Content */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filtered.map((batch) => (
            <Card key={batch.id} variant="interactive">
              <h3>{batch.name}</h3>
              {batch.code && <p style={{ color: 'var(--color-muted)' }}>{batch.code}</p>}
              <p>Students: {batch.studentCount}</p>
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Link to={`/trainer/batches/${batch.id}`} className="btn btn-secondary">
                  View Batch
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          error={null}
          emptyMessage="No batches found."
        />
      )}
    </div>
  );
}
