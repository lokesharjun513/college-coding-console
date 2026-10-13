import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getTrainerBatches,
  getTrainerCollections,
  getBatchProblems,
  getBatchPerformance,
  deleteProblem,
  createProblem
} from '../../api/trainer';
import Icon from '../../components/ui/Icon';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import '../../styles/pages/trainer.css';
import '../../styles/pages/trainer-training.css';

export default function TrainingManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState(null);

  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState(null);

  const [problems, setProblems] = useState([]);
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [problemsError, setProblemsError] = useState(null);

  const [performance, setPerformance] = useState(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState(null);

  const batchId = searchParams.get('batchId') || '';

  // Assignment modal
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDifficulty, setAssignmentDifficulty] = useState('EASY');
  const [assignmentStatus, setAssignmentStatus] = useState('ASSIGNED');

  // Archive state
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);

  // Fetch batches
  const loadBatches = useCallback(() => {
    setBatchesLoading(true);
    setBatchesError(null);
    getTrainerBatches()
      .then(res => {
        setBatches(res.data?.data || []);
        setBatchesLoading(false);
      })
      .catch(err => {
        setBatchesError('Failed to load batches. Please try again.');
        setBatchesLoading(false);
      });
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // Fetch collections
  const loadCollections = useCallback(() => {
    if (!batchId) {
      setCollections([]);
      return;
    }
    setCollectionsLoading(true);
    setCollectionsError(null);
    getTrainerCollections()
      .then(res => {
        setCollections(res.data?.data || []);
        setCollectionsLoading(false);
      })
      .catch(err => {
        setCollectionsError('Failed to load training collections.');
        setCollectionsLoading(false);
      });
  }, [batchId]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  // Fetch problems
  const loadProblems = useCallback(() => {
    if (!batchId) {
      setProblems([]);
      return;
    }
    setProblemsLoading(true);
    setProblemsError(null);
    getBatchProblems(batchId)
      .then(res => {
        setProblems(res.data?.data || []);
        setProblemsLoading(false);
      })
      .catch(err => {
        setProblemsError('Failed to load assigned problems.');
        setProblemsLoading(false);
      });
  }, [batchId]);

  useEffect(() => {
    loadProblems();
  }, [loadProblems]);

  // Fetch performance
  const loadPerformance = useCallback(() => {
    if (!batchId) {
      setPerformance(null);
      return;
    }
    setPerformanceLoading(true);
    setPerformanceError(null);
    getBatchPerformance(batchId)
      .then(res => {
        setPerformance(res.data?.data || null);
        setPerformanceLoading(false);
      })
      .catch(() => {
        setPerformanceError('Performance data unavailable.');
        setPerformanceLoading(false);
        setPerformance(null);
      });
  }, [batchId]);

  useEffect(() => {
    loadPerformance();
  }, [loadPerformance]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
  };

  const selectedBatch = useMemo(() => batches.find(b => b.id === batchId), [batches, batchId]);

  const handleAssignmentSubmit = (e) => {
    e.preventDefault();
    if (!batchId || !assignmentTitle) return;

    setAssignmentLoading(true);
    createProblem(batchId, {
      title: assignmentTitle,
      difficulty: assignmentDifficulty,
      status: assignmentStatus
    })
      .then(() => {
        setAssignmentLoading(false);
        setAssignmentModalOpen(false);
        setAssignmentTitle('');
        setAssignmentDifficulty('EASY');
        loadProblems();
      })
      .catch(() => {
        setAssignmentLoading(false);
        alert('Failed to create assignment. Please try again.');
      });
  };

  const handleArchive = () => {
    if (!archiveTarget || !batchId) return;

    setArchiveSaving(true);
    deleteProblem(batchId, archiveTarget.id)
      .then(() => {
        setArchiveSaving(false);
        setArchiveTarget(null);
        loadProblems();
      })
      .catch(() => {
        setArchiveSaving(false);
        alert('Failed to archive problem.');
      });
  };

  const activeProblems = useMemo(() =>
    problems.filter(p => p.status !== 'ARCHIVED'),
    [problems]
  );

  return (
    <div className="trainer-page">
      {/* Breadcrumb */}
      <nav className="trainer-breadcrumb">
        <Link to="/trainer">Trainer</Link>
        <span className="trainer-breadcrumb-sep">/</span>
        <span className="trainer-breadcrumb-current">Training</span>
      </nav>

      {/* Page Header */}
      <header className="trainer-page-header">
        <p className="trainer-eyebrow">Training & Practice</p>
        <h1 className="trainer-page-title">Training & Daily Practice</h1>
        <p className="trainer-page-description">
          Manage training materials and assign daily coding problems to your batches.
        </p>
        <Button
          variant="primary"
          onClick={() => setAssignmentModalOpen(true)}
          disabled={!batchId}
        >
          <Icon name="plus" size={16} />
          Assign Daily Problems
        </Button>
      </header>

      {/* Batch Selector */}
      <div className="trainer-toolbar">
        <label className="trainer-select-label" style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 500 }}>Select Batch</label>
        {batchesLoading ? (
          <Spinner />
        ) : batchesError ? (
          <div className="trainer-error">
            <p>{batchesError}</p>
            <Button variant="secondary" onClick={loadBatches}>Retry</Button>
          </div>
        ) : batches.length === 0 ? (
          <select className="trainer-select" disabled>
            <option>No batches available</option>
          </select>
        ) : (
          <select className="trainer-select" value={batchId} onChange={(e) => setParam('batchId', e.target.value)}>
            <option value="">Select a batch...</option>
            {batches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} {b.studentCount ? `(${b.studentCount} students)` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Selected Batch Overview */}
      {selectedBatch && (
        <section className="trainer-section">
          <div className="trainer-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 className="trainer-section-heading" style={{ margin: '0 0 8px 0' }}>
                  {selectedBatch.name}
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {selectedBatch.description || 'Batch management overview'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {selectedBatch.code && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Code</div>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedBatch.code}</div>
                  </div>
                )}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Students</div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>
                    {selectedBatch.studentCount || selectedBatch.enrollmentCount || 0}
                  </div>
                </div>
                {selectedBatch.status && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Status</div>
                    <Badge variant={selectedBatch.status === 'ACTIVE' ? 'success' : 'info'}>{selectedBatch.status}</Badge>
                  </div>
                )}
                <Link to={`/trainer/batches/${selectedBatch.id}/students`}>
                  <Button variant="secondary" size="sm">View Students</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Daily Assigned Problems Section */}
      <section className="trainer-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="trainer-section-heading" style={{ margin: 0 }}>Daily Assigned Problems</h2>
            <p className="trainer-section-description">Manage problems assigned to your batch</p>
          </div>
          <Button variant="primary" onClick={() => setAssignmentModalOpen(true)} disabled={!batchId}>
            <Icon name="plus" size={16} />
            Add Assignment
          </Button>
        </div>

        {problemsLoading && (
          <div className="trainer-loading">Loading assignments...</div>
        )}

        {problemsError && (
          <div className="trainer-error">
            <p>{problemsError}</p>
            <Button variant="secondary" onClick={loadProblems}>Retry</Button>
          </div>
        )}

        {!problemsLoading && !problemsError && batchId && activeProblems.length === 0 && (
          <div className="trainer-empty">
            <Icon name="clipboard" size={32} />
            <h2>No Assignments</h2>
            <p>Assign daily coding problems to track student progress.</p>
          </div>
        )}

        {!problemsLoading && !problemsError && batchId && activeProblems.length > 0 && (
          <ul className="trainer-list">
            {activeProblems.map((p, i) => (
              <li key={p.id} className="trainer-row">
                <div className="trainer-row-info">
                  <span className="trainer-row-title">{i + 1}. {p.title}</span>
                  <div className="trainer-row-meta">
                    <Badge variant={p.difficulty === 'EASY' ? 'success' : p.difficulty === 'MEDIUM' ? 'warning' : 'danger'}>
                      {p.difficulty}
                    </Badge>
                    <span>·</span>
                    <span>{p.status}</span>
                    {p.createdAt && (
                      <>
                        <span>·</span>
                        <span>
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="trainer-row-actions">
                  <Link to={`/trainer/batches/${batchId}/problems/${p.id}/edit`}>
                    <Button size="sm" variant="ghost">Edit</Button>
                  </Link>
                  <Link to={`/trainer/batches/${batchId}/problems/${p.id}`}>
                    <Button size="sm" variant="secondary">View</Button>
                  </Link>
                  {p.status !== 'ARCHIVED' && (
                    <Button size="sm" variant="danger" onClick={() => setArchiveTarget(p)}>
                      Archive
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Training Collections Section */}
      <section className="trainer-section">
        <h2 className="trainer-section-heading">Training Collections</h2>
        <p className="trainer-section-description">
          Structured training programs organized by topic and difficulty
        </p>

        {collectionsLoading && (
          <div className="trainer-loading">Loading training program...</div>
        )}

        {collectionsError && (
          <div className="trainer-error">
            <p>{collectionsError}</p>
            <Button variant="secondary" onClick={loadCollections}>Retry</Button>
          </div>
        )}

        {!collectionsLoading && !collectionsError && batchId && collections.length === 0 && (
          <div className="trainer-empty">
            <Icon name="book" size={32} />
            <h2>No Training Program</h2>
            <p>This batch does not have a training program assigned.</p>
          </div>
        )}

        {!collectionsLoading && !collectionsError && batchId && collections.length > 0 && (
          <div className="trainer-grid">
            {collections.map(c => (
              <div key={c.id} className="trainer-grid-card">
                <div className="trainer-grid-card__header">
                  <h3 className="trainer-grid-card-title">{c.name}</h3>
                  <p className="trainer-grid-card-meta">
                    {c.topicCount || 0} Days · {c.problemCount || 0} Problems
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Student Progress Section (if performance data available) */}
      {performance && !performanceLoading && (
        <section className="trainer-section">
          <h2 className="trainer-section-heading">Student Progress</h2>
          <p className="trainer-section-description">
            Overview of student completion rates across assigned problems
          </p>

          <div className="trainer-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="trainer-card">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Total Assigned
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-heading)', marginTop: '4px' }}>
                  {performance.assigned || 0}
                </div>
              </div>
            </div>
            <div className="trainer-card">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Attempted
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-heading)', marginTop: '4px' }}>
                  {performance.attempted || 0}
                </div>
              </div>
            </div>
            <div className="trainer-card">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Completed
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-heading)', marginTop: '4px' }}>
                  {performance.completed || 0}
                </div>
              </div>
            </div>
            <div className="trainer-card">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Pending
                </div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-heading)', marginTop: '4px' }}>
                  {performance.pending || 0}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Assignment Modal */}
      <Modal isOpen={assignmentModalOpen} onClose={() => setAssignmentModalOpen(false)} title="Assign Problem">
        <form onSubmit={handleAssignmentSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500 }}>
              Problem Title
            </label>
            <input
              type="text"
              className="trainer-select"
              value={assignmentTitle}
              onChange={(e) => setAssignmentTitle(e.target.value)}
              placeholder="Enter problem title"
              style={{ width: '100%' }}
              required
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500 }}>
              Difficulty
            </label>
            <select
              className="trainer-select"
              value={assignmentDifficulty}
              onChange={(e) => setAssignmentDifficulty(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500 }}>
              Status
            </label>
            <select
              className="trainer-select"
              value={assignmentStatus}
              onChange={(e) => setAssignmentStatus(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="ASSIGNED">Assigned</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <Button variant="secondary" onClick={() => setAssignmentModalOpen(false)} disabled={assignmentLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={assignmentLoading}>
              {assignmentLoading ? 'Creating...' : 'Create Assignment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Archive Modal */}
      <Modal isOpen={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Problem">
        <p>Archive &quot;{archiveTarget?.title}&quot;?</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={archiveSaving}>
            Cancel
          </Button>
          <Button variant="danger" disabled={archiveSaving} onClick={handleArchive}>
            {archiveSaving ? 'Archiving...' : 'Archive'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
