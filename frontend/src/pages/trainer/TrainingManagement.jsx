import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getTrainerBatches, getTrainerCollections, getTrainerCollectionTopics, getBatchProblems, deleteProblem } from '../../api/trainer';
import Icon from '../../components/ui/Icon';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import '../../styles/pages/trainer-training.css';

export default function TrainingManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);

  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);

  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(false);

  const batchId = searchParams.get('batchId') || '';
  const collectionId = searchParams.get('collectionId') || '';
  const topicId = searchParams.get('topicId') || '';

  // Archive state
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);

  useEffect(() => {
    getTrainerBatches().then(res => {
      setBatches(res.data?.data || []);
      setBatchesLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!batchId) {
      setCollections([]);
      return;
    }
    setCollectionsLoading(true);
    getTrainerCollections().then(res => {
      setCollections(res.data?.data || []);
      setCollectionsLoading(false);
    });
  }, [batchId]);

  useEffect(() => {
    if (!collectionId) {
      setTopics([]);
      return;
    }
    setTopicsLoading(true);
    getTrainerCollectionTopics(collectionId).then(res => {
      setTopics(res.data?.data || []);
      setTopicsLoading(false);
    });
  }, [collectionId]);

  useEffect(() => {
    if (!batchId || !topicId) {
      setProblems([]);
      return;
    }
    setProblemsLoading(true);
    getBatchProblems(batchId).then(res => {
      const all = res.data?.data || [];
      setProblems(all.filter(p => p.topicId === topicId));
      setProblemsLoading(false);
    });
  }, [batchId, topicId]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);

    // Reset children on parent change
    if (key === 'batchId') { next.delete('collectionId'); next.delete('topicId'); }
    if (key === 'collectionId') { next.delete('topicId'); }

    setSearchParams(next);
  };

  const selectedCollection = useMemo(() => collections.find(c => c.id === collectionId), [collections, collectionId]);
  const selectedTopic = useMemo(() => topics.find(t => t.id === topicId), [topics, topicId]);

  return (
    <div className="trainer-training">
      <nav className="trainer-training__crumb">
        <Link to="/trainer">Trainer</Link>
        <span className="trainer-training__crumb-sep">/</span>
        <span className="trainer-training__crumb-current">Training</span>
      </nav>

      <header className="trainer-training__header">
        <h1 className="trainer-training__title">Training Management</h1>
        <p className="trainer-training__description">Batch-scoped training content & daily problem management.</p>
      </header>

      <div className="trainer-training__toolbar">
        <label className="trainer-training__label">Select Batch</label>
        {batchesLoading ? <Spinner /> : (
          <select className="trainer-training__select" value={batchId} onChange={(e) => setParam('batchId', e.target.value)}>
            <option value="">Select a batch...</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {batchId && (
        <section className="trainer-training__section">
          <h2 className="trainer-training__section-heading">Trainings</h2>
          {collectionsLoading ? <Spinner /> : (
            <div className="trainer-training__grid">
              {collections.map(c => (
                <div key={c.id} className={`trainer-training-card ${collectionId === c.id ? 'trainer-training-card--active' : ''}`}>
                  <div className="trainer-training-card__header">
                    <h3 className="trainer-training-card__title">{c.name}</h3>
                    <p className="trainer-training-card__meta">{c.topicCount} Days · {c.problemCount} Problems</p>
                  </div>
                  <Button size="sm" variant={collectionId === c.id ? 'secondary' : 'primary'} onClick={() => setParam('collectionId', collectionId === c.id ? '' : c.id)}>
                    {collectionId === c.id ? 'Close' : 'Open'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {collectionId && (
        <section className="trainer-training__section">
          <h2 className="trainer-training__section-heading">
            {selectedCollection?.name || 'Training'} Days
          </h2>
          {topicsLoading ? <Spinner /> : (
            <ul className="trainer-training__list">
              {topics.map(t => (
                <li key={t.id} className="trainer-training__row">
                  <div className="trainer-training__row-info">
                    <span className="trainer-training__row-title">{t.name}</span>
                    <span className="trainer-training__row-meta">{t.problemCount} Problems</span>
                  </div>
                  <div className="trainer-training__row-actions">
                    <Button size="sm" variant={topicId === t.id ? 'secondary' : 'primary'} onClick={() => setParam('topicId', topicId === t.id ? '' : t.id)}>
                      {topicId === t.id ? 'Hide' : 'View'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {topicId && (
        <section className="trainer-training__section">
          <div className="trainer-training__section-heading">
            {selectedTopic?.name || 'Day'} Problems
            <Button size="sm" variant="primary" onClick={() => navigate(`/trainer/batches/${batchId}/problems/create?collectionId=${collectionId}&topicId=${topicId}`)}>
              <Icon name="plus" size={16} /> Add Problem
            </Button>
          </div>
          {problemsLoading ? <Spinner /> : (
            <ul className="trainer-training__list">
              {problems.map((p, i) => (
                <li key={p.id} className="trainer-training__row">
                  <div className="trainer-training__row-info">
                    <span className="trainer-training__row-title">{i + 1}. {p.title}</span>
                    <div className="trainer-training__row-meta trainer-training__problem-details">
                      <Badge variant={p.difficulty === 'EASY' ? 'success' : 'info'}>{p.difficulty}</Badge>
                      <span>{p.status}</span>
                    </div>
                  </div>
                  <div className="trainer-training__row-actions">
                    <Link to={`/trainer/batches/${batchId}/problems/${p.id}/edit?collectionId=${collectionId}&topicId=${topicId}`}>Edit</Link>
                    {p.status !== 'ARCHIVED' && (
                      <button type="button" onClick={() => setArchiveTarget(p)}>Archive</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal isOpen={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Problem">
        <p>Archive &quot;{archiveTarget?.title}&quot;?</p>
        <div className="trainer-training__modal-actions">
          <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={archiveSaving}>Cancel</Button>
          <Button variant="danger" disabled={archiveSaving} onClick={() => {
            setArchiveSaving(true);
            deleteProblem(batchId, archiveTarget.id).finally(() => {
              setArchiveSaving(false);
              setArchiveTarget(null);
            });
          }}>{archiveSaving ? 'Archiving...' : 'Archive'}</Button>
        </div>
      </Modal>
    </div>
  );
}
