import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTrainerBatches } from '../../api/trainer';
import Icon from '../../components/ui/Icon';
import Button from '../../components/ui/Button';
import '../../styles/pages/trainer-batches.css';

// Map canonical backend status -> BEM modifier. StdLib status labels + CSS dots.
function statusClass(status) {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE') return 'active';
  if (s === 'COMPLETED') return 'completed';
  return 'neutral';
}

function BatchSkeletonCard() {
  return (
    <div className="trainer-batches__skeleton" aria-hidden="true">
      <div className="trainer-batches__skeleton-line trainer-batches__skeleton-line--lg" />
      <div className="trainer-batches__skeleton-line trainer-batches__skeleton-line--sm" />
      <div className="trainer-batches__skeleton-line trainer-batches__skeleton-line--full" />
      <div className="trainer-batches__skeleton-line trainer-batches__skeleton-line--full" />
      <div className="trainer-batches__skeleton-line trainer-batches__skeleton-line--row" />
    </div>
  );
}

function BatchCard({ batch }) {
  const dates = [];
  if (batch.startDate) dates.push(new Date(batch.startDate).toLocaleDateString());
  if (batch.endDate) dates.push(new Date(batch.endDate).toLocaleDateString());
  const term = dates.length ? dates.join(' – ') : '—';

  return (
    <article className="trainer-batch-card">
      <div className="trainer-batch-card__header">
        <div className="trainer-batch-card__heading">
          <h3 className="trainer-batch-card__name">{batch.name}</h3>
          {batch.code && <div className="trainer-batch-card__code">{batch.code}</div>}
        </div>
        {batch.status && (
          <span className={`trainer-batch-card__status trainer-batch-card__status--${statusClass(batch.status)}`}>
            {batch.status}
          </span>
        )}
      </div>

      {batch.description && (
        <p className="trainer-batch-card__description">{batch.description}</p>
      )}

      <div className="trainer-batch-card__meta">
        <div className="trainer-batch-card__meta-row">
          <span className="trainer-batch-card__meta-label">
            <Icon name="users" size={14} /> Students
          </span>
          <span className="trainer-batch-card__meta-value">{batch.studentCount ?? 0}</span>
        </div>

        {dates.length > 0 && (
          <div className="trainer-batch-card__meta-row">
            <span className="trainer-batch-card__meta-label">
              <Icon name="calendar" size={14} /> Term
            </span>
            <span className="trainer-batch-card__meta-value">{term}</span>
          </div>
        )}

        {batch.trainer?.name && (
          <div className="trainer-batch-card__meta-row">
            <span className="trainer-batch-card__meta-label">
              <Icon name="userCheck" size={14} /> Trainer
            </span>
            <span className="trainer-batch-card__meta-value">{batch.trainer.name}</span>
          </div>
        )}
      </div>

      <div className="trainer-batch-card__actions">
        <Link to={`/trainer/batches/${batch.id}`} className="trainer-batch-card__link" aria-label={`View batch ${batch.name}`}>
          <Icon name="chevronRight" size={16} />
          View Batch
        </Link>
      </div>
    </article>
  );
}

export default function BatchesList() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(
      (b) =>
        (b.name && b.name.toLowerCase().includes(q)) ||
        (b.code && b.code.toLowerCase().includes(q))
    );
  }, [batches, search]);

  const summary = useMemo(() => {
    const total = batches.length;
    const students = batches.reduce((sum, b) => sum + (b.studentCount || 0), 0);
    const active = batches.filter((b) => (b.status || '').toUpperCase() === 'ACTIVE').length;
    return { total, students, active };
  }, [batches]);

  if (loading) {
    return (
      <div className="trainer-batches">
        <div className="trainer-batches__skeleton-grid" role="status" aria-label="Loading batches">
          <BatchSkeletonCard />
          <BatchSkeletonCard />
          <BatchSkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trainer-batches">
        <div className="trainer-batches__error" role="alert">
          <span className="trainer-batches__error-icon">
            <Icon name="barChart" size={22} />
          </span>
          <h2>Couldn&apos;t load your batches</h2>
          <p>{error}</p>
          <Button variant="primary" onClick={fetchData}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="trainer-batches">
      <header className="trainer-batches__header">
        <p className="trainer-batches__eyebrow">Trainer Management</p>
        <h1 className="trainer-batches__title">Your Batches</h1>
        <p className="trainer-batches__description">Manage the batches assigned to you.</p>
      </header>

      <section className="trainer-batches__summary" aria-label="Batch summary">
        <div className="trainer-batches__summary-card">
          <p className="trainer-batches__summary-label">Batches</p>
          <p className="trainer-batches__summary-value">{summary.total}</p>
        </div>
        <div className="trainer-batches__summary-card">
          <p className="trainer-batches__summary-label">Active</p>
          <p className="trainer-batches__summary-value">{summary.active}</p>
        </div>
        <div className="trainer-batches__summary-card">
          <p className="trainer-batches__summary-label">Students</p>
          <p className="trainer-batches__summary-value">{summary.students}</p>
        </div>
      </section>

      <div className="trainer-batches__toolbar">
        <input
          type="search"
          className="trainer-batches__search"
          placeholder="Search batches..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search batches"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="trainer-batches__empty">
          <span className="trainer-batches__empty-icon">
            <Icon name="layers" size={22} />
          </span>
          <h2>{batches.length === 0 ? 'No batches assigned' : 'No matches'}</h2>
          <p>
            {batches.length === 0
              ? "You don&apos;t have any batches assigned yet."
              : 'No batches match your search. Try a different name or code.'}
          </p>
          {batches.length === 0 && (
            <Button variant="secondary" onClick={fetchData}>Refresh</Button>
          )}
        </div>
      ) : (
        <section className="trainer-batches__grid" aria-label="Your batches">
          {filtered.map((batch) => (
            <BatchCard key={batch.id} batch={batch} />
          ))}
        </section>
      )}
    </div>
  );
}
