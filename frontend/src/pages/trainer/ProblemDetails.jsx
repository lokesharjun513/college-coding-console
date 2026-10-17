import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getProblem } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import StatusBadge from '../../components/trainer/StatusBadge';
import {
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../components/trainer';
import { NOT_AVAILABLE } from '../../utils/trainerDisplay';
import '../../styles/pages/trainer-problems.css';

/** Read-only problem view — /trainer/batches/:batchId/problems/:problemId */
export default function ProblemDetails() {
  const { batchId, problemId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problem, setProblem] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getProblem(batchId, problemId);
      setProblem(res?.data?.data || null);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load problem');
    } finally {
      setLoading(false);
    }
  }, [batchId, problemId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading problem…" />
      </div>
    );
  }

  if (error || !problem) {
    return (
      <div className="trainer-page">
        <TrainerErrorState
          title="Couldn’t load this problem"
          message={error || 'Problem not found.'}
          onRetry={() => navigate(`/trainer/batches/${batchId}/problems`)}
          retryLabel="Back to problems"
        />
      </div>
    );
  }

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Batches', to: '/trainer/batches' },
          { label: 'Problems', to: `/trainer/batches/${batchId}/problems` },
          { label: problem.title || 'Problem' },
        ]}
      />

      <PageHeader
        title={problem.title || NOT_AVAILABLE}
        description="Problem details"
        actions={
          <div className="trainer-page__actions">
            <StatusBadge status={problem.status} />
            <Button
              variant="secondary"
              onClick={() => navigate(`/trainer/batches/${batchId}/problems/${problemId}/testcases`)}
            >
              Test Cases
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate(`/trainer/batches/${batchId}/problems/${problemId}/edit`)}
            >
              Edit Problem
            </Button>
          </div>
        }
      />

      <TrainerSectionCard title="Details" headingId="trainer-problem-details-meta">
        <div className="trainer-metric-grid trainer-section-card__body--padded">
          <div className="trainer-metric-tile">
            <p className="trainer-metric-tile__label">Difficulty</p>
            <p className="trainer-metric-tile__value">{problem.difficulty || NOT_AVAILABLE}</p>
          </div>
          <div className="trainer-metric-tile">
            <p className="trainer-metric-tile__label">Scope</p>
            <p className="trainer-metric-tile__value">{problem.scope || NOT_AVAILABLE}</p>
          </div>
          <div className="trainer-metric-tile">
            <p className="trainer-metric-tile__label">Linked Day</p>
            <p className="trainer-metric-tile__value">{problem.topicId ? 'Yes' : NOT_AVAILABLE}</p>
          </div>
        </div>
      </TrainerSectionCard>

      <TrainerSectionCard title="Description" headingId="trainer-problem-details-description">
        <div className="trainer-section-card__body--padded">
          <pre className="trainer-problem-text">{problem.description || NOT_AVAILABLE}</pre>
        </div>
      </TrainerSectionCard>

      <div className="trainer-form__actions">
        <Link className="btn btn-secondary" to={`/trainer/batches/${batchId}/problems`}>
          <Icon name="chevronLeft" size={14} />
          Back to problems
        </Link>
        <Link
          className="btn btn-secondary"
          to={`/trainer/batches/${batchId}/problems/${problemId}/performance`}
        >
          Performance
        </Link>
      </div>
    </div>
  );
}