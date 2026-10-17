import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  getTrainerBatches,
  getTrainerBatch,
  getTrainerCollections,
  getTrainerCollectionTopics,
  getBatchProblems,
  createTrainerCollection,
  createTrainerTopic,
  updateTrainerCollection,
  updateTrainerTopic,
  deleteTrainerCollection,
  deleteTrainerTopic,
  deleteProblem,
  unarchiveProblem,
  downloadProblemTemplate,
} from '../../api/trainer';
import {
  TrainerBreadcrumb,
  TrainerConfirmDialog,
  TrainerNotice,
  TrainerKpiCard,
  TrainerKpiGrid,
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
  StatusBadge,
} from '../../components/trainer';
import ProblemImportModal, { downloadProblemTemplateFile } from '../../components/trainer/ProblemImportModal';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Upload, Download, Plus, Pencil, Eye, Trash2, Archive, EyeOff } from 'lucide-react';
import { NOT_AVAILABLE, formatCount } from '../../utils/trainerDisplay';
import '../../styles/pages/trainer-problems.css';

// Map problem status/difficulty to tag modifiers
function difficultyClass(d) {
  const s = (d || '').toUpperCase();
  if (s === 'EASY') return 'easy';
  if (s === 'MEDIUM') return 'medium';
  if (s === 'HARD') return 'hard';
  return 'neutral';
}

function statusClass(s) {
  const v = (s || '').toUpperCase();
  if (v === 'PUBLISHED') return 'published';
  if (v === 'ARCHIVED') return 'archived';
  return 'draft';
}

