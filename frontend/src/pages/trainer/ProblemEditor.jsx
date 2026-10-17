import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createProblem,
  getProblem,
  getTrainerCollectionTopics,
  getTrainerCollections,
  updateProblem,
} from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import {
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../components/trainer';

/**
 * Create / edit a batch problem — /trainer/batches/:batchId/problems/create|edit
 *
 * Problems are always BATCH scoped: the backend pins `scope: 'BATCH'` and
 * derives `createdBy` from the token, so this form cannot move a problem to
 * another batch or to the global catalogue.
 *
 * The Training (collection) and Day (topic) selectors are read-only metadata:
 * `GET /trainer/collections` and `GET /trainer/collections/:id/topics`.
 */
export default function ProblemEditor() {
  const { batchId, problemId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(problemId);

  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('EASY');
  const [status, setStatus] = useState('DRAFT');

  const [collections, setCollections] = useState([]);
  const [collectionsError, setCollectionsError] = useState(null);
  const [collectionId, setCollectionId] = useState('');

  const [topics, setTopics] = useState([]);
  const [topicsError, setTopicsError] = useState(null);
  const [topicId, setTopicId] = useState('');

  // Collections are shared read-only metadata.
  useEffect(() => {
    let active = true;
    getTrainerCollections()
      .then((res) => {
        if (active) setCollections(res?.data?.data || []);
      })
      .catch(() => {
        if (active) setCollectionsError('Unable to load training collections.');
      });
    return () => {
      active = false;
    };
  }, []);

  // Cascading topics for the selected training.
  useEffect(() => {
    if (!collectionId) {
      setTopics([]);
      return undefined;
    }
    let active = true;
    setTopicsError(null);
    getTrainerCollectionTopics(collectionId)
      .then((res) => {
        if (active) setTopics(res?.data?.data || []);
      })
      .catch(() => {
        if (active) setTopicsError('Unable to load training days.');
      });
    return () => {
      active = false;
    };
  }, [collectionId]);

  // Load the existing problem, or pre-seed from the Training page query string.
  useEffect(() => {
    if (isEdit) {
      let active = true;
      getProblem(batchId, problemId)
        .then((res) => {
          if (!active) return;
          const problem = res?.data?.data;
          if (!problem) {
            setError('Problem not found.');
            return;
          }
          setTitle(problem.title || '');
          setDescription(problem.description || '');
          setDifficulty(problem.difficulty || 'EASY');
          setStatus(problem.status || 'DRAFT');
          if (problem.collectionId) setCollectionId(problem.collectionId);
          if (problem.topicId) setTopicId(problem.topicId);
        })
        .catch((err) => {
          if (active) {
            setError(err?.response?.data?.message || 'Failed to load problem.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }

    const queryCollection = searchParams.get('collectionId');
    const queryTopic = searchParams.get('topicId');
    if (queryCollection) setCollectionId(queryCollection);
    if (queryTopic) setTopicId(queryTopic);
    return undefined;
  }, [batchId, problemId, isEdit, searchParams]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { title, description, difficulty, status };
      if (collectionId && topicId) {
        payload.collectionId = collectionId;
        payload.topicId = topicId;
      }
      if (isEdit) {
        await updateProblem(batchId, problemId, payload);
      } else {
        await createProblem(batchId, payload);
      }
      navigate(`/trainer/batches/${batchId}/problems`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save problem.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading problem…" />
      </div>
    );
  }

  if (error && isEdit && !title) {
    return (
      <div className="trainer-page">
        <TrainerErrorState
          title="Couldn’t load this problem"
          message={error}
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
          { label: isEdit ? 'Edit problem' : 'Create problem' },
        ]}
      />

      <PageHeader
        title={isEdit ? 'Edit Problem' : 'Create Problem'}
        description="Problems created here belong to this batch and this trainer."
      />

      <form className="trainer-form" onSubmit={handleSubmit}>
        {error ? (
          <div className="trainer-form__error" role="alert">
            {error}
          </div>
        ) : null}

        <TrainerSectionCard title="Problem" headingId="trainer-problem-editor-fields">
          <div className="trainer-section-card__body--padded">
            <div className="trainer-form">
              <div className="trainer-form__field">
                <label className="trainer-form__label" htmlFor="trainer-problem-title">
                  Title
                </label>
                <input
                  id="trainer-problem-title"
                  type="text"
                  className="trainer-form__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="trainer-form__field">
                <label className="trainer-form__label" htmlFor="trainer-problem-description">
                  Description
                </label>
                <textarea
                  id="trainer-problem-description"
                  className="trainer-form__textarea"
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="trainer-form">
                <div className="trainer-form__field">
                  <label className="trainer-form__label" htmlFor="trainer-problem-difficulty">
                    Difficulty
                  </label>
                  <select
                    id="trainer-problem-difficulty"
                    className="trainer-select"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </div>

                <div className="trainer-form__field">
                  <label className="trainer-form__label" htmlFor="trainer-problem-status">
                    Status
                  </label>
                  <select
                    id="trainer-problem-status"
                    className="trainer-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </TrainerSectionCard>

        <TrainerSectionCard
          title="Daily Training"
          subtitle="Optionally link this problem to a training programme and day"
          headingId="trainer-problem-editor-training"
        >
          <div className="trainer-section-card__body--padded">
            <div className="trainer-form">
              <div className="trainer-form__field">
                <label className="trainer-form__label" htmlFor="trainer-problem-collection">
                  Training
                </label>
                {collectionsError ? (
                  <p className="trainer-form__error" role="alert">
                    {collectionsError}
                  </p>
                ) : (
                  <select
                    id="trainer-problem-collection"
                    className="trainer-select"
                    value={collectionId}
                    onChange={(e) => {
                      setCollectionId(e.target.value);
                      setTopicId('');
                    }}
                  >
                    <option value="">— None —</option>
                    {collections.map((collection) => (
                      <option key={collection.id || collection._id} value={collection.id || collection._id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="trainer-form__field">
                <label className="trainer-form__label" htmlFor="trainer-problem-topic">
                  Day
                </label>
                {topicsError ? (
                  <p className="trainer-form__error" role="alert">
                    {topicsError}
                  </p>
                ) : (
                  <select
                    id="trainer-problem-topic"
                    className="trainer-select"
                    value={topicId}
                    disabled={!collectionId}
                    onChange={(e) => setTopicId(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {topics.map((topic) => (
                      <option key={topic.id || topic._id} value={topic.id || topic._id}>
                        {topic.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="trainer-form__hint">
                  Select a training programme first to unlock its days.
                </p>
              </div>
            </div>
          </div>
        </TrainerSectionCard>

        <div className="trainer-form__actions">
          <Button
            variant="secondary"
            type="button"
            onClick={() => navigate(`/trainer/batches/${batchId}/problems`)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            <Icon name="checkSquare" size={14} />
            {isEdit ? 'Save changes' : 'Create problem'}
          </Button>
        </div>
      </form>
    </div>
  );
}