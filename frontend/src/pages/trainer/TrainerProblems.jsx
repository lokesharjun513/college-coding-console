import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getTrainerBatches, getBatchProblems } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';
import '../../styles/trainer.css';
import '../../styles/pages/trainer-batches.css';
import { formatCount, NOT_AVAILABLE, formatDate } from '../../utils/trainerDisplay';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/trainer/StatusBadge';

/**
 * TrainerProblems – aggregates problems across all of the trainer's batches.
 * Backend problems are batch-scoped, so we fan out over the batch list.
 */
export default function TrainerProblems() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problems, setProblems] = useState([]);
  const [batches, setBatches] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const batchesRes = await getTrainerBatches();
      const batches = batchesRes.data?.data || [];
      setBatches(batches);
      const perBatch = await Promise.all(
        batches.map((b) =>
          getBatchProblems(b.id)
            .then((res) => (res.data?.data || []).map((p) => ({ ...p, batch: b })))
            .catch(() => [])
        )
      );
      setProblems(perBatch.flat());
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load problems');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

    if (loading) return <Spinner />;

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <h2>Problems</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={fetchData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="trainer-page">
      <header className="trainer-page-header">
        <TrainerBreadcrumb
          items={[
            { label: 'Trainer', to: '/trainer' },
            { label: 'Problems' },
          ]}
        />
        <div className="trainer-page-header-content">
          <div className="trainer-page-header-text">
            <h1 className="trainer-page-title">Problems</h1>
            <p className="trainer-page-description">Every problem you have created, grouped by batch.</p>
          </div>
        </div>
      </header>
      {batches.length === 0 ? (
        <p>No batches assigned yet.</p>
      ) : (
        <section className="trainer-card-grid" aria-label="Your batches">
          {batches.map((batch) => {
            const term = [batch.startDate, batch.endDate].filter(Boolean).map((d) => formatDate(d)).join(' – ');
            const studentCount = formatCount(Number(batch.studentCount) || 0);
            const problemCount = problems.filter((p) => p.batch?.id === batch.id).length;
            const trainerName = batch.trainer?.name || NOT_AVAILABLE;
            return (
              <article key={batch.id} className="trainer-batch-card">
                <header className="trainer-batch-card__header">
                  <div className="trainer-batch-card__identity">
                    <span className="trainer-batch-card__icon" aria-hidden="true">
                      <Icon name="layers" size={18} />
                    </span>
                    <div className="trainer-batch-card__content">
                      <h2 className="trainer-batch-card__title">
                        <Link to={`/trainer/batches/${batch.id}`}>{batch.name || NOT_AVAILABLE}</Link>
                      </h2>
                      {batch.description ? (
                        <p className="trainer-batch-card__description">{batch.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <StatusBadge status={batch.status} />
                </header>
                <hr className="trainer-batch-card__divider" />
                <div className="trainer-batch-card__metadata">
                  <div className="trainer-batch-card__metadata-row">
                    <span className="trainer-batch-card__metadata-icon" aria-hidden="true"><Icon name="users" size={16} /></span>
                    <span className="trainer-batch-card__metadata-label">Students</span>
                    <span className="trainer-batch-card__metadata-value">{studentCount}</span>
                  </div>
                  {term ? (
                    <div className="trainer-batch-card__metadata-row">
                      <span className="trainer-batch-card__metadata-icon" aria-hidden="true"><Icon name="calendar" size={16} /></span>
                      <span className="trainer-batch-card__metadata-label">Term</span>
                      <span className="trainer-batch-card__metadata-value">{term}</span>
                    </div>
                  ) : null}
                  <div className="trainer-batch-card__metadata-row">
                    <span className="trainer-batch-card__metadata-icon" aria-hidden="true"><Icon name="fileCode" size={16} /></span>
                    <span className="trainer-batch-card__metadata-label">Problems</span>
                    <span className="trainer-batch-card__metadata-value">{formatCount(problemCount)}</span>
                  </div>
                  <div className="trainer-batch-card__metadata-row">
                    <span className="trainer-batch-card__metadata-icon" aria-hidden="true"><Icon name="user" size={16} /></span>
                    <span className="trainer-batch-card__metadata-label">Trainer</span>
                    <span className="trainer-batch-card__metadata-value">{trainerName}</span>
                  </div>
                </div>
                <footer className="trainer-batch-card__footer">
                  <Link
                    to={`/trainer/batches/${batch.id}/problems`}
                    className="trainer-batch-card__action"
                    aria-label={`Go to batch ${batch.name}`}
                  >
                    Go to this batch
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