// Batch Selection View - shown at /trainer/problems
function BatchSelectionView({ onBatchSelect }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await getTrainerBatches();
      setBatches(res?.data?.data || []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerBreadcrumb items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Problems' },
        ]} />
        <TrainerLoadingState label="Loading batches..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="trainer-page">
        <TrainerBreadcrumb items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Problems' },
        ]} />
        <TrainerErrorState
          title="Couldn't load batches"
          message={error}
          onRetry={fetchBatches}
        />
      </div>
    );
  }

  return (
    <div className="admin-dashboard trainer-page">
      <TrainerBreadcrumb items={[
        { label: 'Trainer', to: '/trainer' },
        { label: 'Problems' },
      ]} />

      <header className="admin-dashboard__header">
        <div className="admin-dashboard__header-text">
          <h1 className="admin-dashboard__title">Problems & Curriculum</h1>
          <p className="admin-dashboard__description">
            Select a batch to manage its coding problems. Collections, topics, and problems are organized per batch.
          </p>
        </div>
      </header>

      {batches.length === 0 ? (
        <TrainerEmptyState
          icon="layers"
          title="No batches available"
          description="You don't have any batches assigned. Contact an administrator to get access to a batch."
        />
      ) : (
        <section className="trainer-card-grid" aria-label="Available batches">
          {batches.map((batch) => (
            <article key={batch.id} className="trainer-batch-card">
              <header className="trainer-batch-card__header">
                <div className="trainer-batch-card__identity">
                  <span className="trainer-batch-card__icon" aria-hidden="true">
                    <Eye size={18} />
                  </span>
                  <div className="trainer-batch-card__content">
                    <h2 className="trainer-batch-card__title" onClick={() => onBatchSelect(batch.id)}>
                      {batch.name || NOT_AVAILABLE}
                    </h2>
                    {batch.code && (
                      <p className="trainer-batch-card__description">
                        Code: {batch.code}
                      </p>
                    )}
                  </div>
                </div>
                {batch.status && <StatusBadge status={batch.status} />}
              </header>
              <hr className="trainer-batch-card__divider" />
              <div className="trainer-batch-card__metadata">
                <div className="trainer-batch-card__metadata-row">
                  <span className="trainer-batch-card__metadata-icon" aria-hidden="true">
                    <Eye size={16} />
                  </span>
                  <span className="trainer-batch-card__metadata-label">Students</span>
                  <span className="trainer-batch-card__metadata-value">
                    {formatCount(Number(batch.studentCount) || 0)}
                  </span>
                </div>
              </div>
              <footer className="trainer-batch-card__footer">
                <button
                  type="button"
                  className="trainer-batch-card__action"
                  onClick={() => onBatchSelect(batch.id)}
                >
                  Manage Problems
                  <Eye size={16} />
                </button>
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

// Workspace view for selected batch
function BatchWorkspace({ batchId, batchName }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Loading and error are tracked PER SECTION. A single shared flag made the
  // collections list fall back to its spinner while problems were still
  // loading, and made a topic failure blank the collections panel as well.
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState(null);
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [problemsError, setProblemsError] = useState(null);

  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [allProblems, setAllProblems] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState('collection'); // 'collection' or 'topic'
  const [createForm, setCreateForm] = useState({ name: '', description: '', order: 1 });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createErrors, setCreateErrors] = useState([]);

  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [editErrors, setEditErrors] = useState([]);
  const [editSaving, setEditSaving] = useState(false);

  // Workspace-level outcome of a mutation (e.g. "archived instead of deleted").
  // It lives here because the panels it refers to are torn down by the action.
  const [notice, setNotice] = useState(null);

  // "Add Problem" gate: the entry points are only offered once the trainer has
  // said WHICH collection the new work belongs to.
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addCollection, setAddCollection] = useState('');

  const [importModalOpen, setImportModalOpen] = useState(false);

  // Load collections
  const loadCollections = useCallback(async () => {
    try {
      // Scoped to the batch being viewed, so a trainer who owns several batches
      // never sees (or creates into) another batch's collections.
      const res = await getTrainerCollections({ batchId, owned: true });
      const data = res?.data?.data || [];
      // Filter to only owned collections (in case API ignores params)
      const ownedCollections = data.filter(collection => collection.owned);
setCollections(ownedCollections);
      setCollectionsError(null);
      // Deliberately NOT auto-selecting a collection: the content panel then
      // shows a "Choose a collection" empty state instead of silently loading
      // the first batch's curriculum, and switching batches can never leave the
      // previous batch's topics on screen.
    } catch (err) {
      setCollectionsError(err?.response?.data?.message || 'Failed to load collections');
    } finally {
      setCollectionsLoading(false);
    }
  }, []);  // Empty deps - fetch once on mount

  useEffect(() => {
    setCollectionsLoading(true);
    loadCollections();
  }, []);  // Empty deps - run once on mount

// Fetch the topics of a collection. Extracted so mutations (create / archive /
  // delete topic) can refresh the same list the initial load uses.
  const loadTopics = useCallback(async (collectionId, { keepSelection = false } = {}) => {
    if (!collectionId) return;
    setTopicsLoading(true);
    try {
      const res = await getTrainerCollectionTopics(collectionId);
      setTopics(res?.data?.data || []);
      if (!keepSelection) {
        setSelectedTopic('');
        setAllProblems([]);
      }
      setTopicsError(null);
    } catch (err) {
      setTopics([]);
      // Surface the server message, like the collections and problems paths.
      setTopicsError(err?.response?.data?.message || 'Failed to load topics');
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  // Load topics when collection changes
  useEffect(() => {
    if (!selectedCollection) {
      setTopics([]);
      setSelectedTopic('');
      setAllProblems([]);
      return;
    }
    // Deliberately NOT auto-selecting a topic: problems are only ever shown for
    // the topic the trainer actually chose, so a collection switch can never
    // leave the previous topic's problems on screen.
    loadTopics(selectedCollection.id);
  }, [selectedCollection, loadTopics]);

  // Load problems when topic changes
  const loadProblems = useCallback(async () => {
    if (!selectedCollection || !selectedTopic) return;
    setProblemsLoading(true);
    try {
      const res = await getBatchProblems(batchId, {
        collectionId: selectedCollection.id,
        topicId: selectedTopic,
      });
      setAllProblems(res?.data?.data || []);
      setProblemsError(null);
    } catch (err) {
      setProblemsError(err?.response?.data?.message || 'Failed to load problems');
    } finally {
      setProblemsLoading(false);
    }
  }, [batchId, selectedCollection, selectedTopic]);

  useEffect(() => {
    if (selectedTopic === '' || !selectedCollection) {
      setAllProblems([]);
      return;
    }
    loadProblems();
  }, [loadProblems]);

  // Select the collection named in the URL once the list has loaded. Nothing
  // else sets one, and the topicId sync below requires a collection: without
  // this a deep link such as ?collectionId=...&topicId=... rendered an empty
  // workspace with no problems section at all.
  useEffect(() => {
    const urlCollectionId = searchParams.get('collectionId');
    if (!urlCollectionId || selectedCollection || collectionsLoading) return;
    const match = collections.find((c) => (c.id || c._id) === urlCollectionId);
    if (match) setSelectedCollection({ ...match, id: match.id || match._id });
  }, [searchParams, collections, collectionsLoading, selectedCollection]);

  // Sync selectedTopic with URL search param
  useEffect(() => {
    const urlTopicId = searchParams.get('topicId');
    if (urlTopicId && selectedCollection) {
      const topic = topics.find((t) => t.id === urlTopicId);
      if (topic) {
        setSelectedTopic(urlTopicId);
      }
    }
  }, [searchParams, selectedCollection, topics]);

  // Create collection
  const handleCreateCollection = async () => {
    if (!createForm.name.trim()) {
      setCreateErrors([{ message: 'Name is required' }]);
      return;
    }

    setCreateSubmitting(true);
    try {
      const payload = {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        batchId,
      };
const res = await createTrainerCollection(payload);
      await loadCollections();
      // POST returns the raw document, which serialises `_id` rather than `id`.
      // Selecting it unchanged left `collection.id` undefined, so its topics
      // were never fetched after a successful create.
      const created = res.data?.data;
      const newCollection = created ? { ...created, id: created.id || created._id } : null;
      setSelectedCollection(newCollection);
      setCreateModalOpen(false);
      setCreateForm({ name: '', description: '', order: 1 });
      // Confirm the outcome; previously a successful create gave no feedback.
      setNotice(`Training “${payload.name}” created`);
    } catch (err) {
      setCreateErrors([{ message: err?.response?.data?.message || 'Failed to create collection' }]);
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Create topic
  const handleCreateTopic = async () => {
    if (!createForm.name.trim()) {
      setCreateErrors([{ message: 'Name is required' }]);
      return;
    }

    setCreateSubmitting(true);
    try {
      const payload = {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        order: Number(createForm.order) || 1,
      };
      await createTrainerTopic(selectedCollection.id, payload);
      await loadCollections();
      // The topic dropdown is what shows the new topic, so it must refresh too.
      await loadTopics(selectedCollection.id);
      setCreateModalOpen(false);
      setCreateForm({ name: '', description: '', order: 1 });
    } catch (err) {
      setCreateErrors([{ message: err?.response?.data?.message || 'Failed to create topic' }]);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openAddProblem = useCallback(() => {
    setAddCollection(selectedCollection?.id || '');
    setAddDialogOpen(true);
  }, [selectedCollection]);

  // The template names the topic so a trainer can see which lesson it belongs
  // to. It must belong to the collection chosen in the dialog: naming a topic
  // from another collection would create a look-alike rather than reuse it.
const topicNameForTemplate = useCallback((collectionId) => {
    // The selected topic only counts when the dialog is still pointed at the
    // collection it was loaded from. Naming a topic from another collection
    // would create a look-alike lesson rather than reusing the existing one.
    if (!collectionId || collectionId !== selectedCollection?.id) return 'Arrays';
    const match = topics.find((t) => t.id === selectedTopic);
    return match ? match.name : 'Arrays';
  }, [topics, selectedTopic, selectedCollection]);

  const handleDownloadTemplateFile = async () => {
    try {
const data = await downloadProblemTemplateFile(batchId, { asJson: true });
      // The server supplies the canonical example rows; the topic is resolved
      // here so the file names the lesson actually being worked on. Neither the
      // collection nor the batch is ever written into the file — those are
      // chosen in the UI at import time, so a template cannot be edited into
      // importing somewhere else.
      const payload = { ...data, topic: topicNameForTemplate(addCollection) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trainer_problem_template.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setProblemsError('Failed to download template');
    }
  };

  // A problem is never "deleted": archiving it hides it and Restore brings it
  // back, so its confirm label has to say Restore rather than Delete.
  const isDeleteAction = (target) => {
    if (!target) return false;
    if (target.action) return target.action === 'delete';
    return target.status === 'ARCHIVED' && target.kind !== 'problem';
  };

  const confirmLabelFor = (target) => {
    if (!target) return 'Confirm';
    if (target.kind === 'problem') return target.status === 'ARCHIVED' ? 'Restore' : 'Archive';
    return isDeleteAction(target) ? 'Delete' : 'Archive';
  };

  // Open the edit dialog for a collection or a topic.
  const openEdit = (kind, item) => {
    setEditTarget({ kind, item });
    setEditForm({ name: item.name || '', description: item.description || '' });
    setEditErrors([]);
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditErrors([]);
  };

  // Only fields the trainer API accepts are sent — never `batch` or `owned`.
  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) {
      setEditErrors(['Name is required']);
      return;
    }
    setEditSaving(true);
    const { kind, item } = editTarget;
    try {
      const payload = { name: editForm.name.trim(), description: editForm.description.trim() };
      if (kind === 'collection') {
        await updateTrainerCollection(item.id, payload);
        await loadCollections();
      } else {
        await updateTrainerTopic(selectedCollection.id, item.id, payload);
        await loadTopics(selectedCollection.id, { keepSelection: true });
      }
      closeEdit();
    } catch (err) {
      setEditErrors([err?.response?.data?.message || 'Failed to save changes']);
    } finally {
      setEditSaving(false);
    }
  };

  // Routes a confirmed action to the handler for whatever was targeted.
  // Previously every confirmation dispatched to the collection handlers, so
  // archiving a problem called deleteTrainerCollection(problemId).
  const handleConfirmAction = async () => {
    if (!archiveTarget) return;
    const isArchived = archiveTarget.status === 'ARCHIVED';
    switch (archiveTarget.kind) {
      case 'topic':
        if (archiveTarget.action === 'unarchive') return handleUnarchiveTopic();
        return isArchived ? handleDeleteTopic() : handleArchiveTopic();
      case 'problem':
        // An archived problem is offered Restore; otherwise the action archives it.
        return isArchived ? handleRestoreProblem() : handleArchiveProblem();
      default:
        return isDeleteAction(archiveTarget) ? handleDeleteCollection() : handleArchiveCollection();
    }
  };

  // Archive collection
  const handleArchiveCollection = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    try {
      await updateTrainerCollection(archiveTarget.id, { status: 'ARCHIVED' });
      setArchiveTarget(null);
      await loadCollections();
      setSelectedCollection(null);
      setTopics([]);
      setAllProblems([]);
    } catch (err) {
      setCollectionsError(err?.response?.data?.message || 'Failed to archive collection');
    } finally {
      setArchiveSaving(false);
    }
  };

  // Delete collection
  const handleDeleteCollection = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    try {
      const res = await deleteTrainerCollection(archiveTarget.id);
      setArchiveTarget(null);
      await loadCollections();
      setSelectedCollection(null);
      setTopics([]);
      setAllProblems([]);
      // The API refuses a hard delete while the collection still has content
      // and answers `archived` instead — that outcome has to be reported.
      if (res?.data?.data?.archived) {
        setNotice('The collection still contains topics or problems, so it was archived instead of deleted.');
      }
    } catch (err) {
      setCollectionsError(err?.response?.data?.message || 'Failed to delete collection');
    } finally {
      setArchiveSaving(false);
    }
  };

  // Archive topic
  const handleArchiveTopic = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    try {
      await updateTrainerTopic(selectedCollection.id, archiveTarget.id, { status: 'ARCHIVED' });
      setArchiveTarget(null);
      await loadCollections();
      await loadTopics(selectedCollection.id, { keepSelection: true });
      setSelectedTopic('');
      setAllProblems([]);
    } catch (err) {
      setTopicsError(err?.response?.data?.message || 'Failed to archive topic');
    } finally {
      setArchiveSaving(false);
    }
  };

  // Delete topic
  const handleDeleteTopic = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    try {
      await deleteTrainerTopic(selectedCollection.id, archiveTarget.id);
      setArchiveTarget(null);
      await loadCollections();
      await loadTopics(selectedCollection.id);
      setSelectedTopic('');
      setAllProblems([]);
    } catch (err) {
      setTopicsError(err?.response?.data?.message || 'Failed to delete topic');
    } finally {
      setArchiveSaving(false);
    }
  };

  // Restore an archived topic.
  const handleUnarchiveTopic = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    try {
      await updateTrainerTopic(selectedCollection.id, archiveTarget.id, { status: 'ACTIVE' });
      setArchiveTarget(null);
      await loadTopics(selectedCollection.id, { keepSelection: true });
    } catch (err) {
      setTopicsError(err?.response?.data?.message || 'Failed to restore topic');
    } finally {
      setArchiveSaving(false);
    }
  };

  // Archive problem
  const handleArchiveProblem = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    try {
      await deleteProblem(batchId, archiveTarget.id);
      setArchiveTarget(null);
      await loadCollections();
    } catch (err) {
      setProblemsError(err?.response?.data?.message || 'Failed to archive problem');
    } finally {
      setArchiveSaving(false);
    }
  };

  // Restore problem
  const handleRestoreProblem = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    try {
      await unarchiveProblem(batchId, archiveTarget.id);
      setArchiveTarget(null);
      await loadCollections();
    } catch (err) {
      setProblemsError(err?.response?.data?.message || 'Failed to restore problem');
    } finally {
      setArchiveSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await downloadProblemTemplate(batchId);
      const blob = new Blob([res.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trainer_problem_template.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setProblemsError('Failed to download template');
    }
  };

  // Filtered data
  const filteredCollections = collections.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // The API already scopes the response, but the list is filtered again here so a
  // mis-scoped or mixed response can never show another collection's or topic's
  // problems under the wrong heading.
  const filteredProblems = allProblems.filter((p) => {
    if (selectedCollection && p.collectionId !== selectedCollection.id) return false;
    if (selectedTopic && p.topicId !== selectedTopic) return false;
    if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (difficultyFilter && p.difficulty !== difficultyFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  // Counts
  const collectionCount = collections.length;
  const topicCount = collections.reduce((sum, c) => sum + (c.topicCount || 0), 0);
  const totalProblemCount = allProblems.length;
  const publishedCount = allProblems.filter((p) => p.status === 'PUBLISHED').length;

  // Create URL
  const createUrl = selectedCollection
    ? `/trainer/batches/${batchId}/problems/create?collectionId=${selectedCollection.id}&topicId=${selectedTopic}`
    : `/trainer/batches/${batchId}/problems/create`;

  const editUrl = (p) => selectedCollection
    ? `/trainer/batches/${batchId}/problems/${p.id}/edit?collectionId=${selectedCollection.id}&topicId=${selectedTopic}`
    : `/trainer/batches/${batchId}/problems/${p.id}/edit`;

  return (
    <div className="trainer-problems">
      {/* Breadcrumb */}
      <TrainerBreadcrumb items={[
        { label: 'Trainer', to: '/trainer' },
        { label: 'Problems', to: '/trainer/problems' },
        { label: batchName || NOT_AVAILABLE },
      ]} />

{/* Header. Uses the trainer-* prefix: this is a Trainer page, and the Admin
          dashboard classes it previously borrowed are not part of this module. */}
      <header className="admin-dashboard__header trainer-page-header">
        <div className="admin-dashboard__header-text">
          <h1 className="admin-dashboard__title">Problems</h1>
          <p className="admin-dashboard__description">
            Manage collections, topics, and coding problems for student practice.
          </p>
        </div>
        <div className="admin-dashboard__header-actions">
          <Button variant="primary" onClick={() => { setCreateType('collection'); setCreateModalOpen(true); }}>
            <Plus size={16} /> Create Collection
          </Button>
        </div>
      </header>

      {/* KPI summary */}
      <TrainerKpiGrid title="Summary">
        <TrainerKpiCard label="Collections" icon="layers" value={formatCount(collectionCount)} meta="Organized collections" tone="red" />
        <TrainerKpiCard label="Topics" icon="layers" value={formatCount(topicCount)} meta="Topics across collections" tone="blue" />
        <TrainerKpiCard label="Total Problems" icon="fileCode" value={formatCount(totalProblemCount)} meta="Batch scoped problems" tone="green" />
        <TrainerKpiCard label="Published" icon="checkSquare" value={formatCount(publishedCount)} meta="Visible to students" tone="orange" />
      </TrainerKpiGrid>

      {/* Workspace */}
      <div className="trainer-problems__workspace">
        {notice && (
          <TrainerNotice tone="info" message={notice} onDismiss={() => setNotice(null)} />
        )}
        {collectionsLoading && (
          <div className="admin-problems__collections-panel" aria-label="Collections">
            <div className="admin-problems__panel-header">
              <h2 className="admin-problems__panel-title">Collections</h2>
            </div>
            <TrainerLoadingState label="Loading collections..." />
          </div>
        )}
        {collectionsError && (
          <div className="admin-problems__collections-panel" aria-label="Collections">
            <div className="admin-problems__panel-header">
              <h2 className="admin-problems__panel-title">Collections</h2>
            </div>
            <TrainerErrorState
              title="Couldn't load collections"
              message={collectionsError}
              onRetry={loadCollections}
            />
          </div>
        )}
        {!collectionsLoading && !collectionsError && (
          <section className="admin-problems__collections-panel" aria-label="Collections">
            <div className="admin-problems__panel-header">
              <h2 className="admin-problems__panel-title">Collections ({collectionCount})</h2>
              <input
                type="text"
                className="admin-input"
                aria-label="Search collections"
                placeholder="Search collections"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="admin-problems__panel-content">
{filteredCollections.length === 0 ? (
                  <TrainerEmptyState
                    icon="layers"
                    title="No Collections Yet"
                    description="Create a collection for your batch before adding topics and problems."
                  >
                    {/* Named distinctly from the header action so the two entry
                        points are distinguishable to a screen reader. */}
                    <Button
                      variant="primary"
                      onClick={() => { setCreateType('collection'); setCreateModalOpen(true); }}
                    >
                      Create your first collection
                    </Button>
                  </TrainerEmptyState>
                ) : (
                filteredCollections.map((collection) => (
                  <div
                    key={collection.id}
                    className={`admin-problems__collection-item ${selectedCollection?.id === collection.id ? 'admin-problems__collection-item--selected' : ''}`}
                    onClick={() => setSelectedCollection(collection)}
                  >
                    <div className="admin-problems__collection-item-icon">
                      <Eye size={14} />
                    </div>
                    <div className="admin-problems__collection-item-content">
                      <h3 className="admin-problems__collection-item-title">
                        {collection.name}
                      </h3>
                      <p className="admin-problems__overview-row-meta">
                        {collection.topicCount || 0} topics · {collection.problemCount || 0} problems
                      </p>
                    </div>
                    {collection.owned && (
                      <div className="admin-problems__overview-row-actions">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Edit ${collection.name}`}
                          title="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTarget({ kind: 'collection', item: collection });
                          }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </Button>
                        {collection.status !== 'ARCHIVED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`Archive ${collection.name}`}
                            title="Archive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setArchiveTarget({ ...collection, kind: 'collection', action: 'archive' });
                            }}
                          >
                            <Archive size={14} aria-hidden="true" />
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Delete ${collection.name}`}
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchiveTarget({ ...collection, kind: 'collection', action: 'delete' });
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Content panel */}
        {selectedCollection && (
          <section className="admin-problems__content-panel" aria-label="Content panel">
            {/* Breadcrumb */}
            <nav className="admin-problems__breadcrumb">
              <span className="admin-problems__breadcrumb-link">Collections</span>
              <span className="admin-problems__breadcrumb-separator">/</span>
              <span className="admin-problems__breadcrumb-current">
                {selectedCollection.name}
              </span>
            </nav>

            {/* Topics section */}
            {topicsLoading && (
              <div className="admin-problems__topics-section">
                <div className="admin-problems__topics-header">
                  <h3 className="admin-problems__section-title">Topics</h3>
                </div>
                <TrainerLoadingState label="Loading topics..." />
              </div>
            )}
            {topicsError && !topicsLoading && (
              <div className="admin-problems__topics-section">
                <div className="admin-problems__topics-header">
                  <h3 className="admin-problems__section-title">Topics</h3>
                </div>
                <TrainerErrorState
                  title="Couldn't load topics"
                  message={topicsError}
                  onRetry={() => {
                    if (selectedCollection) loadTopics(selectedCollection.id);
                  }}
                />
              </div>
            )}
            {!topicsLoading && !topicsError && (
              <div className="admin-problems__topics-section">
                <div className="admin-problems__topics-header">
                  <h3 className="admin-problems__section-title">Topics ({topics.length})</h3>
                  <div className="admin-problems__topics-toolbar">
                    <select
                      className="admin-input admin-problems__topic-selector"
                      aria-label="Select topic"
                      value={selectedTopic}
                      onChange={(e) => { setSelectedTopic(e.target.value); }}
                    >
                      <option value="">Select a topic...</option>
                      {topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.name} ({topic.problemCount || 0} problems)
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="primary"
                      onClick={() => { setCreateType('topic'); setCreateModalOpen(true); }}
                    >
                      <Plus size={14} /> Add Topic
                    </Button>
                  </div>
                </div>

                {/* TrainerNotice takes `tone` + `message`; passing `variant`/children made it
                    render nothing, so these errors were silently swallowed. */}
                {topicsError && (
                  <TrainerNotice tone="error" message={topicsError} />
                )}

                {topics.length === 0 && (
                  <TrainerEmptyState
                    icon="layers"
                    title="No topics yet"
                    description="Create a topic in this collection before adding problems."
                  />
                )}

                {topics.length > 0 && !selectedTopic && (
                  <TrainerEmptyState
                    icon="layers"
                    title="Choose a topic"
                    description="Select a topic from the dropdown to see its problems."
                  />
                )}

                {/* Per-topic actions, shown once a topic is selected. */}
                {selectedTopic && (
                  <div className="admin-problems__section-actions">
                    {(() => {
                      const current = topics.find((t) => t.id === selectedTopic);
                      if (!current) return null;
                      const isArchived = current.status === 'ARCHIVED';
                      return (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label="Edit Topic"
                            onClick={() => openEdit('topic', current)}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            Edit Topic
                          </Button>
                          {!isArchived ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label="Archive"
                              onClick={() => setArchiveTarget({ ...current, kind: 'topic', action: 'archive' })}
                            >
                              <Archive size={14} aria-hidden="true" />
                              Archive
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label="Unarchive"
                              onClick={() => setArchiveTarget({ ...current, kind: 'topic', action: 'unarchive' })}
                            >
                              <EyeOff size={14} aria-hidden="true" />
                              Unarchive
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label="Delete"
                            onClick={() => setArchiveTarget({ ...current, kind: 'topic', action: 'delete' })}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            Delete
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                )}

                {selectedTopic && (
                  <>
                    {/* Problems section */}
                    {problemsLoading && (
                      <div className="admin-problems__problems-section">
                        <div className="admin-problems__problems-header">
                          <h3 className="admin-problems__section-title">Problems</h3>
                        </div>
                        <TrainerLoadingState label="Loading problems..." />
                      </div>
                    )}
                    {problemsError && !problemsLoading && (
                      <div className="admin-problems__problems-section">
                        <div className="admin-problems__problems-header">
                          <h3 className="admin-problems__section-title">Problems</h3>
                        </div>
                        <TrainerErrorState
                          title="Couldn't load problems"
                          message={problemsError}
                          onRetry={() => {
                            if (selectedTopic && selectedCollection) {
                              setProblemsLoading(true);
                              getBatchProblems(batchId, { collectionId: selectedCollection.id, topicId: selectedTopic })
                                .then((res) => {
                                  setAllProblems(res?.data?.data || []);
                                  setProblemsError(null);
                                })
                                .catch((err) => {
                                  setProblemsError(err?.response?.data?.message || 'Failed to load problems');
                                })
                                .finally(() => {
                                  setProblemsLoading(false);
                                });
                            }
                          }}
                        />
                      </div>
                    )}
                    {!problemsLoading && !problemsError && (
                      <div className="admin-problems__problems-section">
                        <div className="admin-problems__problems-header">
                          <h3 className="admin-problems__section-title">Problems ({filteredProblems.length})</h3>
                          <div className="admin-problems__problems-header-toolbar">
                            <input
                              type="text"
                              className="admin-input"
                              aria-label="Search problems"
                              placeholder="Search problems"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <select
                              className="admin-select"
                              aria-label="Filter by difficulty"
                              value={difficultyFilter}
                              onChange={(e) => setDifficultyFilter(e.target.value)}
                            >
                              <option value="">All Difficulties</option>
                              <option value="EASY">Easy</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="HARD">Hard</option>
                            </select>
                            <select
                              className="admin-select"
                              aria-label="Filter by status"
                              value={statusFilter}
                              onChange={(e) => setStatusFilter(e.target.value)}
                            >
                              <option value="">All Statuses</option>
                              <option value="DRAFT">Draft</option>
                              <option value="PUBLISHED">Published</option>
                              <option value="ARCHIVED">Archived</option>
                            </select>
                            <Button
                              variant="secondary"
                              onClick={handleDownloadTemplate}
                            >
                              <Download size={14} /> Template
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => setImportModalOpen(true)}
                            >
                              <Upload size={14} /> Import JSON
                            </Button>
                            <Button
                              variant="primary"
                              onClick={openAddProblem}
                            >
                              <Plus size={14} /> Add Problem
                            </Button>
                          </div>
                        </div>

                        {/* The second branch was previously unreachable (both tested
                            filteredProblems.length === 0), so filtering every problem
                            out reported "No problems yet" instead. */}
                        {allProblems.length === 0 ? (
                          <TrainerEmptyState
                            icon="fileCode"
                            title="No problems yet"
                            description="Create your first problem or import a batch from JSON."
                          >
                            <Button variant="secondary" onClick={() => setImportModalOpen(true)}>
                              Import JSON
                            </Button>
                            <Button variant="primary" onClick={() => navigate(createUrl)}>
                              Add Problem
                            </Button>
                          </TrainerEmptyState>
                        ) : filteredProblems.length === 0 ? (
                          <TrainerEmptyState
                            icon="search"
                            title="No matching problems"
                            description="No problems match your search or filters."
                          />
                        ) : (
                          <div className="admin-problems__problems-table-container">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Title</th>
                                  <th>Difficulty</th>
                                  <th>Status</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredProblems.map((problem, idx) => (
                                  <tr key={problem.id}>
                                    <td>{idx + 1}</td>
                                    <td>
                                      <div className="table-cell-content">
                                        <div className="table-cell-title">{problem.title}</div>
                                        {problem.description && (
                                          <div className="table-cell-description">{problem.description}</div>
                                        )}
                                      </div>
                                    </td>
                                    <td>
                                      <span className={`admin-badge admin-badge--${difficultyClass(problem.difficulty)}`}>
                                        {problem.difficulty || 'EASY'}
                                      </span>
                                    </td>
                                    <td>
                                      <span className={`admin-badge admin-badge--${statusClass(problem.status)}`}>
                                        {problem.status || 'DRAFT'}
                                      </span>
                                    </td>
<td>
                                          <div className="table-actions">
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => navigate(`/trainer/batches/${batchId}/problems/${problem.id}`)}
                                              aria-label="View"
                                              title="View"
                                            >
                                              <Eye size={14} aria-hidden="true" />
                                            </Button>
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => navigate(editUrl(problem))}
                                              aria-label="Edit"
                                              title="Edit"
                                            >
                                              <Pencil size={14} aria-hidden="true" />
                                            </Button>
                                            {problem.status !== 'ARCHIVED' ? (
                                              <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setArchiveTarget({ ...problem, kind: 'problem' })}
                                                aria-label="Archive"
                                                title="Archive"
                                              >
                                                <Archive size={14} aria-hidden="true" />
                                              </Button>
                                            ) : (
                                              <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setArchiveTarget({ ...problem, kind: 'problem' })}
                                                aria-label="Restore"
                                                title="Restore"
                                              >
                                                <EyeOff size={14} aria-hidden="true" />
                                              </Button>
                                            )}
                                          </div>
                                        </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {/* No collection selected */}
        {!selectedCollection && filteredCollections.length > 0 && (
          <section className="admin-problems__content-panel" aria-label="content panel">
            <TrainerEmptyState
              icon="layers"
              title="Choose a collection"
              description="Select a collection from the left to view its topics and problems."
            />
          </section>
        )}
      </div>

      {/* Archive confirmation.
          TrainerConfirmDialog renders its `children` as the body and takes
          `tone` (not `message`/`variant`), so the consequence text was never
          being shown before this page passed the right props.
          The target carries a `kind` so the dialog can never dispatch to the
          collection handlers when a topic or a problem is what was clicked. */}
      <TrainerConfirmDialog
        isOpen={!!archiveTarget}
        title="Confirm Action"
        confirmLabel={confirmLabelFor(archiveTarget)}
        tone={isDeleteAction(archiveTarget) ? 'danger' : 'primary'}
        loading={archiveSaving}
        onConfirm={handleConfirmAction}
        onClose={() => setArchiveTarget(null)}
      >
        {archiveTarget?.status === 'ARCHIVED' ? (
          <p>
            {archiveTarget?.kind === 'problem'
              ? `Restore "${archiveTarget?.title}"? Students will see it again.`
              : `Delete "${archiveTarget?.title || archiveTarget?.name}"? This action cannot be undone.`}
          </p>
        ) : (
          <p>
            Archive &quot;{archiveTarget?.title || archiveTarget?.name}&quot;? Students will no longer see it,
            but its submissions and its completion history are kept.
          </p>
        )}
      </TrainerConfirmDialog>

      {/* Add Problem gate: every entry point requires a target collection. */}
      {addDialogOpen && (
        <Modal isOpen onClose={() => setAddDialogOpen(false)} title="Add Problem">
        <div className="admin-problems__modal-body">
          <label className="admin-label" htmlFor="add-collection-select">Collection</label>
          <select
            id="add-collection-select"
            className="admin-input"
            value={addCollection}
            onChange={(e) => setAddCollection(e.target.value)}
          >
            <option value="">Select a collection...</option>
            {/* Only collections this trainer owns are ever offered. */}
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {addCollection && (
            <div className="admin-problems__modal-actions">
              <Button variant="secondary" onClick={handleDownloadTemplateFile}>
                <Download size={14} aria-hidden="true" />
                Download Template
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setImportModalOpen(true); setAddDialogOpen(false); }}
              >
                <Upload size={14} aria-hidden="true" />
                Import JSON File
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setImportModalOpen(true); setAddDialogOpen(false); }}
              >
                Enter JSON Text
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setAddDialogOpen(false);
                  setCreateType('topic');
                  setCreateModalOpen(true);
                }}
              >
                <Plus size={14} aria-hidden="true" />
                Add Topic
              </Button>
            </div>
          )}
</div>
        </Modal>
      )}

      {/* Grouped JSON import, scoped to the chosen collection and topic. */}
      {importModalOpen && (
        <ProblemImportModal
          isOpen
          onClose={() => setImportModalOpen(false)}
          batchId={batchId}
          // The toolbar's "Import JSON" opens this directly, without the Add Problem
          // dialog, so fall back to the collection the trainer is actually
          // looking at. Passing only addCollection imported into nothing.
          collectionId={addCollection || selectedCollection?.id || ''}
          topicId={selectedTopic}
          topics={topics}
          onImported={async (summary) => {
            // Refresh either way, but only close on a clean import: a partial
            // failure leaves the server's row errors on screen, and closing
            // here made a half-failed import look like a finished one.
            if (!summary?.failed) setImportModalOpen(false);
            // An import changes what the trainer is looking at in all three
            // places at once. Refreshing only the collections left the problem
            // list and the per-collection/per-topic counts stale until the
            // trainer changed topic by hand.
            await loadCollections();
            if (selectedCollection) await loadTopics(selectedCollection.id, { keepSelection: true });
            await loadProblems();
            setNotice('Topics, problems and counts are up to date');
          }}
        />
      )}

      {/* Edit collection / topic */}
      <Modal isOpen={!!editTarget} onClose={closeEdit} title={`Edit ${editTarget?.kind === 'topic' ? 'Topic' : 'Collection'}`}>
        <div className="admin-problems__modal-body">
          <label className="admin-label" htmlFor="edit-name-input">
            {editTarget?.kind === 'topic' ? 'Topic name' : 'Collection name'}
          </label>
          <input
            id="edit-name-input"
            type="text"
            className="admin-input"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />

          <label className="admin-label" htmlFor="edit-desc-input">Description</label>
          <textarea
            id="edit-desc-input"
            className="admin-input"
            rows={3}
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
          />

          {editErrors.length > 0 && (
            <TrainerNotice tone="error" message={editErrors.join(' ')} />
          )}

          <div className="admin-problems__modal-actions">
            <Button variant="secondary" onClick={closeEdit}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveEdit} loading={editSaving}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setCreateForm({ name: '', description: '', order: 1 });
          setCreateErrors([]);
        }}
        title={`Create ${createType}`}
      >
        <div className="admin-problems__modal-body">
          <label className="admin-label" htmlFor="name-input">
            {createType === 'collection' ? 'Collection name' : 'Topic name'}
          </label>
          <input
            id="name-input"
            type="text"
            className="admin-input"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
          />

          <label className="admin-label" htmlFor="desc-input">Description</label>
          <textarea
            id="desc-input"
            className="admin-input"
            rows={3}
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
          />

{createType === 'topic' && (
              <>
                <label className="admin-label" htmlFor="order-input">Order</label>
                <input
                  id="order-input"
                  type="number"
                  className="admin-input"
                value={createForm.order}
                onChange={(e) => setCreateForm({ ...createForm, order: e.target.value })}
              />
            </>
          )}

          {createErrors.length > 0 && (
            <TrainerNotice
              tone="error"
              message={createErrors.map((e) => e.message).join(' ')}
            />
          )}

          <div className="admin-problems__modal-actions">
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={createType === 'collection' ? handleCreateCollection : handleCreateTopic}
              disabled={createSubmitting}
            >
{createSubmitting
                ? 'Saving...'
                : createType === 'collection' ? 'Create Collection' : 'Create Topic'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

// Main component
export default function ProblemsList() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);

  // Load batch if batchId present
  useEffect(() => {
    if (!batchId) return;
    getTrainerBatch(batchId)
      .then((res) => setBatch(res?.data?.data || null))
      .catch(() => navigate('/trainer/problems'));
  }, [batchId, navigate]);

  const handleBatchSelect = (id) => {
    navigate(`/trainer/batches/${id}/problems`);
  };

  // No batchId: show batch selection view
  if (!batchId) {
    return <BatchSelectionView onBatchSelect={handleBatchSelect} />;
  }

  // With batchId: show workspace
  return <BatchWorkspace batchId={batchId} batchName={batch?.name} />;
}
