import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { getTrainer } from '../../api/admin';

/**
 * Admin – Trainer details view.
 */
export default function TrainerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trainer, setTrainer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getTrainer(id);
        setTrainer(res.data?.data);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load trainer');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) return <div style={{ padding: 'var(--space-6)' }}><Spinner /></div>;
  if (error) return (
    <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-danger)' }}>{error}</p>
      <Button variant="secondary" onClick={() => navigate('/admin/trainers')}>Back to Trainers</Button>
    </div>
  );
  if (!trainer) return null;

  const statusVariant = trainer.status === 'ACTIVE' ? 'success' : 'warning';

  return (
    <>
      <PageHeader
        title={trainer.name}
        description="Trainer account details"
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/admin/trainers')}>← Back</Button>
            <Button variant="primary" onClick={() => navigate(`/admin/trainers/${id}/edit`)}>Edit</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gap: 'var(--space-5)', gridTemplateColumns: '1fr 1fr', maxWidth: 800 }}>
        {/* Profile */}
        <Card>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginTop: 0, marginBottom: 'var(--space-4)', color: 'var(--color-text-primary)' }}>Profile</h3>
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {[
              { label: 'Full Name', value: trainer.name },
              { label: 'Email', value: trainer.email },
              { label: 'Role', value: trainer.role },
              { label: 'Status', value: <Badge variant={statusVariant}>{trainer.status}</Badge> },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>{label}</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>{value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Info */}
        <Card>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginTop: 0, marginBottom: 'var(--space-4)', color: 'var(--color-text-primary)' }}>Account Info</h3>
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {[
              { label: 'Trainer ID', value: trainer.id },
              { label: 'Created', value: trainer.createdAt ? new Date(trainer.createdAt).toLocaleDateString() : '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>{label}</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{value}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}