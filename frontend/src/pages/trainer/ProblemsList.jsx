import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getBatchProblems, deleteProblem, bulkImportProblems, downloadProblemTemplate } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Upload, Download, Plus, Pencil, Eye, Trash2 } from 'lucide-react';
import '../../styles/pages/trainer-problems.css';

// Map problem status/difficulty to tag modifiers (text is rendered alongside color)
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

export default function ProblemsList() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [problems, setProblems] = useState([]);

  // Training/Day context passed from the Training management page
  const collectionId = searchParams.get('collectionId') || '';
  const topicId = searchParams.get('topicId') || '';

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Archive confirmation
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);

  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('file');
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [parsedPreview, setParsedPreview] = useState([]);

  const fetchProblems = useCallback(async () => {
    try {
      const res = await getBatchProblems(batchId);
      setProblems(res.data?.data || []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load problems');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    setLoading(true);
    fetchProblems();
  }, [fetchProblems]);

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    try {
      await deleteProblem(batchId, archiveTarget.id);
      setArchiveTarget(null);
      await fetchProblems();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to archive problem');
    } finally {
      setArchiveSaving(false);
    }
  };

  // Import: parse file into preview
  const parseJsonFile = async (file) => {
    if (!file) return;
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setImportErrors([{ row: 0, message: 'Please select a valid .json file' }]);
      return;
    }
    setImportFile(file);
    setImportErrors([]);
    try {
      const json = JSON.parse(await file.text());
      setParsedPreview(Array.isArray(json) ? json : [json]);
    } catch {
      setParsedPreview([]);
      setImportErrors([{ row: 0, message: 'Invalid JSON format' }]);
    }
  };

  const resetImport = () => {
    setImportModalOpen(false);
    setImportFile(null);
    setImportText('');
    setImportErrors([]);
    setParsedPreview([]);
    setImportMode('file');
  };

  const handleImport = async () => {
    let problemsToImport;
    try {
      problemsToImport = JSON.parse(importMode === 'file' ? await importFile.text() : importText);
    } catch {
      setImportErrors([{ row: 0, message: 'Invalid JSON format' }]);
      return;
    }
    if (!Array.isArray(problemsToImport)) {
      setImportErrors([{ row: 0, message: 'Expected an array of problems' }]);
      return;
    }

    setImportSubmitting(true);
    try {
      const res = await bulkImportProblems(batchId, { problems: problemsToImport, collectionId, topicId });
      const summary = res.data?.summary;
      if (summary) {
        let msg = `${summary.created} problem(s) imported successfully`;
        if (summary.failed > 0) msg += `, ${summary.failed} failed`;
        setError(null);
      }
      setImportErrors(res.data?.errors || []);
      resetImport();
      await fetchProblems();
    } catch (err) {
      setImportErrors([{ row: 0, message: err?.response?.data?.message || 'Import failed' }]);
    } finally {
      setImportSubmitting(false);
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
      setError('Failed to download template');
    }
  };

  const filteredProblems = problems.filter(p => {
    if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (difficultyFilter && p.difficulty !== difficultyFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const publishedCount = problems.filter(p => p.status === 'PUBLISHED').length;
  const draftCount = problems.filter(p => p.status === 'DRAFT').length;

  const createUrl = collectionId
    ? `/trainer/batches/${batchId}/problems/create?collectionId=${collectionId}&topicId=${topicId}`
    : `/trainer/batches/${batchId}/problems/create`;

  const editUrl = (p) => collectionId
    ? `/trainer/batches/${batchId}/problems/${p.id}/edit?collectionId=${collectionId}&topicId=${topicId}`
    : `/trainer/batches/${batchId}/problems/${p.id}/edit`;

  if (loading) {
    return (
      <div className="trainer-problems" style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-16)' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="trainer-problems">
      {/* Breadcrumb */}
      <nav className="trainer-problems__crumb" aria-label="Breadcrumb">
        <Link to="/trainer">Trainer</Link>
        <span className="trainer-problems__crumb-sep">/</span>
        <Link to={`/trainer/batches/${batchId}`}>Batch</Link>
        <span className="trainer-problems__crumb-sep">/</span>
        <span className="trainer-problems__crumb-current">Problems</span>
      </nav>

      {/* Header + actions */}
      <header className="trainer-problems__header">
        <div>
          <h1 className="trainer-problems__title">Batch Problems</h1>
          <p className="trainer-problems__description">Create, import, and manage coding problems for this batch.</p>
        </div>
        <div className="trainer-problems__header-actions">
          <Button variant="secondary" onClick={handleDownloadTemplate} icon={Download}>Template</Button>
          <Button variant="secondary" onClick={() => setImportModalOpen(true)} icon={Upload}>Import JSON</Button>
          <Button variant="primary" onClick={() => navigate(createUrl)} icon={Plus}>Create Problem</Button>
        </div>
      </header>

      {/* KPI summary */}
      <section className="trainer-problems__summary" aria-label="Problem summary">
        <div className="trainer-problems__summary-item">
          <p className="trainer-problems__summary-label">Total Problems</p>
          <p className="trainer-problems__summary-value">{problems.length}</p>
        </div>
        <div className="trainer-problems__summary-item">
          <p className="trainer-problems__summary-label">Published</p>
          <p className="trainer-problems__summary-value">{publishedCount}</p>
        </div>
        <div className="trainer-problems__summary-item">
          <p className="trainer-problems__summary-label">Draft</p>
          <p className="trainer-problems__summary-value">{draftCount}</p>
        </div>
      </section>

      {/* Toolbar */}
      <div className="trainer-problems__toolbar">
        <input
          type="text"
          className="trainer-problems__search"
          placeholder="Search problems..."
          aria-label="Search problems"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="trainer-problems__filter-select"
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
          className="trainer-problems__filter-select"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {error && (
        <div className="trainer-problems__error" role="alert">
          {error}
        </div>
      )}

      {/* Problem list */}
      {problems.length === 0 ? (
        <div className="trainer-problems__empty">
          <h2>No problems yet</h2>
          <p>Create your first problem or import a batch from JSON.</p>
          <div className="trainer-problems__header-actions">
            <Button variant="secondary" onClick={() => setImportModalOpen(true)} icon={Upload}>Import JSON</Button>
            <Button variant="primary" onClick={() => navigate(createUrl)} icon={Plus}>Create Problem</Button>
          </div>
        </div>
      ) : filteredProblems.length === 0 ? (
        <div className="trainer-problems__empty">
          <p>No problems match your search or filters.</p>
        </div>
      ) : (
        <ul className="trainer-problems__list">
          {filteredProblems.map((p) => (
            <li key={p.id} className="trainer-problems__problem">
              <div className="trainer-problems__problem-info">
                <span className="trainer-problems__problem-title">{p.title}</span>
                <div className="trainer-problems__problem-meta">
                  <span className={`trainer-problems__problem-tag trainer-problems__problem-tag--${difficultyClass(p.difficulty)}`}>{p.difficulty}</span>
                  <span className={`trainer-problems__problem-tag trainer-problems__problem-tag--${statusClass(p.status)}`}>{p.status}</span>
                  {p.topicId && (
                    <span className="trainer-problems__problem-linked">Linked to a Day</span>
                  )}
                </div>
              </div>
              <div className="trainer-problems__problem-actions">
                <Link to={`/trainer/batches/${batchId}/problems/${p.id}`} className="trainer-problems__icon-link" aria-label={`View ${p.title}`}>
                  <Eye size={16} />
                </Link>
                <Link to={editUrl(p)} className="trainer-problems__icon-link" aria-label={`Edit ${p.title}`}>
                  <Pencil size={16} />
                </Link>
                {p.status !== 'ARCHIVED' && (
                  <button type="button" className="trainer-problems__icon-btn" aria-label={`Archive ${p.title}`} onClick={() => setArchiveTarget(p)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Archive confirmation */}
      <Modal isOpen={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Problem">
        <p>Archive &quot;{archiveTarget?.title}&quot;? Historical submissions are preserved.</p>
        <div className="trainer-problems__modal-actions">
          <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={archiveSaving}>Cancel</Button>
          <Button variant="danger" disabled={archiveSaving} onClick={handleArchive}>
            {archiveSaving ? 'Archiving...' : 'Archive'}
          </Button>
        </div>
      </Modal>

      {/* Import modal */}
      <Modal isOpen={importModalOpen} onClose={resetImport} title="Bulk Import Problems">
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <Button variant={importMode === 'file' ? 'primary' : 'secondary'} onClick={() => setImportMode('file')} style={{ flex: 1 }}>Upload JSON</Button>
          <Button variant={importMode === 'text' ? 'primary' : 'secondary'} onClick={() => setImportMode('text')} style={{ flex: 1 }}>Paste JSON</Button>
        </div>

        {importMode === 'file' ? (
          <div>
            <label htmlFor="trainer-import-file" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>Select .json File</label>
            <div
              className="trainer-problems__drag-drop-area"
              role="button"
              tabIndex={0}
              aria-label="Upload JSON file"
              onClick={() => document.getElementById('trainer-import-file-input')?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('trainer-import-file-input')?.click(); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); parseJsonFile(e.dataTransfer.files?.[0]); }}
            >
              <p style={{ margin: 0 }}>
                {importFile ? `Selected: ${importFile.name} (${parsedPreview.length} problem(s))` : 'Drag & drop a JSON file here, or click to select'}
              </p>
            </div>
            <input
              id="trainer-import-file-input"
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => parseJsonFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="trainer-import-text" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>Paste JSON Array</label>
            <textarea
              id="trainer-import-text"
              rows={8}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                try {
                  const parsed = JSON.parse(e.target.value);
                  setParsedPreview(Array.isArray(parsed) ? parsed : [parsed]);
                  setImportErrors([]);
                } catch {
                  setParsedPreview([]);
                }
              }}
              placeholder='[{"problem": {"title": "Two Sum", "difficulty": "EASY", "description": "...", "testCases": [...]}}]'
              style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}
            />
            {importText.trim() && parsedPreview.length > 0 && (
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: '#16a34a' }}>
                ✓ Valid JSON: {parsedPreview.length} problem(s) ready for import.
              </div>
            )}
          </div>
        )}

        {parsedPreview.length > 0 && importErrors.length === 0 && importMode === 'file' && (
          <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: '#16a34a' }}>
            ✓ Valid JSON: {parsedPreview.length} problem(s) ready for import.
          </div>
        )}

        {importErrors.length > 0 && (
          <div role="alert" style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: '#dc2626' }}>
            {importErrors.map((e, i) => (
              <div key={i}>{e.row ? `Row ${e.row}: ` : ''}{e.message}</div>
            ))}
          </div>
        )}

        <div className="trainer-problems__modal-actions">
          <Button variant="secondary" onClick={resetImport} disabled={importSubmitting}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={importSubmitting || (importMode === 'file' && !importFile) || (importMode === 'text' && !importText.trim())}
          >
            {importSubmitting ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
