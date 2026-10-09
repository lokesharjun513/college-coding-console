import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getAdminProblems, deleteAdminProblem, bulkImportProblems, importPreviewProblems, updateProblemConflict, downloadProblemTemplate,
  getAdminCollections, getAdminTopics, getAdminTopicProblems,
  createAdminCollection, updateAdminCollection, deleteAdminCollection,
  createAdminTopic, updateAdminTopic, deleteAdminTopic,
  createAdminProblem, linkAdminTopicProblems, updateAdminProblem
} from '../../api/admin';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import {
  ChevronRight, Pencil, Trash2, Plus,
  Eye, Filter, Upload, Download, Folder, MoreVertical,
  Archive as ArchiveIcon
} from 'lucide-react';
import '../../styles/pages/admin.css';
import '../../styles/pages/admin-problems.css';
import '../../styles/pages/admin-problems-hierarchy.css';
import '../../styles/pages/admin-problems-lifecycle.css';
import '../../styles/pages/admin-problems-import.css';
import '../../styles/pages/admin-trainers.css';

function getImportErrorMessage(error) {
  if (!error) return 'Unknown error';
  const data = error.response?.data;
  if (data?.message) return data.message;
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.map(e => e.message || JSON.stringify(e)).join('; ');
  }
  if (data?.error) return data.error;
  if (error.message) return error.message;
  return 'An error occurred';
}

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
  const [importResult, setImportResult] = useState(null);
  const [parsedPreview, setParsedPreview] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [importStep, setImportStep] = useState('upload'); // 'upload', 'preview', 'review'
  const [conflictUpdates, setConflictUpdates] = useState({}); // Map of problem _id to update status

  // Collection modal state
  const [editingCollection, setEditingCollection] = useState(null);
  const [collectionName, setCollectionName] = useState('');
  const [collectionDesc, setCollectionDesc] = useState('');

  // Topic modal state
  const [editingTopic, setEditingTopic] = useState(null);
  const [topicName, setTopicName] = useState('');
  const [topicDesc, setTopicDesc] = useState('');

  // Problem modal state
  const [problemTitle, setProblemTitle] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [problemDifficulty, setProblemDifficulty] = useState('EASY');
  const [problemStatus, setProblemStatus] = useState('DRAFT');
  const [problemCollectionId, setProblemCollectionId] = useState('');
  const [problemTopicId, setProblemTopicId] = useState('');

  // Archive / Delete confirmation state (collection management)
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState({ id: '', name: '', type: '' });
  const [archiveScope, setArchiveScope] = useState('only'); // 'only' or 'curriculum' for collection, 'only' or 'eligibleProblems' for topic
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [unarchiveModalOpen, setUnarchiveModalOpen] = useState(false);
  const [unarchiveTarget, setUnarchiveTarget] = useState({ id: '', name: '', type: '' });
  const [unarchiveScope, setUnarchiveScope] = useState('only');
  const [unarchiveSubmitting, setUnarchiveSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState({ id: '', name: '', type: '' });
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [topicMenuOpenId, setTopicMenuOpenId] = useState(null);

  // Collection search (State 1)
  const [collectionSearch, setCollectionSearch] = useState('');

  // Topic search/filter (State 2)
  const [topicSearch, setTopicSearch] = useState('');

  // Navigation state
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [collections, setCollections] = useState([]);
  const [topicsByCollection, setTopicsByCollection] = useState({});
  const [problemsByTopic, setProblemsByTopic] = useState({});
  const [problems, setProblems] = useState([]);

  // Fetch collections
  const fetchCollections = useCallback(async () => {
    try {
      const res = await getAdminCollections();
      setCollections(res.data?.data || []);
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
    } catch (err) {
      console.error('Failed to load problems:', err);
    }
  }, [searchQuery, difficultyFilter, statusFilter]);

  useEffect(() => {
    fetchCollections();
    fetchProblems();
  }, [fetchCollections, fetchProblems]);

  // Close topic dropdown when clicking anywhere else
  useEffect(() => {
    if (!topicMenuOpenId) return undefined;
    const closeMenu = () => setTopicMenuOpenId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [topicMenuOpenId]);

  // Update preview when import text changes
  useEffect(() => {
    if (importMode === 'text' && importText.trim()) {
      try {
        const json = JSON.parse(importText);
        let parsed = [];
        if (Array.isArray(json)) {
          parsed = json;
        } else if (Array.isArray(json.problems)) {
          parsed = json.problems;
        }
        setParsedPreview(parsed);
      } catch {
        setParsedPreview([]);
      }
    }
  }, [importMode, importText]);

  // Accordion handlers
  const handleCollectionClick = (collection) => {
    setSelectedCollection(collection);
    setSelectedTopic(null); // Reset topic when switching collections
    const colId = collection._id || collection.id;
    if (!topicsByCollection[colId]) {
      fetchTopics(colId);
    }
  };

  const handleTopicClick = (topic) => {
    setSelectedTopic(topic);
    const topicId = topic._id || topic.id;
    if (!problemsByTopic[topicId]) {
      fetchTopicProblems(topicId);
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
    if (collectionId) {
      setTopicCollectionId(collectionId);
    }
  };

  const [topicCollectionId, setTopicCollectionId] = useState('');

  // Problem modal handlers
  const openProblemModal = (collectionId = null, topicId = null) => {
    setProblemTitle('');
    setProblemDescription('');
    setProblemDifficulty('EASY');
    setProblemStatus('DRAFT');
    setProblemCollectionId(collectionId || '');
    setProblemTopicId(topicId || '');
    if (collectionId) {
      fetchTopicsForProblemCollection(collectionId);
    }
  };

  const closeProblemModal = () => {
  };

  const fetchTopicsForProblemCollection = async (collectionId) => {
    try {
      await getAdminTopics(collectionId);
      // Topics loaded for problem modal (not stored in state)
    } catch (err) {
      console.error('Failed to load topics:', err);
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

  // Archive confirmation handler
  const confirmArchive = (id, type, name) => {
    setArchiveTarget({ id, type, name });
    setArchiveScope('only'); // reset to default
    setArchiveModalOpen(true);
  };

  // Unarchive confirmation handler
  const confirmUnarchive = (id, type, name) => {
    setUnarchiveTarget({ id, type, name });
    setUnarchiveScope('only');
    setUnarchiveModalOpen(true);
  };

  // Delete confirmation handler
  const confirmDelete = (id, type, name) => {
    setDeleteTarget({ id, type, name });
    setDeleteConfirmText('');
    setDeleteModalOpen(true);
  };

  const handleArchive = async () => {
    const { id, type } = archiveTarget;
    if (!id) return;
    setArchiveSubmitting(true);
    try {
      if (type === 'collection') {
        if (archiveScope === 'only') {
          await updateAdminCollection(id, { status: 'ARCHIVED' });
          setToast({ message: 'Collection archived successfully', type: 'success' });
        } else if (archiveScope === 'curriculum') {
          // Archive collection
          await updateAdminCollection(id, { status: 'ARCHIVED' });
          // Archive all topics in the collection
          const topics = topicsByCollection[id] || [];
          for (const topic of topics) {
            await updateAdminTopic(topic._id || topic.id, { status: 'ARCHIVED' });
            // Archive all problems in each topic
            const topicId = topic._id || topic.id;
            const problemsInTopic = problemsByTopic[topicId] || [];
            for (const problem of problemsInTopic) {
              await updateAdminProblem(problem._id || problem.id, { status: 'ARCHIVED' });
            }
          }
          setToast({ message: 'Collection and curriculum archived successfully', type: 'success' });
        }
        if (selectedCollection && (selectedCollection._id || selectedCollection.id) === id) {
          setSelectedCollection(null);
          setSelectedTopic(null);
        }
        await fetchCollections();
      } else if (type === 'topic') {
        await updateAdminTopic(id, { status: 'ARCHIVED' });
        setToast({ message: 'Topic and linked problems archived successfully', type: 'success' });
        if (selectedCollection) {
          const colId = selectedCollection._id || selectedCollection.id;
          fetchTopics(colId);
        }
        if (selectedTopic && (selectedTopic._id || selectedTopic.id) === id) {
          setSelectedTopic(null);
        }
      } else if (type === 'problem') {
        await updateAdminProblem(id, { status: 'ARCHIVED' });
        setToast({ message: 'Problem archived successfully', type: 'success' });
        await fetchProblems();
      if (selectedTopic) {
        await fetchTopicProblems(selectedTopic._id || selectedTopic.id);
      }
      }
      setArchiveModalOpen(false);
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to archive item', type: 'error' });
      setArchiveModalOpen(false);
    } finally {
      setArchiveSubmitting(false);
    }
  };

  const handleUnarchive = async () => {
    const { id, type } = unarchiveTarget;
    if (!id) return;
    setUnarchiveSubmitting(true);
    try {
      if (type === 'collection') {
        if (unarchiveScope === 'only') {
          await updateAdminCollection(id, { status: 'ACTIVE' });
          setToast({ message: 'Collection restored successfully', type: 'success' });
        } else if (unarchiveScope === 'curriculum') {
          // Unarchive collection
          await updateAdminCollection(id, { status: 'ACTIVE' });
          // Unarchive all topics in the collection
          const topics = topicsByCollection[id] || [];
          for (const topic of topics) {
            await updateAdminTopic(topic._id || topic.id, { status: 'ACTIVE' });
            // Unarchive all problems in each topic
            const topicId = topic._id || topic.id;
            const problemsInTopic = problemsByTopic[topicId] || [];
            for (const problem of problemsInTopic) {
              await updateAdminProblem(problem._id || problem.id, { status: 'ACTIVE' });
            }
          }
          setToast({ message: 'Collection and curriculum restored successfully', type: 'success' });
        }
        await fetchCollections();
        if (selectedCollection && (selectedCollection._id || selectedCollection.id) === id) {
          // Keep selection if the collection is still valid (it is now active)
          // No need to clear selection
        }
      } else if (type === 'topic') {
        // Let backend handle cascade unarchive via cascade flag
        await updateAdminTopic(id, { status: 'ACTIVE', cascade: true });
        setToast({ message: 'Topic and linked problems restored successfully', type: 'success' });
        if (selectedCollection) {
          const colId = selectedCollection._id || selectedCollection.id;
          fetchTopics(colId);
        }
        if (selectedTopic && (selectedTopic._id || selectedTopic.id) === id) {
          // Keep selection if the topic is still valid (it is now active)
          // No need to clear selection
        }
      } else if (type === 'problem') {
        await updateAdminProblem(id, { status: 'ACTIVE' });
        setToast({ message: 'Problem restored successfully', type: 'success' });
        await fetchProblems();
      if (selectedTopic) {
        await fetchTopicProblems(selectedTopic._id || selectedTopic.id);
      }
      }
      setUnarchiveModalOpen(false);
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to restore item', type: 'error' });
      setUnarchiveModalOpen(false);
    } finally {
      setUnarchiveSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const { id, type } = deleteTarget;
    if (!id || deleteConfirmText !== 'DELETE') return;
    setDeleteSubmitting(true);
    try {
      if (type === 'collection') {
        // First archive the collection (which cascades to archive topics and problems)
        await updateAdminCollection(id, { status: 'ARCHIVED' });
        // Then permanently delete the archived collection
        await deleteAdminCollection(id);
        setToast({ message: 'Collection deleted permanently', type: 'success' });
        if (selectedCollection && (selectedCollection._id || selectedCollection.id) === id) {
          setSelectedCollection(null);
          setSelectedTopic(null);
        }
        await fetchCollections();
      } else if (type === 'topic') {
        await deleteAdminTopic(id);
        setToast({ message: 'Topic deleted permanently', type: 'success' });
        if (selectedCollection) {
          const colId = selectedCollection._id || selectedCollection.id;
          fetchTopics(colId);
        }
        if (selectedTopic && (selectedTopic._id || selectedTopic.id) === id) {
          setSelectedTopic(null);
        }
      } else if (type === 'problem') {
        await deleteAdminProblem(id);
        setToast({ message: 'Problem deleted permanently', type: 'success' });
        await fetchProblems();
      if (selectedTopic) {
        await fetchTopicProblems(selectedTopic._id || selectedTopic.id);
      }
      }
      setDeleteModalOpen(false);
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to delete item', type: 'error' });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Navigation back handlers
  const handleBackToCollections = () => {
    setSelectedCollection(null);
    setSelectedTopic(null);
  };

  const handleBackToTopics = () => {
    setSelectedTopic(null);
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

  // Import preview handler
  const handleImportPreview = async () => {
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
        setToast({ message: 'Invalid format: expected array of problems', type: 'error' });
        return;
      }

      setImportSubmitting(true);
      const res = await importPreviewProblems({ problems: problemsToImport });
      setImportPreview(res.data);
      setImportStep('review');
    } catch (err) {
      const backendMessage = getImportErrorMessage(err);
      setToast({ message: backendMessage, type: 'error' });
    } finally {
      setImportSubmitting(false);
    }
  };

  // Update single problem (conflict resolution)
  const handleUpdateProblem = async (problemId, importedFields) => {
    try {
      const res = await updateProblemConflict(problemId, importedFields);
      setConflictUpdates(prev => ({ ...prev, [problemId]: 'updated' }));
      setToast({ message: 'Problem updated successfully', type: 'success' });
      // Fetch updated data
      await fetchProblems();
      if (selectedTopic) {
        await fetchTopicProblems(selectedTopic._id || selectedTopic.id);
      }
    } catch (err) {
      const backendMessage = getImportErrorMessage(err);
      setToast({ message: backendMessage, type: 'error' });
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
      let parsed = [];
      if (Array.isArray(json)) {
        parsed = json;
      } else if (Array.isArray(json.problems)) {
        parsed = json.problems;
      }
      setParsedPreview(parsed);
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
        const errorResult = { summary: { created: 0, failed: 0, total: 0 }, errors: [{ row: 0, message: 'Expected an array of problems' }] };
        setImportResult(errorResult);
        setToast({ message: 'Invalid format: expected array of problems', type: 'error' });
        return;
      }

      setImportSubmitting(true);
      const res = await bulkImportProblems({ problems: problemsToImport });
      // Keep modal open and display result
      setImportResult(res.data);

      if (res.data.success) {
        const summary = res.data.summary;
        let msg = `${summary.created} problem(s) created successfully`;
        if (summary.failed > 0) {
          msg += `, ${summary.failed} failed`;
        }
        setToast({ message: msg, type: summary.failed === summary.total ? 'error' : 'success' });
        setSelectedCollection(null);
        setSelectedTopic(null);
        await fetchCollections();
        await fetchProblems();
      if (selectedTopic) {
        await fetchTopicProblems(selectedTopic._id || selectedTopic.id);
      }
      } else {
        setToast({ message: res.data.message || 'Import failed', type: 'error' });
      }
    } catch (err) {
      const backendMessage = getImportErrorMessage(err);
      const backendErrors = err?.response?.data?.errors?.map(e => ({
        row: e.row ?? 0,
        message: e.message || JSON.stringify(e)
      })) || [{ row: 0, message: backendMessage }];
      const errorResult = { summary: { created: 0, failed: 0, total: 0 }, errors: backendErrors };
      setImportResult(errorResult);
      setToast({ message: backendMessage, type: 'error' });
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleResetImport = () => {
    setImportModalOpen(false);
    setImportFile(null);
    setImportText('');
    setImportResult(null);
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

  // Filter collections based on search
  const filteredCollections = collections.filter(col =>
    col.name.toLowerCase().includes(collectionSearch.toLowerCase())
  );

  return (
    <div className="admin-problems">
      <div className="admin-trainers__page-header">
        <nav className="admin-breadcrumb" aria-label="Breadcrumb">
          <Link to="/admin" className="admin-breadcrumb__item">Admin</Link>
          <span className="admin-breadcrumb__separator">/</span>
          <span className="admin-breadcrumb__current" aria-current="page">Problems & Curriculum</span>
        </nav>
        <div className="admin-trainers__header">
          <div>
            <h1 className="admin-trainers__title">Problems & Curriculum</h1>
            <p className="admin-trainers__description">
              Manage collections, topics, and coding problems for student practice
            </p>
          </div>
          <div className="admin-trainers__header-actions">
            <Button variant="secondary" onClick={handleDownloadTemplate}>
              <Download size={16} />Template
            </Button>
            <Button variant="secondary" onClick={() => setImportModalOpen(true)}>
              <Upload size={16} />Import JSON
            </Button>
            <Button variant="primary" onClick={() => handleOpenCollectionModal()} className="admin-trainers__add-btn">
              <Plus size={16} />Add Collection
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-dashboard__kpi-grid">
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Collections</span>
          </div>
          <div className="admin-dashboard__stat-value">{collections.length}</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Topics</span>
          </div>
          <div className="admin-dashboard__stat-value">{Object.values(topicsByCollection).flat().length}</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Total Problems</span>
          </div>
          <div className="admin-dashboard__stat-value">{problems.length}</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Published</span>
          </div>
          <div className="admin-dashboard__stat-value">{publishedCount}</div>
        </div>
      </div>

      {/* Progressive Navigation */}
      {!selectedCollection && (
        // STATE 1: Full-width collection overview
        <div className="admin-problems__collection-overview">
          <div className="admin-problems__overview-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <h3 className="admin-problems__overview-title">Collections</h3>
            <div style={{ width: '240px' }}>
              <input
                type="text"
                className="admin-input"
                placeholder="Search collections..."
                value={collectionSearch}
                onChange={(e) => setCollectionSearch(e.target.value)}
                style={{ height: '34px', fontSize: '12.5px', borderRadius: '8px' }}
              />
            </div>
          </div>
          <div className="admin-problems__collection-overview-list">
            {collections.length === 0 ? (
              <EmptyState title="No collections yet" description="Create a collection to get started">
                <Button onClick={() => handleOpenCollectionModal()}>
                  <Plus size={14} />Create Collection
                </Button>
              </EmptyState>
            ) : collections.filter(c => c.name?.toLowerCase().includes(collectionSearch.trim().toLowerCase())).length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: '13px' }}>
                No collections match "{collectionSearch}"
              </div>
            ) : (
              collections
                .filter(c => c.name?.toLowerCase().includes(collectionSearch.trim().toLowerCase()))
                .map((collection) => {
                const colId = collection._id || collection.id;
                const topicCount = collection.topicCount ?? 0;
                const problemCount = collection.problemCount ?? 0;
                const isArchived = collection.status === 'ARCHIVED';

                return (
                  <div
                    key={colId}
                    className="admin-problems__overview-row"
                    onClick={() => handleCollectionClick(collection)}
                  >
                    <div className="admin-problems__overview-row-icon">
                      <Folder size={16} />
                    </div>
                    <div className="admin-problems__overview-row-content">
                      <div className="admin-problems__overview-row-title">{collection.name}</div>
                      <div className="admin-problems__overview-row-meta">
                        {topicCount} {topicCount === 1 ? 'Topic' : 'Topics'} · {problemCount} {problemCount === 1 ? 'Problem' : 'Problems'}
                        {isArchived && ' · Archived'}
                      </div>
                    </div>
                    <div className="admin-problems__overview-row-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenCollectionModal(collection);
                        }}
                      >
                        <Pencil size={14} />Edit
                      </Button>
                      {isArchived ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmUnarchive(colId, 'collection', collection.name);
                            }}
                            aria-label={`Unarchive collection: ${collection.name}`}
                          >
                            <ArchiveIcon size={14} />Unarchive
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(colId, 'collection', collection.name);
                            }}
                          >
                            <Trash2 size={14} />Delete
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmArchive(colId, 'collection', collection.name);
                            }}
                          >
                            <ArchiveIcon size={14} />Archive
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(colId, 'collection', collection.name);
                            }}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      <div className="admin-problems__overview-row-chevron">
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Archive Confirmation Modal */}
      <Modal
        isOpen={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        title={archiveTarget.type === 'collection' ? 'Archive Collection' : archiveTarget.type === 'topic' ? 'Archive Topic' : 'Archive Problem'}
      >
        <div className="admin-modal__body">
          <p className="admin-lifecycle__entity-name">{archiveTarget.name}</p>

          {archiveTarget.type === 'collection' && (
            <div className="admin-lifecycle__scope-section">
              <p className="admin-lifecycle__scope-label">Choose what to archive:</p>
              <div className="admin-lifecycle__scope-options">
                <label className={`admin-lifecycle__scope-option ${archiveScope === 'only' ? 'admin-lifecycle__scope-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="archiveScope"
                    value="only"
                    checked={archiveScope === 'only'}
                    onChange={() => setArchiveScope('only')}
                  />
                  <div className="admin-lifecycle__scope-content">
                    <div className="admin-lifecycle__scope-title">Archive collection only</div>
                    <div className="admin-lifecycle__scope-desc">Archive this collection. Topics and problems remain unchanged.</div>
                  </div>
                </label>
                <label className={`admin-lifecycle__scope-option ${archiveScope === 'curriculum' ? 'admin-lifecycle__scope-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="archiveScope"
                    value="curriculum"
                    checked={archiveScope === 'curriculum'}
                    onChange={() => setArchiveScope('curriculum')}
                  />
                  <div className="admin-lifecycle__scope-content">
                    <div className="admin-lifecycle__scope-title">Archive entire curriculum</div>
                    <div className="admin-lifecycle__scope-desc">Archive this collection and eligible curriculum items associated with it.</div>
                  </div>
                </label>
              </div>
            </div>
          )}
          {archiveTarget.type === 'topic' && (
            <div className="admin-lifecycle__warning-section">
              <p className="admin-lifecycle__warning-text">
                Are you sure you want to archive <strong>{archiveTarget.name}</strong>?
                <br /><br />
                Archiving this topic will also archive all linked problems. You can restore the topic later.
                The collection, topic–problem relationships, test cases, and submissions will remain unchanged.
                No data will be permanently deleted.
              </p>
            </div>
          )}
          {archiveTarget.type === 'problem' && (
            <div className="admin-lifecycle__scope-section">
              <p>Are you sure you want to archive this problem?</p>
              <p>Archiving this problem will set its status to ARCHIVED. Its topic relationships will be preserved.</p>
            </div>
          )}
        </div>
        <div className="admin-modal__footer">
          <Button variant="secondary" onClick={() => setArchiveModalOpen(false)} disabled={archiveSubmitting}>Cancel</Button>
          <Button variant="danger" onClick={handleArchive} disabled={archiveSubmitting}>
            {archiveSubmitting ? 'Archiving...' : 'Archive'}
          </Button>
        </div>
      </Modal>

      {/* Unarchive Confirmation Modal */}
      <Modal
        isOpen={unarchiveModalOpen}
        onClose={() => setUnarchiveModalOpen(false)}
        title={unarchiveTarget.type === 'collection' ? 'Unarchive Collection' : unarchiveTarget.type === 'topic' ? 'Unarchive Topic' : 'Unarchive Problem'}
      >
        <div className="admin-modal__body">
          <p className="admin-lifecycle__entity-name">{unarchiveTarget.name}</p>

          <div className="admin-lifecycle__scope-section">
            <p className="admin-lifecycle__scope-label">Choose what to restore:</p>

            {unarchiveTarget.type === 'collection' && (
              <div className="admin-lifecycle__scope-options">
                <label className={`admin-lifecycle__scope-option ${unarchiveScope === 'only' ? 'admin-lifecycle__scope-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="unarchiveScope"
                    value="only"
                    checked={unarchiveScope === 'only'}
                    onChange={() => setUnarchiveScope('only')}
                  />
                  <div className="admin-lifecycle__scope-content">
                    <div className="admin-lifecycle__scope-title">Unarchive collection only</div>
                    <div className="admin-lifecycle__scope-desc">Restore the collection. Topics and problems remain in their current states.</div>
                  </div>
                </label>
                <label className={`admin-lifecycle__scope-option ${unarchiveScope === 'curriculum' ? 'admin-lifecycle__scope-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="unarchiveScope"
                    value="curriculum"
                    checked={unarchiveScope === 'curriculum'}
                    onChange={() => setUnarchiveScope('curriculum')}
                  />
                  <div className="admin-lifecycle__scope-content">
                    <div className="admin-lifecycle__scope-title">Restore entire curriculum</div>
                    <div className="admin-lifecycle__scope-desc">Restore the collection and eligible archived curriculum items.</div>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="admin-modal__footer">
          <Button variant="secondary" onClick={() => setUnarchiveModalOpen(false)} disabled={unarchiveSubmitting}>Cancel</Button>
          <Button variant="primary" onClick={handleUnarchive} disabled={unarchiveSubmitting}>
            {unarchiveSubmitting ? 'Restoring...' : 'Unarchive'}
          </Button>
        </div>
      </Modal>

      {/* Collection Edit Modal */}
      <Modal
        isOpen={!!editingCollection}
        onClose={() => {
          setEditingCollection(null);
          setCollectionName('');
          setCollectionDesc('');
        }}
        title={editingCollection ? 'Edit Collection' : 'New Collection'}
      >
        <div className="admin-modal__body">
          <div className="admin-lifecycle__confirm-section">
            <label className="admin-lifecycle__confirm-label">Collection Name</label>
            <input
              type="text"
              className="admin-input"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              placeholder="Enter collection name"
              autoFocus
            />
          </div>
          <div className="admin-lifecycle__confirm-section">
            <label className="admin-lifecycle__confirm-label">Description</label>
            <textarea
              className="admin-input"
              value={collectionDesc}
              onChange={(e) => setCollectionDesc(e.target.value)}
              placeholder="Enter description"
              rows={4}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>
        <div className="admin-modal__footer">
          <Button variant="secondary" onClick={() => {
            setEditingCollection(null);
            setCollectionName('');
            setCollectionDesc('');
          }}>Cancel</Button>
          <Button variant="primary" onClick={async () => {
            if (!collectionName.trim()) return;
            try {
              if (editingCollection) {
                await updateAdminCollection(editingCollection._id || editingCollection.id, {
                  name: collectionName.trim(),
                  description: collectionDesc.trim()
                });
                setToast({ message: 'Collection updated successfully', type: 'success' });
              } else {
                await createAdminCollection({
                  name: collectionName.trim(),
                  description: collectionDesc.trim()
                });
                setToast({ message: 'Collection created successfully', type: 'success' });
              }
              await fetchCollections();
              setEditingCollection(null);
              setCollectionName('');
              setCollectionDesc('');
            } catch (err) {
              setToast({ message: err?.response?.data?.message || 'Failed to save collection', type: 'error' });
            }
          }}>Save Changes</Button>
        </div>
      </Modal>

      {/* Topic Edit Modal */}
      <Modal
        isOpen={!!editingTopic}
        onClose={() => {
          setEditingTopic(null);
          setTopicName('');
          setTopicDesc('');
        }}
        title={editingTopic ? 'Edit Topic' : 'New Topic'}
      >
        <div className="admin-modal__body">
          <div className="admin-lifecycle__confirm-section">
            <label className="admin-lifecycle__confirm-label">Topic Name</label>
            <input
              type="text"
              className="admin-input"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="Enter topic name"
              autoFocus
            />
          </div>
          <div className="admin-lifecycle__confirm-section">
            <label className="admin-lifecycle__confirm-label">Description</label>
            <textarea
              className="admin-input"
              value={topicDesc}
              onChange={(e) => setTopicDesc(e.target.value)}
              placeholder="Enter description"
              rows={4}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>
        <div className="admin-modal__footer">
          <Button variant="secondary" onClick={() => {
            setEditingTopic(null);
            setTopicName('');
            setTopicDesc('');
          }}>Cancel</Button>
          <Button variant="primary" onClick={async () => {
            if (!topicName.trim()) return;
            try {
              if (editingTopic) {
                await updateAdminTopic(editingTopic._id || editingTopic.id, {
                  name: topicName.trim(),
                  description: topicDesc.trim()
                });
                setToast({ message: 'Topic updated successfully', type: 'success' });
              } else {
                await createAdminTopic(selectedCollection._id || selectedCollection.id, {
                  name: topicName.trim(),
                  description: topicDesc.trim()
                });
                setToast({ message: 'Topic created successfully', type: 'success' });
              }
              await fetchTopics(selectedCollection._id || selectedCollection.id);
              setEditingTopic(null);
              setTopicName('');
              setTopicDesc('');
            } catch (err) {
              setToast({ message: err?.response?.data?.message || 'Failed to save topic', type: 'error' });
            }
          }}>Save Changes</Button>
        </div>
      </Modal>

      {/* Delete Permanent Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteConfirmText('');
        }}
        title={deleteTarget.type === 'collection' ? 'Delete Collection Permanently' : deleteTarget.type === 'topic' ? 'Delete Topic Permanently' : 'Delete Problem Permanently'}
      >
        <div className="admin-modal__body">
          <p className="admin-lifecycle__entity-name">{deleteTarget.name}</p>

          <div className="admin-lifecycle__warning-section">
            {deleteTarget.type === 'collection' && (
              <p className="admin-lifecycle__warning-text">This will permanently delete this collection, all its topics, all linked problems, and related data. This action cannot be undone.</p>
            )}
            {deleteTarget.type === 'topic' && (
              <p className="admin-lifecycle__warning-text">Deleting this topic permanently deletes the topic, all linked problems, and their associated data. This action cannot be undone. The parent collection will remain unchanged.</p>
            )}
            {deleteTarget.type === 'problem' && (
              <p className="admin-lifecycle__warning-text">This will permanently delete this problem and its related data (test cases, submissions). The topic and collection will remain. This action cannot be undone.</p>
            )}
          </div>

          <div className="admin-lifecycle__confirm-section">
            <label className="admin-lifecycle__confirm-label">Type DELETE to confirm:</label>
            <input
              type="text"
              className="admin-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="admin-modal__footer">
          <Button variant="secondary" onClick={() => {
            setDeleteModalOpen(false);
            setDeleteConfirmText('');
          }} disabled={deleteSubmitting}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={deleteSubmitting || deleteConfirmText !== 'DELETE'}
          >
            {deleteSubmitting ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </div>
      </Modal>

      {/* Import JSON Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Problems from JSON"
      >
        <div className="admin-modal__body">
          <div className="admin-import-modal__content">
            {importStep === 'upload' && (
              <>
                <div className="admin-import-modal__header">
                  <h3>Import Problems</h3>
                  <p>Import multiple problems from a JSON file or paste JSON directly</p>
                </div>

                <div className="admin-import-modal__tabs">
                  <button
                    className={`admin-import-modal__tab ${importMode === 'file' ? 'admin-import-modal__tab--active' : ''}`}
                    onClick={() => setImportMode('file')}
                  >
                    Upload File
                  </button>
                  <button
                    className={`admin-import-modal__tab ${importMode === 'text' ? 'admin-import-modal__tab--active' : ''}`}
                    onClick={() => setImportMode('text')}
                  >
                    Paste JSON
                  </button>
                </div>

                {importMode === 'file' ? (
                  <div className="admin-import-modal__file-input">
                    <label className="admin-import-modal__file-label">
                      <Upload size={20} />
                      Select JSON File
                    </label>
                    <input
                      type="file"
                      accept=".json"
                      className="admin-import-modal__file-input-real"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />
                    {importFile && (
                      <div className="admin-import-modal__file-selected">
                        <span>{importFile.name}</span>
                        <button
                          className="admin-import-modal__file-remove"
                          onClick={() => {
                            setImportFile(null);
                            setParsedPreview([]);
                          }}
                        >
                          <Trash2 size={14} />Remove
                        </button>
                      </div>
                    )}
                    {!importFile && parsedPreview.length > 0 && (
                      <div className="admin-import-modal__file-selected">
                        <span>Preview loaded</span>
                        <button
                          className="admin-import-modal__file-remove"
                          onClick={() => setParsedPreview([])}
                        >
                          <Trash2 size={14} />Clear
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="admin-import-modal__text-input">
                    <label className="admin-import-modal__text-label">
                      Paste JSON Array
                    </label>
                    <textarea
                      className="admin-import-modal__textarea"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder='[{"title": "Two Sum", "description": "...", "difficulty": "EASY", ...}]'
                      rows={10}
                    />
                    {importText.trim() && (
                      <div className="admin-import-modal__parsed-preview">
                        <div className="admin-import-modal__preview-header">
                          <h4>Parsed Preview ({parsedPreview.length} problem{parsedPreview.length !== 1 ? 's' : ''})</h4>
                          <button
                            className="admin-import-modal__preview-clear"
                            onClick={() => setImportText('')}
                          >
                            <Trash2 size={14} />Clear
                          </button>
                        </div>
                        <div className="admin-import-modal__preview-list">
                          {parsedPreview.slice(0, 5).map((problem, index) => (
                            <div key={index} className="admin-import-modal__preview-item">
                              <strong>{problem.title || `Problem ${index + 1}`}</strong>
                              {problem.description && (
                                <div className="admin-import-modal__preview-description">
                                  {problem.description.substring(0, 100)}{problem.description.length > 100 ? '...' : ''}
                                </div>
                              )}
                            </div>
                          ))}
                          {parsedPreview.length > 5 && (
                            <div className="admin-import-modal__preview-more">
                              +{parsedPreview.length - 5} more problems
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {importStep === 'review' && importPreview && (
              <div className="admin-import-modal__preview-review">
                <div className="admin-import-modal__preview-header">
                  <h4>Import Review</h4>
                  <p>Review and resolve conflicts before importing</p>
                </div>

                <div className="admin-import-modal__preview-summary">
                  <div className="admin-import-modal__summary-item">
                    <span className="admin-import-modal__summary-total">Total: {importPreview.summary?.total || 0}</span>
                    <span className="admin-import-modal__summary-new">New: {importPreview.summary?.new || 0}</span>
                    <span className="admin-import-modal__summary-existing">Existing: {importPreview.summary?.existing || 0}</span>
                  </div>
                </div>

                {importPreview.errors && importPreview.errors.length > 0 && (
                  <div className="admin-import-modal__result-errors">
                    <h5>Validation Errors:</h5>
                    <ul className="admin-import-modal__error-list">
                      {importPreview.errors.map((error, index) => (
                        <li key={index} className="admin-import-modal__error-item">
                          Row {error.row}: {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {importPreview.existingProblems && importPreview.existingProblems.length > 0 && (
                  <div className="admin-import-modal__conflicts-section">
                    <h5>Existing Problems ({importPreview.existingProblems.length})</h5>
                    <div className="admin-import-modal__conflicts-list">
                      {importPreview.existingProblems.map((conflict) => {
                        const status = conflictUpdates[conflict._id] || 'pending';
                        return (
                          <div key={conflict._id} className="admin-import-modal__conflict-item">
                            <div className="admin-import-modal__conflict-header">
                              <strong>{conflict.title}</strong>
                              {status === 'updated' ? (
                                <span className="admin-import-modal__conflict-status admin-import-modal__conflict-status--updated">Updated</span>
                              ) : status === 'skipped' ? (
                                <span className="admin-import-modal__conflict-status admin-import-modal__conflict-status--skipped">Skipped</span>
                              ) : (
                                <span className="admin-import-modal__conflict-status admin-import-modal__conflict-status--pending">Pending</span>
                              )}
                            </div>
                            {conflict.changes && conflict.changes.length > 0 && (
                              <div className="admin-import-modal__conflict-changes">
                                <div className="admin-import-modal__changes-header">Changes detected:</div>
                                {conflict.changes.map((change, i) => (
                                  <div key={i} className="admin-import-modal__change-row">
                                    <span className="admin-import-modal__change-field">{change.field}:</span>
                                    <span className="admin-import-modal__change-value">
                                      {change.current !== undefined ? `${String(change.current).substring(0, 50)}` : '-'}
                                      {' → '}
                                      {change.imported !== undefined ? `${String(change.imported).substring(0, 50)}` : '-'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {status === 'pending' && (
                              <div className="admin-import-modal__conflict-actions">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setConflictUpdates(prev => ({ ...prev, [conflict._id]: 'skipped' }))}
                                >
                                  Skip
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleUpdateProblem(conflict._id, conflict.importedFields)}
                                >
                                  Update
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {importPreview.newProblems && importPreview.newProblems.length > 0 && (
                  <div className="admin-import-modal__new-section">
                    <h5>New Problems ({importPreview.newProblems.length})</h5>
                    <p>These problems will be created when you click Import</p>
                  </div>
                )}
              </div>
            )}

            {importResult && (
              <div className="admin-import-modal__result">
                <div className="admin-import-modal__result-header">
                  <h4>Import Result</h4>
                </div>
                <div className="admin-import-modal__result-summary">
                  <div className="admin-import-modal__result-item">
                    <span>Total:</span>
                    <span>{importResult.summary?.total || 0}</span>
                  </div>
                  <div className="admin-import-modal__result-item">
                    <span>Created:</span>
                    <span>{importResult.summary?.created || 0}</span>
                  </div>
                  <div className="admin-import-modal__result-item">
                    <span>Failed:</span>
                    <span>{importResult.summary?.failed || 0}</span>
                  </div>
                </div>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="admin-import-modal__result-errors">
                    <h5>Errors:</h5>
                    <ul className="admin-import-modal__error-list">
                      {importResult.errors.map((error, index) => (
                        <li key={index} className="admin-import-modal__error-item">
                          Row {error.row}: {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="admin-modal__footer">
          <Button variant="secondary" onClick={handleResetImport} disabled={importSubmitting}>
            {importSubmitting ? 'Importing...' : 'Cancel'}
          </Button>
          {importStep === 'upload' ? (
            <>
              <Button
                variant="primary"
                onClick={handleImportPreview}
                disabled={(importMode === 'file' && !importFile) || (importMode === 'text' && !importText.trim()) || importSubmitting}
              >
                {importSubmitting ? 'Previewing...' : 'Preview'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  setImportStep('upload');
                  setImportPreview(null);
                  setConflictUpdates({});
                }}
                disabled={importSubmitting}
              >
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleImport}
                disabled={importSubmitting}
              >
                {importSubmitting ? 'Importing...' : 'Import'}
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* Loading */}
      {loading && <Spinner />}

      {/* Error */}
      {error && (
        <div className="admin-error-box">
          {error}
        </div>
      )}

      {/* Progressive Navigation */}
      {selectedCollection && (
        // STATE 2 & 3: Two-panel workspace
        <div className="admin-problems__workspace">
          {/* Left Panel: Collections */}
          <div className="admin-problems__collections-panel">
            <div className="admin-problems__panel-header">
              <h3 className="admin-problems__panel-title">Collections</h3>
            </div>
            <div className="admin-problems__panel-content">
              {collections.map((collection) => {
                const colId = collection._id || collection.id;
                const isSelected = selectedCollection._id === colId;

                return (
                  <div
                    key={colId}
                    className={`admin-problems__collection-item ${isSelected ? 'admin-problems__collection-item--selected' : ''}`}
                    onClick={() => handleCollectionClick(collection)}
                  >
                    <div className="admin-problems__collection-item-icon">
                      <Folder size={16} />
                    </div>
                    <div className="admin-problems__collection-item-content">
                      <div className="admin-problems__collection-item-title">{collection.name}</div>
                    </div>
                  </div>
                 );
               })}
            </div>
          </div>

          {/* Right Panel: Topics or Problems */}
          <div className="admin-problems__content-panel">
            {/* Unified Breadcrumb/Header */}
            <div className="admin-problems__section-header">
              <div className="admin-problems__breadcrumb">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToCollections}
                  className="admin-problems__breadcrumb-link"
                >
                  Collections
                </Button>
                <span className="admin-problems__breadcrumb-separator">/</span>
                {selectedTopic ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBackToTopics}
                      className="admin-problems__breadcrumb-collection"
                    >
                      {selectedCollection.name}
                    </Button>
                    <span className="admin-problems__breadcrumb-separator">/</span>
                    <span className="admin-problems__breadcrumb-current" aria-current="page">
                      {selectedTopic.name}
                    </span>
                  </>
                ) : (
                  <span className="admin-problems__breadcrumb-current admin-problems__breadcrumb-current--collection" aria-current="page">
                    {selectedCollection.name}
                  </span>
                )}
              </div>

              {selectedTopic && (
                <div className="admin-problems__section-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenTopicModal(selectedTopic)}
                  >
                    <Pencil size={14} />Edit Topic
                  </Button>
                  {selectedTopic.status === 'ARCHIVED' ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setTopicMenuOpenId(null);
                          confirmUnarchive(selectedTopic._id || selectedTopic.id, 'topic');
                        }}
                      >
                        <ArchiveIcon size={14} />Unarchive
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setTopicMenuOpenId(null);
                          confirmDelete(selectedTopic._id || selectedTopic.id, 'topic');
                        }}
                      >
                        <Trash2 size={14} />Delete
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setTopicMenuOpenId(null);
                        confirmArchive(selectedTopic._id || selectedTopic.id, 'topic');
                      }}
                    >
                      <ArchiveIcon size={14} />Archive
                    </Button>
                  )}
                </div>
              )}
            </div>


            {!selectedTopic && (
              // STATE 2: Topics
              <div className="admin-problems__topics-section">
                <div className="admin-problems__topics-header">
                  <h3 className="admin-problems__section-title">
                    Topics ({topicsByCollection[selectedCollection._id]?.length || 0})
                  </h3>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenTopicModal(null, selectedCollection._id)}
                  >
                    <Plus size={14} />Add Topic
                  </Button>
                </div>

                <div className="admin-problems__topics-toolbar">
                  <input
                    type="text"
                    className="admin-input admin-problems__topics-search"
                    placeholder="Search topics..."
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setTopicSearch('')}
                  >
                    Clear Filter
                  </Button>
                </div>

                <div className="admin-problems__section-content">
                  {topicsByCollection[selectedCollection._id]?.length === 0 ? (
                    <EmptyState title="No topics yet" description="Create a topic to add problems">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenTopicModal(null, selectedCollection._id)}
                      >
                        <Plus size={14} />Add Topic
                      </Button>
                    </EmptyState>
                  ) : (
                    <div className="admin-problems__topic-list">
                      {(topicsByCollection[selectedCollection._id] || [])
                        .filter((topic) =>
                          topic.name?.toLowerCase().includes(topicSearch.trim().toLowerCase())
                        )
                        .map((topic, index) => {
                          const topicId = topic._id || topic.id;
                          const isArchived = topic.status === 'ARCHIVED';

                          return (
                            <div
                              key={topicId}
                              className="admin-problems__topic-item"
                              style={{ animationDelay: `${index * 50}ms` }}
                              onClick={() => handleTopicClick(topic)}
                            >
                              <div className="admin-problems__topic-item-content">
                                <div className="admin-problems__topic-item-title">{topic.name}</div>
                                <div className="admin-problems__topic-item-meta">{topic.problemCount || 0} Problems</div>
                              </div>
                              <div className="admin-problems__topic-item-actions">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenTopicModal(topic);
                                  }}
                                >
                                  <Pencil size={14} />Edit
                                </Button>
                                {isArchived ? (
                                  <>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmUnarchive(topicId, 'topic', topic.name);
                                      }}
                                    >
                                      <ArchiveIcon size={14} />Unarchive
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmDelete(topicId, 'topic', topic.name);
                                      }}
                                    >
                                      <Trash2 size={14} />Delete
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmArchive(topicId, 'topic', topic.name);
                                      }}
                                    >
                                      <ArchiveIcon size={14} />Archive
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmDelete(topicId, 'topic', topic.name);
                                      }}
                                    >
                                      <Trash2 size={14} />Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                              <div className="admin-problems__topic-item-chevron">
                                <ChevronRight size={16} />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedTopic && (
              // STATE 3: Problems
              <div className="admin-problems__problems-section">
                <div className="admin-problems__problems-header">
                  <h3 className="admin-problems__section-title">
                    Problems ({problemsByTopic[selectedTopic._id || selectedTopic.id]?.length || 0})
                  </h3>
                </div>

                <div className="admin-problems__problems-header-toolbar">
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Search problems..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <select
                    className="admin-select"
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
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                  <Button variant="secondary" onClick={fetchProblems}>
                    <Filter size={14} />Filter
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openProblemModal(selectedCollection._id, selectedTopic._id || selectedTopic.id)}
                  >
                    <Plus size={14} />Add Problem
                  </Button>
                </div>

                <div className="admin-problems__section-content">
                  {problemsByTopic[selectedTopic._id || selectedTopic.id]?.length === 0 ? (
                    <EmptyState title="No problems yet" description="Create a problem for students to solve">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openProblemModal(selectedCollection._id, selectedTopic._id || selectedTopic.id)}
                      >
                        <Plus size={14} />Add Problem
                      </Button>
                    </EmptyState>
                  ) : (
                    <div className="admin-problems__problems-table-container">
                      <table className="table admin-table">
                        <thead>
                          <tr>
                            <th>S.NO.</th>
                            <th>TITLE</th>
                            <th>DIFFICULTY</th>
                            <th>STATUS</th>
                            <th>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          { (problemsByTopic[selectedTopic._id || selectedTopic.id] || []).map((problem, index) => {
                            const isArchived = problem.status === 'ARCHIVED';
                            // Apply filters to topic-specific list
                            if (searchQuery && !problem.title.toLowerCase().includes(searchQuery.toLowerCase())) return null;
                            if (difficultyFilter && problem.difficulty !== difficultyFilter) return null;
                            if (statusFilter && problem.status !== statusFilter) return null;

                            return (
                              <tr key={problem._id || problem.id}>
                                <td>{index + 1}</td>
                                <td className="table-cell-content">
                                  <div className="table-cell-title">{problem.title}</div>
                                  {problem.description && (
                                    <div className="table-cell-description">{problem.description}</div>
                                  )}
                                </td>
                                <td>
                                  <span className={`admin-badge admin-badge--${problem.difficulty === 'EASY' ? 'success' : problem.difficulty === 'MEDIUM' ? 'warning' : 'error'}`}>
                                    {problem.difficulty}
                                  </span>
                                </td>
                                <td>
                                  <span className={`admin-badge admin-badge--${problem.status === 'PUBLISHED' ? 'active' : 'inactive'}`}>
                                    {problem.status}
                                  </span>
                                </td>
                                <td>
                                  <div className="table-actions">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => navigate(`/admin/problems/${problem._id || problem.id}`)}
                                    >
                                      <Eye size={14} />View
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => navigate(`/admin/problems/${problem._id || problem.id}/edit`)}
                                    >
                                      <Pencil size={14} />Edit
                                    </Button>
                                    {isArchived ? (
                                      <>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => {
                                            setTopicMenuOpenId(null);
                                            confirmUnarchive(problem._id || problem.id, 'problem');
                                          }}
                                        >
                                          <ArchiveIcon size={14} />Unarchive
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => {
                                            setTopicMenuOpenId(null);
                                            confirmDelete(problem._id || problem.id, 'problem');
                                          }}
                                        >
                                          <Trash2 size={14} />Delete
                                        </Button>
                                      </>
                                    ) : (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                          setTopicMenuOpenId(null);
                                          confirmArchive(problem._id || problem.id, 'problem');
                                        }}
                                      >
                                        <ArchiveIcon size={14} />Archive
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}