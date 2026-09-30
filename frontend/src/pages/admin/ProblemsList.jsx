import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  getAdminProblems, deleteAdminProblem, bulkImportProblems, downloadProblemTemplate,
  getAdminCollections, getAdminTopics, getAdminTopicProblems,
  createAdminCollection, updateAdminCollection, deleteAdminCollection,
  createAdminTopic, updateAdminTopic, deleteAdminTopic,
  createAdminProblem, linkAdminTopicProblems
} from '../../api/admin';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import {
  ChevronRight, ChevronDown, ChevronLeft, Pencil, Trash2, Plus,
  Eye, Search, Filter, Upload, Download
} from 'lucide-react';
import '../../styles/pages/admin-problems.css';
import '../../styles/pages/admin-problems-hierarchy.css';

export default function ProblemsList() {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Import state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('file');
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [parsedPreview, setParsedPreview] = useState([]);

  // Collection modal state
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [collectionName, setCollectionName] = useState('');
  const [collectionDesc, setCollectionDesc] = useState('');
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);

  // Topic modal state
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);
  const [topicName, setTopicName] = useState('');
  const [topicDesc, setTopicDesc] = useState('');
  const [topicSubmitting, setTopicSubmitting] = useState(false);

  // Problem modal state
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [problemSubmitting, setProblemSubmitting] = useState(false);
  const [problemTitle, setProblemTitle] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [problemDifficulty, setProblemDifficulty] = useState('EASY');
  const [problemStatus, setProblemStatus] = useState('DRAFT');
  const [problemCollectionId, setProblemCollectionId] = useState('');
  const [problemTopicId, setProblemTopicId] = useState('');
  const [problemCollections, setProblemCollections] = useState([]);
  const [problemTopics, setProblemTopics] = useState([]);

  // Delete confirmation state
  const [deleteId, setDeleteId] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteType, setDeleteType] = useState('problem');
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  // Navigation state (collections | topics | problems)
  const [view, setView] = useState('collections');
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);

  // Loading states per level
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [problemsLoading, setProblemsLoading] = useState(false);

  // Data states
  const [collections, setCollections] = useState([]);
  const [topics, setTopics] = useState([]);
  // Mapping of collectionId -> topics array
  const [topicsByCollection, setTopicsByCollection] = useState({});
  // Mapping of topicId -> problems array
  const [problemsByTopic, setProblemsByTopic] = useState({});
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topicsError, setTopicsError] = useState(null);
  const [problemsError, setProblemsError] = useState(null);

  // Fetch collections
  const fetchCollections = useCallback(async () => {
    try {
      const res = await getAdminCollections();
      setCollections(res.data?.data || []);
      // After collections loaded, hide global loading spinner
      setLoading(false);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load collections');
      setLoading(false);
    }
  }, []);

  // Fetch topics for a collection
  const fetchTopics = useCallback(async (collectionId) => {
    try {
      const res = await getAdminTopics(collectionId);
      setTopicsByCollection(prev => ({
        ...prev,
        [collectionId]: res.data?.data || []
      }));
    } catch (err) {
      console.error('Failed to load topics:', err);
    }
  }, []);

  // Fetch problems for a topic
  const fetchTopicProblems = useCallback(async (topicId) => {
    try {
      const res = await getAdminTopicProblems(topicId);
      // Extract actual problem objects from links (link.problem contains the full problem)
      const problems = (res.data?.data || []).map(link => link.problem).filter(Boolean);
      setProblemsByTopic(prev => ({
        ...prev,
        [topicId]: problems
      }));
    } catch (err) {
      console.error('Failed to load topic problems:', err);
    }
  }, []);

  // Fetch all problems (for search/filter)
  const fetchProblems = useCallback(async () => {
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      if (difficultyFilter) params.difficulty = difficultyFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await getAdminProblems(params);
      setProblems(res.data?.data || []);
      // After problems loaded, hide global loading spinner if it was still active
      setLoading(false);
    } catch (err) {
      console.error('Failed to load problems:', err);
      setLoading(false);
    }
  }, [searchQuery, difficultyFilter, statusFilter]);

  useEffect(() => {
    fetchCollections();
    fetchProblems();
  }, [fetchCollections, fetchProblems]);

  useEffect(() => {
    if (collectionModalOpen) {
      fetchCollections();
    }
  }, [collectionModalOpen, fetchCollections]);

  // Accordion handlers
  const handleCollectionClick = (collection) => {
    setSelectedCollection(collection);
    setView('topics');
    const colId = collection._id || collection.id;
    if (!topicsByCollection[colId]) {
      setTopicsLoading(true);
      fetchTopics(colId).finally(() => setTopicsLoading(false));
    }
  };

  const handleTopicClick = (topic) => {
    setSelectedTopic(topic);
    setView('problems');
    const topicId = topic._id || topic.id;
    if (!problemsByTopic[topicId]) {
      setProblemsLoading(true);
      fetchTopicProblems(topicId).finally(() => setProblemsLoading(false));
    }
  };

  // Collection handlers
  const handleOpenCollectionModal = (col = null) => {
    if (col) {
      setEditingCollection(col);
      setCollectionName(col.name || '');
      setCollectionDesc(col.description || '');
    } else {
      setEditingCollection(null);
      setCollectionName('');
      setCollectionDesc('');
    }
    setCollectionModalOpen(true);
  };

  const handleSaveCollection = async (e) => {
    e.preventDefault();
    if (!collectionName.trim()) return;
    setCollectionSubmitting(true);
    try {
      const payload = { name: collectionName, description: collectionDesc };
      if (editingCollection) {
        await updateAdminCollection(editingCollection._id || editingCollection.id, payload);
        setToast({ message: 'Collection updated successfully', type: 'success' });
      } else {
        await createAdminCollection(payload);
        setToast({ message: 'Collection created successfully', type: 'success' });
      }
      setCollectionModalOpen(false);
      await fetchCollections();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to save collection', type: 'error' });
    } finally {
      setCollectionSubmitting(false);
    }
  };

  // Topic handlers
  const handleOpenTopicModal = (top = null, collectionId = null) => {
    if (top) {
      setEditingTopic(top);
      setTopicName(top.name || '');
      setTopicDesc(top.description || '');
    } else {
      setEditingTopic(null);
      setTopicName('');
      setTopicDesc('');
    }
    // Set collection for new topic creation
    if (collectionId && !editingTopic) {
      setTopicCollectionId(collectionId);
    }
    setTopicModalOpen(true);
  };

  const [topicCollectionId, setTopicCollectionId] = useState('');

  const handleSaveTopic = async (e) => {
    e.preventDefault();
    if (!topicName.trim()) return;
    setTopicSubmitting(true);
    try {
      const colId = topicCollectionId || editingCollection?._id || editingCollection?.id;
      if (!colId) {
        setToast({ message: 'No collection selected', type: 'error' });
        return;
      }
      const payload = { name: topicName, description: topicDesc };
      if (editingTopic) {
        await updateAdminTopic(editingTopic._id || editingTopic.id, payload);
        setToast({ message: 'Topic updated successfully', type: 'success' });
      } else {
        await createAdminTopic(colId, payload);
        setToast({ message: 'Topic created successfully', type: 'success' });
      }
      setTopicModalOpen(false);
      await fetchTopics(colId);
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to save topic', type: 'error' });
    } finally {
      setTopicSubmitting(false);
    }
  };

  // Problem modal handlers
  const openProblemModal = (collectionId = null, topicId = null) => {
    setProblemModalOpen(true);
    setProblemTitle('');
    setProblemDescription('');
    setProblemDifficulty('EASY');
    setProblemStatus('DRAFT');
    setProblemCollectionId(collectionId || '');
    setProblemTopicId(topicId || '');
    setProblemTopics([]);
    // Load topics if collection selected
    if (collectionId) {
      fetchTopicsForProblemCollection(collectionId);
    }
  };

  const closeProblemModal = () => {
    setProblemModalOpen(false);
  };

  const fetchTopicsForProblemCollection = async (collectionId) => {
    try {
      const res = await getAdminTopics(collectionId);
      setProblemTopics(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load topics:', err);
    }
  };

  const handleProblemCollectionChange = async (collectionId) => {
    setProblemCollectionId(collectionId);
    setProblemTopicId('');
    setProblemTopics([]);
    if (collectionId) {
      await fetchTopicsForProblemCollection(collectionId);
    }
  };

  const handleSaveProblem = async (e) => {
    e.preventDefault();
    if (!problemTitle.trim()) return;
    setProblemSubmitting(true);
    try {
      const payload = {
        title: problemTitle,
        description: problemDescription,
        difficulty: problemDifficulty,
        status: problemStatus,
      };
      const res = await createAdminProblem(payload);
      const problemId = res.data?.data?.id || res.data?.data?._id;

      if (problemCollectionId && problemTopicId && problemId) {
        try {
          await linkAdminTopicProblems(problemTopicId, { problems: [{ problemId }] });
        } catch (linkErr) {
          console.error('Failed to link problem to topic:', linkErr);
        }
      }

      setToast({ message: 'Problem created successfully', type: 'success' });
      closeProblemModal();

      if (problemTopicId) {
        await fetchTopicProblems(problemTopicId);
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to create problem', type: 'error' });
    } finally {
      setProblemSubmitting(false);
    }
  };

  // Delete handlers
  const confirmDelete = (id, type = 'problem') => {
    setDeleteId(id);
    setDeleteType(type);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      if (deleteType === 'problem') {
        await deleteAdminProblem(deleteId);
        setToast({ message: 'Problem archived successfully', type: 'success' });
        await fetchProblems();
      } else if (deleteType === 'collection') {
        await deleteAdminCollection(deleteId);
        setToast({ message: 'Collection archived successfully', type: 'success' });
        await fetchCollections();
      } else if (deleteType === 'topic') {
        await deleteAdminTopic(deleteId);
        setToast({ message: 'Topic archived successfully', type: 'success' });
        // Refresh topics for the current collection if needed
        if (selectedCollection) {
          const colId = selectedCollection._id || selectedCollection.id;
          fetchTopics(colId);
        }
      }
      setDeleteModalOpen(false);
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to archive item', type: 'error' });
      setDeleteModalOpen(false);
    }
  };

  // Navigation back handlers
  const handleBackToCollections = () => {
    setSelectedCollection(null);
    setView('collections');
  };

  const handleBackToTopics = () => {
    setSelectedTopic(null);
    setView('topics');
  };

  // Template download
  const handleDownloadTemplate = async () => {
    try {
      const res = await downloadProblemTemplate();
      const blob = new Blob([res.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'problem_template.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ message: 'Template downloaded successfully', type: 'success' });
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to download template', type: 'error' });
    }
  };

  // Import handlers
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setToast({ message: 'Please select a valid .json file', type: 'error' });
      setImportFile(null);
      return;
    }
    setImportFile(file);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        setParsedPreview(json);
      } else {
        setParsedPreview([json]);
      }
    } catch (err) {
      setParsedPreview([]);
    }
  };

  const handleImport = async () => {
    try {
      let problemsToImport = [];
      if (importMode === 'file') {
        if (!importFile) {
          setToast({ message: 'Please select a JSON file', type: 'error' });
          return;
        }
        const text = await importFile.text();
        problemsToImport = JSON.parse(text);
      } else {
        problemsToImport = JSON.parse(importText);
      }

      if (!Array.isArray(problemsToImport)) {
        setImportErrors([{ row: 0, message: 'Expected an array of problems' }]);
        setToast({ message: 'Invalid format: expected array of problems', type: 'error' });
        return;
      }

      setImportSubmitting(true);
      const res = await bulkImportProblems({ problems: problemsToImport });
      setImportModalOpen(false);

      if (res.data.success) {
        const summary = res.data.summary;
        let msg = `${summary.created} problem(s) created successfully`;
        if (summary.failed > 0) {
          msg += `, ${summary.failed} failed`;
        }
        setToast({ message: msg, type: summary.failed === summary.total ? 'error' : 'success' });
        if (res.data.errors && res.data.errors.length > 0) {
          setImportErrors(res.data.errors);
        }
      } else {
        setToast({ message: res.data.message || 'Import failed', type: 'error' });
      }

      await fetchProblems();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Import failed / Invalid JSON', type: 'error' });
      setImportErrors([{ row: 0, message: err.message }]);
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleResetImport = () => {
    setImportModalOpen(false);
    setImportFile(null);
    setImportText('');
    setImportErrors([]);
    setParsedPreview([]);
    setImportMode('file');
  };

  // Filter data
  const filteredProblems = problems.filter(p => {
    if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (difficultyFilter && p.difficulty !== difficultyFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const publishedCount = problems.filter(p => p.status === 'PUBLISHED').length;
  const draftCount = problems.filter(p => p.status === 'DRAFT').length;

  // Get topic name for display
  const getTopicName = (topicId) => {
    for (const collectionId in topicsByCollection) {
      const topic = topicsByCollection[collectionId].find(t => (t._id || t.id) === topicId);
      if (topic) return topic.name;
    }
    return 'Unknown';
  };

  // Get collection name for display
  const getCollectionName = (collectionId) => {
    const collection = collections.find(c => (c._id || c.id) === collectionId);
    return collection?.name || 'Unknown';
  };

  return (
    <div className={`admin-problems ${view !== 'collections' ? 'admin-problems--collection-open' : ''}`}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)'
        }}
      >
        <div>
          <h1 style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--text-primary)',
            margin: '0 0 var(--space-1) 0',
            letterSpacing: 'var(--letter-spacing-tight)'
          }}>
            Problems & Curriculum Hub
          </h1>
          <p style={{
            fontSize: 'var(--font-size-base)',
            color: 'var(--text-secondary)',
            margin: 0
          }}>
            Enterprise problem repository, collections, topics, and bulk curation workflows.
          </p>
        </div>
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap'
        }}>
          <Button variant="secondary" onClick={handleDownloadTemplate} icon={Download}>Template</Button>
          <Button variant="secondary" onClick={() => setImportModalOpen(true)} icon={Upload}>Import JSON</Button>
        </div>
      </div>

      {/* KPI Summary */}
      {view === 'collections' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
              Collections
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {collections.length}
            </div>
          </div>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
              Topics
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {Object.values(topicsByCollection).flat().length}
            </div>
          </div>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
              Total Problems
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {problems.length}
            </div>
          </div>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
              Published
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {publishedCount}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {view === 'collections' && (
        <div className="admin-problems__toolbar">
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              className="admin-problems__search"
              placeholder="Search problems..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="admin-problems__filter-select"
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
          >
            <option value="">All Difficulties</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
          <select
            className="admin-problems__filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <Button variant="secondary" onClick={fetchProblems} icon={Filter}>Filter</Button>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Delete Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title={`Archive ${deleteType}`}>
        <div className="admin-problems__modal-content">
          <p>{deleteType === 'collection' ? 'Are you sure you want to archive this collection? All problems within this collection will also be archived (and later permanently deleted on second delete).' : `Are you sure you want to archive this ${deleteType}? This action preserves historical submissions and analytics safely.`}</p>
          <div className="admin-problems__modal-footer">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Confirm Archive</Button>
          </div>
        </div>
      </Modal>

      {/* Collection Modal */}
      <Modal isOpen={collectionModalOpen} onClose={() => setCollectionModalOpen(false)} title={editingCollection ? 'Edit Collection' : 'Create Collection'}>
        <div className="admin-problems__modal-content">
          <form onSubmit={handleSaveCollection} className="admin-problems__form">
            <div className="admin-problems__form-group">
              <label className="admin-problems__label">Collection Name *</label>
              <input
                type="text"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                required
                placeholder="e.g. Data Structures & Algorithms"
                className="admin-problems__input"
              />
            </div>
            <div className="admin-problems__form-group">
              <label className="admin-problems__label">Description</label>
              <textarea
                value={collectionDesc}
                onChange={(e) => setCollectionDesc(e.target.value)}
                rows={3}
                placeholder="Brief description of collection..."
                className="admin-problems__textarea"
              />
            </div>
            <div className="admin-problems__modal-footer">
              <Button type="button" variant="secondary" onClick={() => setCollectionModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={collectionSubmitting}>{collectionSubmitting ? 'Saving...' : 'Save Collection'}</Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Topic Modal */}
      <Modal isOpen={topicModalOpen} onClose={() => setTopicModalOpen(false)} title={editingTopic ? 'Edit Topic' : 'Create Topic'}>
        <div className="admin-problems__modal-content">
          <form onSubmit={handleSaveTopic} className="admin-problems__form">
            <div className="admin-problems__form-group">
              <label className="admin-problems__label">Topic Name *</label>
              <input
                type="text"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                required
                placeholder="e.g. Arrays & Hashing"
                className="admin-problems__input"
              />
            </div>
            <div className="admin-problems__form-group">
              <label className="admin-problems__label">Description</label>
              <textarea
                value={topicDesc}
                onChange={(e) => setTopicDesc(e.target.value)}
                rows={3}
                placeholder="Brief description of topic..."
                className="admin-problems__textarea"
              />
            </div>
            <div className="admin-problems__modal-footer">
              <Button type="button" variant="secondary" onClick={() => setTopicModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={topicSubmitting}>{topicSubmitting ? 'Saving...' : 'Save Topic'}</Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Problem Modal */}
      <Modal isOpen={problemModalOpen} onClose={closeProblemModal} title="Create Problem">
        <div className="admin-problems__modal-content">
          <form onSubmit={handleSaveProblem} className="admin-problems__form">
            <div className="admin-problems__form-group">
              <label className="admin-problems__label">Problem Title *</label>
              <input
                type="text"
                value={problemTitle}
                onChange={(e) => setProblemTitle(e.target.value)}
                required
                placeholder="e.g. Two Sum"
                className="admin-problems__input"
              />
            </div>
            <div className="admin-problems__form-group">
              <label className="admin-problems__label">Description</label>
              <textarea
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                rows={4}
                placeholder="Problem description..."
                className="admin-problems__textarea"
              />
            </div>
            <div className="admin-problems__row">
              <div className="admin-problems__form-group">
                <label className="admin-problems__label">Difficulty</label>
                <select
                  value={problemDifficulty}
                  onChange={(e) => setProblemDifficulty(e.target.value)}
                  className="admin-problems__select"
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
              <div className="admin-problems__form-group">
                <label className="admin-problems__label">Status</label>
                <select
                  value={problemStatus}
                  onChange={(e) => setProblemStatus(e.target.value)}
                  className="admin-problems__select"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </div>
            </div>
            <div className="admin-problems__modal-footer">
              <Button type="button" variant="secondary" onClick={closeProblemModal}>Cancel</Button>
              <Button type="submit" disabled={problemSubmitting}>{problemSubmitting ? 'Creating...' : 'Create Problem'}</Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={importModalOpen} onClose={handleResetImport} title="Bulk Import Problems">
        <div className="admin-problems__modal-content">
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <Button variant={importMode === 'file' ? 'primary' : 'secondary'} onClick={() => setImportMode('file')} style={{ flex: 1 }}>Upload JSON</Button>
            <Button variant={importMode === 'text' ? 'primary' : 'secondary'} onClick={() => setImportMode('text')} style={{ flex: 1 }}>Paste JSON</Button>
          </div>
          {importMode === 'file' ? (
            <div>
              <label htmlFor="import-file" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>Select .json File</label>
              <input
                id="import-file"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}
              />
              {importFile && (
                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                  Selected: {importFile.name} ({parsedPreview.length} items parsed)
                </div>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor="import-text" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>Paste JSON Array</label>
              <textarea
                id="import-text"
                rows={8}
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setParsedPreview(Array.isArray(parsed) ? parsed : [parsed]);
                  } catch {
                    setParsedPreview([]);
                  }
                }}
                placeholder='[{"title": "Two Sum", "difficulty": "EASY", "description": "..."}]'
                style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}
              />
              {parsedPreview.length > 0 && (
                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: '#16a34a' }}>
                  ✓ Valid JSON: {parsedPreview.length} problem(s) ready for import.
                </div>
              )}
            </div>
          )}
          <div className="admin-problems__modal-footer">
            <Button variant="secondary" onClick={handleResetImport} disabled={importSubmitting}>Cancel</Button>
            <Button variant="primary" onClick={handleImport} disabled={importSubmitting || (importMode === 'file' && !importFile) || (importMode === 'text' && !importText.trim())}>
              {importSubmitting ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </Modal>

      {loading && <Spinner />}
      {error && (
        <div style={{ color: '#dc2626', marginBottom: 'var(--space-5)', padding: 'var(--space-4)', background: 'rgba(220, 38, 38, 0.05)', borderRadius: 'var(--radius-md)' }}>
          {error}
        </div>
      )}

      {/* Hierarchy */}
      <div className="admin-problems__hierarchy">
        {view === 'collections' && (
          <>
            {collections.length === 0 ? (
              <div className="admin-problems__empty">
                <p>No collections yet. Create one to get started.</p>
                <Button onClick={() => handleOpenCollectionModal()} icon={Plus}>Create Collection</Button>
              </div>
            ) : (
              collections.map((collection) => {
                const colId = collection._id || collection.id;
                const topics = topicsByCollection[colId] || [];
                const topicCount = collection.topicCount ?? topics.length;
                const problemCount = collection.problemCount ?? topics.reduce((acc, t) => acc + (t.problemCount || 0), 0);
                return (
                  <div key={colId} className="admin-problems__collection">
                    <div
                      className="admin-problems__collection-header"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleCollectionClick(collection)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleCollectionClick(collection);
                        }
                      }}
                    >
                      <div className="admin-problems__collection-info">
                        <div className="admin-problems__collection-title">{collection.name}</div>
                        <div className="admin-problems__collection-meta">
                          {topicCount} {topicCount === 1 ? 'Topic' : 'Topics'} · {problemCount} {problemCount === 1 ? 'Problem' : 'Problems'}
                        </div>
                      </div>
                      <div className="admin-problems__collection-actions">
                        <Button variant="secondary" size="sm" className="admin-problems__add-btn" onClick={(e) => { e.stopPropagation(); handleOpenTopicModal(null, colId); }}>
                          <Plus size={14} /> Topic
                        </Button>
                        <button className="admin-problems__icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenCollectionModal(collection); }} aria-label="Edit collection" title="Edit collection">
                          <Pencil size={18} />
                        </button>
                        <button className="admin-problems__icon-btn" onClick={(e) => { e.stopPropagation(); confirmDelete(colId, 'collection'); }} aria-label="Archive collection" title="Archive collection">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
        {view === 'topics' && selectedCollection && (
          <>
            <div className="admin-problems__breadcrumb">
              <Button variant="secondary" onClick={handleBackToCollections} icon={ChevronLeft}>Back</Button>
              <span className="admin-problems__breadcrumb-sep">/</span>
              <span>{selectedCollection.name}</span>
              <Button variant="secondary" size="sm" className="admin-problems__add-btn" onClick={() => handleOpenTopicModal(null, selectedCollection._id || selectedCollection.id)}>
                <Plus size={14} /> Topic
              </Button>
            </div>
            {(topicsByCollection[selectedCollection._id || selectedCollection.id]?.length === 0) ? (
              <div className="admin-problems__empty">
                <p>No topics yet.</p>
                <Button variant="secondary" size="sm" className="admin-problems__add-btn" onClick={() => handleOpenTopicModal(null, selectedCollection._id || selectedCollection.id)}>
                  <Plus size={14} /> Add Topic
                </Button>
              </div>
            ) : (
              (topicsByCollection[selectedCollection._id || selectedCollection.id] || []).map((topic) => {
                const topicId = topic._id || topic.id;
                const problemCount = topic.problemCount ?? (problemsByTopic[topicId]?.length || 0);
                return (
                  <div key={topicId} className="admin-problems__topic">
                    <div
                      className="admin-problems__topic-header"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleTopicClick(topic)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleTopicClick(topic);
                        }
                      }}
                    >
                      <div className="admin-problems__topic-info">
                        <div className="admin-problems__topic-title">{topic.name}</div>
                        <div className="admin-problems__topic-meta">{problemCount} {problemCount === 1 ? 'Problem' : 'Problems'}</div>
                      </div>
                      <div className="admin-problems__topic-actions">
                        <button className="admin-problems__icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenTopicModal(topic); }} aria-label="Edit topic" title="Edit topic">
                          <Pencil size={16} />
                        </button>
                        <button className="admin-problems__icon-btn" onClick={(e) => { e.stopPropagation(); confirmDelete(topicId, 'topic'); }} aria-label="Archive topic" title="Archive topic">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
        {view === 'problems' && selectedCollection && selectedTopic && (
          <>
            <div className="admin-problems__breadcrumb">
              <Button variant="secondary" onClick={handleBackToTopics} icon={ChevronLeft}>Back</Button>
              <span className="admin-problems__breadcrumb-sep">/</span>
              <span>{selectedCollection.name}</span>
              <span className="admin-problems__breadcrumb-sep">/</span>
              <span>{selectedTopic.name}</span>
              <Button variant="secondary" size="sm" className="admin-problems__add-btn" onClick={() => openProblemModal(selectedCollection._id || selectedCollection.id, selectedTopic._id || selectedTopic.id)}>
                <Plus size={14} /> Problem
              </Button>
            </div>
            {(problemsByTopic[selectedTopic._id || selectedTopic.id] || []).length === 0 ? (
              <div className="admin-problems__empty">
                <p>No problems yet.</p>
                <Button variant="secondary" size="sm" className="admin-problems__add-btn" onClick={() => openProblemModal(selectedCollection._id || selectedCollection.id, selectedTopic._id || selectedTopic.id)}>
                  <Plus size={14} /> Add Problem
                </Button>
              </div>
            ) : (
              <div className="admin-problems__problem-list">
                {(problemsByTopic[selectedTopic._id || selectedTopic.id] || []).map((problem) => (
                  <div key={problem._id || problem.id} className="admin-problems__problem">
                    <div className="admin-problems__problem-info">
                      <div className="admin-problems__problem-title">{problem.title}</div>
                      <div className="admin-problems__problem-description">{problem.description || '—'}</div>
                      <div className="admin-problems__problem-meta">
                        <span className={`admin-problems__problem-tag difficulty-${problem.difficulty?.toLowerCase()}`}>{problem.difficulty}</span>
                        <span className={`admin-problems__problem-tag status-${problem.status?.toLowerCase()}`}>{problem.status}</span>
                      </div>
                    </div>
                    <div className="admin-problems__problem-actions">
                      <button className="admin-problems__icon-btn" onClick={() => navigate(`/admin/problems/${problem._id || problem.id}`)} aria-label="View problem" title="View problem">
                        <Eye size={16} />
                      </button>
                      <button className="admin-problems__icon-btn" onClick={() => navigate(`/admin/problems/${problem._id || problem.id}/edit`)} aria-label="Edit problem" title="Edit problem">
                        <Pencil size={16} />
                      </button>
                      <button className="admin-problems__icon-btn" onClick={() => confirmDelete(problem._id || problem.id, 'problem')} aria-label="Archive problem" title="Archive problem">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
