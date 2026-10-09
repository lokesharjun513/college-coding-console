import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { createProblem, getProblem, updateProblem, getTrainerCollections, getTrainerCollectionTopics } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function ProblemEditor() {
  const { batchId, problemId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = !!problemId;
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState(null);

  // Problem fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('EASY');
  const [status, setStatus] = useState('DRAFT');
  const [saving, setSaving] = useState(false);

  // Collection / Topic state (Daily Training cascading selectors)
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState(null);
  const [selectedTopicId, setSelectedTopicId] = useState('');

  // Load collections on mount
  useEffect(() => {
    setCollectionsLoading(true);
    getTrainerCollections()
      .then(res => setCollections(res.data?.data || []))
      .catch(() => setCollectionsError('Unable to load collections'))
      .finally(() => setCollectionsLoading(false));
  }, []);

  // Load topics when collection changes
  useEffect(() => {
    if (!selectedCollectionId) {
      setTopics([]);
      setSelectedTopicId('');
      return;
    }
    setTopicsLoading(true);
    setTopicsError(null);
    getTrainerCollectionTopics(selectedCollectionId)
      .then(res => setTopics(res.data?.data || []))
      .catch(() => setTopicsError('Unable to load topics'))
      .finally(() => setTopicsLoading(false));
  }, [selectedCollectionId]);

  useEffect(() => {
    if (isEdit) {
      const fetchData = async () => {
        try {
          const res = await getProblem(batchId, problemId);
          const p = res.data?.data;
          setTitle(p.title);
          setDescription(p.description);
          setDifficulty(p.difficulty);
          setStatus(p.status);
          // Preselect existing Training/Day association when the backend exposes it
          if (p.collectionId) setSelectedCollectionId(p.collectionId);
          if (p.topicId) setSelectedTopicId(p.topicId);
        } catch (err) {
          setError(err?.response?.data?.message || 'Failed to load problem');
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    } else {
      // Create flow: preselect Training/Day from query params (Training management page)
      const qc = searchParams.get('collectionId');
      const qt = searchParams.get('topicId');
      if (qc) setSelectedCollectionId(qc);
      if (qt) setSelectedTopicId(qt);
    }
  }, [batchId, problemId, isEdit, searchParams]);

  const handleCollectionChange = (e) => {
    const val = e.target.value;
    setSelectedCollectionId(val);
    setSelectedTopicId(''); // reset topic when collection changes
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { title, description, difficulty, status };
      if (selectedCollectionId && selectedTopicId) {
        payload.collectionId = selectedCollectionId;
        payload.topicId = selectedTopicId;
      }
      if (isEdit) {
        await updateProblem(batchId, problemId, payload);
      } else {
        await createProblem(batchId, payload);
      }
      navigate(`/trainer/batches/${batchId}/problems`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save problem');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <h2>{isEdit ? 'Edit Problem' : 'Create Problem'}</h2>
      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        {/* Daily Training selectors */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Collection (Training)</label>
          {collectionsLoading ? (
            <Spinner />
          ) : collectionsError ? (
            <span style={{ color: 'red' }}>{collectionsError}</span>
          ) : (
            <select
              value={selectedCollectionId}
              onChange={handleCollectionChange}
              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="">— None —</option>
              {collections.map(c => (
                <option key={c.id || c._id} value={c.id || c._id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
            Topic (Day)
            {!selectedCollectionId && <span style={{ fontWeight: 'normal', color: '#888', marginLeft: '0.5rem' }}>(select a collection first)</span>}
          </label>
          {topicsLoading ? (
            <Spinner />
          ) : topicsError ? (
            <span style={{ color: 'red' }}>{topicsError}</span>
          ) : (
            <select
              value={selectedTopicId}
              onChange={e => setSelectedTopicId(e.target.value)}
              disabled={!selectedCollectionId}
              style={{
                width: '100%',
                padding: '0.4rem',
                borderRadius: '4px',
                border: '1px solid #ccc',
                opacity: selectedCollectionId ? 1 : 0.5,
              }}
            >
              <option value="">— None —</option>
              {topics.map(t => (
                <option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Description *</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            required
            style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Difficulty</label>
          <select
            value={difficulty}
            onChange={e => setDifficulty(e.target.value)}
            style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: 'none',
            background: '#007bff',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}