import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getTrainerBatch, getBatchPerformance } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';

export default function BatchDetails() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batch, setBatch] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    const fetchBatchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getTrainerBatch(batchId);
        const batchData = res.data?.data;
        if (!batchData) {
          setError('Batch not found');
          return;
        }
        setBatch(batchData);

        // Fetch performance in parallel or subsequent
        try {
          setPerfLoading(true);
          const perfRes = await getBatchPerformance(batchId);
          setPerformance(perfRes.data?.data || null);
        } catch (perfErr) {
          // Performance data optional or unavailable, fail gracefully
          setPerformance(null);
        } finally {
          setPerfLoading(false);
        }
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load batch details');
      } finally {
        setLoading(false);
      }
    };
    if (batchId) {
      fetchBatchData();
    }
  }, [batchId]);

  const getStatusBadgeVariant = (status) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
        return 'success';
      case 'PENDING':
        return 'warning';
      case 'INACTIVE':
      case 'ARCHIVED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 'var(--content-max-width, 1200px)', margin: '0 auto', padding: '32px' }}>
        <Spinner />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div style={{ maxWidth: 'var(--content-max-width, 1200px)', margin: '0 auto', padding: '32px' }}>
        <PageHeader
          title="Batch Details"
          description="Unable to load batch information."
        />
        <Card>
          <EmptyState
            message={error || 'Batch not found.'}
            actionLabel="Back to Batches"
            onAction={() => navigate('/trainer/batches')}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 'var(--content-max-width, 1200px)', margin: '0 auto', padding: '32px' }}>
      {/* Back Navigation & Header */}
      <div style={{ marginBottom: '16px' }}>
        <Link
          to="/trainer/batches"
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary, #5c6b73)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
          }}
        >
          &larr; Back to Batches
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink, #0F2441)', margin: 0 }}>
              {batch.name}
            </h1>
            {batch.status && (
              <Badge variant={getStatusBadgeVariant(batch.status)}>
                {batch.status}
              </Badge>
            )}
          </div>
          <p style={{ fontSize: '14px', color: 'rgba(15, 36, 65, 0.62)', margin: 0 }}>
            {batch.description || `Batch code: ${batch.code || 'N/A'}`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            onClick={() => navigate(`/trainer/batches/${batchId}/students`)}
          >
            Manage Students
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate(`/trainer/batches/${batchId}/problems/create`)}
          >
            Create Problem
          </Button>
        </div>
      </div>

      {/* KPI / Summary Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <Card>
          <div style={{ fontSize: '13px', color: 'rgba(15, 36, 65, 0.58)', fontWeight: 500, marginBottom: '8px' }}>
            Enrolled Students
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink, #0F2441)' }}>
            {batch.studentCount ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.48)', marginTop: '4px' }}>
            Active roster count
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '13px', color: 'rgba(15, 36, 65, 0.58)', fontWeight: 500, marginBottom: '8px' }}>
            Batch Code
          </div>
          <div style={{ fontSize: '22px', fontWeight: 650, color: 'var(--color-ink, #0F2441)', fontFamily: 'var(--font-mono, monospace)' }}>
            {batch.code || '—'}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.48)', marginTop: '4px' }}>
            Unique identifier
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '13px', color: 'rgba(15, 36, 65, 0.58)', fontWeight: 500, marginBottom: '8px' }}>
            Duration
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ink, #0F2441)' }}>
            {batch.startDate ? new Date(batch.startDate).toLocaleDateString() : 'N/A'} &mdash; {batch.endDate ? new Date(batch.endDate).toLocaleDateString() : 'N/A'}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.48)', marginTop: '4px' }}>
            Academic term
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '13px', color: 'rgba(15, 36, 65, 0.58)', fontWeight: 500, marginBottom: '8px' }}>
            Assigned Trainer
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ink, #0F2441)' }}>
            {batch.trainer?.name || 'You'}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.48)', marginTop: '4px' }}>
            {batch.trainer?.email || 'Primary instructor'}
          </div>
        </Card>
      </div>

      {/* Content 2-Column Grid: Gateways & Performance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Students Gateway Card */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 650, color: 'var(--color-ink, #0F2441)', margin: '0 0 4px 0' }}>
                Students & Enrollments
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(15, 36, 65, 0.58)', margin: 0 }}>
                Manage student rosters, enrollment status, and individual student progress.
              </p>
            </div>
            <Badge variant="info">{batch.studentCount ?? 0} Enrolled</Badge>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <Button
              variant="primary"
              onClick={() => navigate(`/trainer/batches/${batchId}/students`)}
            >
              View Students
            </Button>
          </div>
        </Card>

        {/* Problems Gateway Card */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 650, color: 'var(--color-ink, #0F2441)', margin: '0 0 4px 0' }}>
                Coding Problems
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(15, 36, 65, 0.58)', margin: 0 }}>
                Create, edit, archive problems and manage test cases for this batch.
              </p>
            </div>
            <Badge variant="neutral">Problem Bank</Badge>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => navigate(`/trainer/batches/${batchId}/problems`)}
            >
              View Problems
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate(`/trainer/batches/${batchId}/problems/create`)}
            >
              Create Problem
            </Button>
          </div>
        </Card>
      </div>

      {/* Performance Snapshot Section */}
      <Card style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 650, color: 'var(--color-ink, #0F2441)', margin: '0 0 4px 0' }}>
              Batch Performance Snapshot
            </h2>
            <p style={{ fontSize: '13px', color: 'rgba(15, 36, 65, 0.58)', margin: 0 }}>
              Real-time aggregate completion and submission metrics.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => navigate(`/trainer/batches/${batchId}/performance`)}
          >
            Detailed Performance &rarr;
          </Button>
        </div>

        {perfLoading ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <Spinner />
          </div>
        ) : performance ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', background: 'rgba(15, 36, 65, 0.02)', borderRadius: '12px', border: '1px solid rgba(15, 36, 65, 0.05)' }}>
              <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.58)', marginBottom: '4px' }}>Active Students</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink, #0F2441)' }}>{performance.activeStudents} / {performance.totalStudents}</div>
            </div>
            <div style={{ padding: '16px', background: 'rgba(15, 36, 65, 0.02)', borderRadius: '12px', border: '1px solid rgba(15, 36, 65, 0.05)' }}>
              <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.58)', marginBottom: '4px' }}>Total Problems</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink, #0F2441)' }}>{performance.totalProblems}</div>
            </div>
            <div style={{ padding: '16px', background: 'rgba(15, 36, 65, 0.02)', borderRadius: '12px', border: '1px solid rgba(15, 36, 65, 0.05)' }}>
              <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.58)', marginBottom: '4px' }}>Total Submissions</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink, #0F2441)' }}>{performance.totalSubmissions}</div>
            </div>
            <div style={{ padding: '16px', background: 'rgba(15, 36, 65, 0.02)', borderRadius: '12px', border: '1px solid rgba(15, 36, 65, 0.05)' }}>
              <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.58)', marginBottom: '4px' }}>Solved Problems</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink, #0F2441)' }}>{performance.solvedProblems}</div>
            </div>
            <div style={{ padding: '16px', background: 'rgba(15, 36, 65, 0.02)', borderRadius: '12px', border: '1px solid rgba(15, 36, 65, 0.05)' }}>
              <div style={{ fontSize: '12px', color: 'rgba(15, 36, 65, 0.58)', marginBottom: '4px' }}>Overall Progress</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink, #0F2441)' }}>{performance.progress}%</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(15, 36, 65, 0.48)', fontSize: '13px' }}>
            Performance metrics unavailable or no student submissions recorded yet.
          </div>
        )}
      </Card>
    </div>
  );
}
