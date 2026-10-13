import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getTrainerBatches,
  getBatchAssignments,
  getAssignableProblems,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from '../../api/trainer';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import '../../styles/pages/trainer-assignments.css';

// Assignment lifecycle status -> BEM modifier. Status is always rendered as text
// next to the colour, never colour alone.
function statusClass(status) {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE') return 'active';
  if (s === 'COMPLETED') return 'completed';
  if (s === 'CANCELLED') return 'cancelled';
  return 'neutral';
}

// ISO date -> yyyy-mm-dd for <input type="date">; '' means "not set".
function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

// Full availability label. Open-ended practice: no date means available now,
// and there is never a due date.
function availabilityLabel(value) {
  if (!value) return 'Available now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Available now';
  return `Available ${date.toLocaleDateString()}`;
}

/** Completion percentage, only when the API supplies a usable denominator. */
function completionPercent(monitoring) {
  const total = monitoring?.enrolledStudents;
  if (!Number.isFinite(total) || total <= 0) return null;
  const completed = Number.isFinite(monitoring.completed) ? monitoring.completed : 0;
  return Math.round((completed / total) * 100);
}

const emptyForm = { problemId: '', title: '', availableFrom: '', status: 'ACTIVE' };

export default function Assignments() {
  const { batchId } = useParams();
  const navigate = useNavigate();

  // Batch picker (used when the page is opened without a batch in the URL).
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState(null);

  const [batch, setBatch] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [assignableProblems, setAssignableProblems] = useState([]);
  const [loading, setLoading] = useState(Boolean(batchId));
  const [error, setError] = useState(null);

  const [notice, setNotice] = useState(null);
  const [formError, setFormError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const res = await getTrainerBatches();
      setBatches(res.data?.data || []);
    } catch (err) {
      setBatchesError(err?.response?.data?.message || 'Unable to load your batches.');
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!batchId) loadBatches();
  }, [batchId, loadBatches]);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignmentsRes, problemsRes] = await Promise.all([
        getBatchAssignments(batchId),
        getAssignableProblems(batchId),
      ]);
      setAssignments(assignmentsRes.data?.data || []);
      setAssignableProblems(problemsRes.data?.data || []);
    } catch (err) {
      setAssignments([]);
      setAssignableProblems([]);
      setError(err?.response?.data?.message || 'Unable to load assignments.');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;
    setAssignments([]);
    setAssignableProblems([]);
    setShowCreate(false);
    setEditing(null);
    setDeleteTarget(null);
    setNotice(null);
    setFormError(null);
    loadAssignments();
  }, [batchId, loadAssignments]);

  // Batch name for the header — best effort, never blocks the list.
  useEffect(() => {
    if (!batchId) {
      setBatch(null);
      return;
    }
    let active = true;
    getTrainerBatches()
      .then((res) => {
        if (!active) return;
        const list = res.data?.data || [];
        setBatch(list.find((b) => String(b.id) === String(batchId)) || null);
      })
      .catch(() => { if (active) setBatch(null); });
    return () => { active = false; };
  }, [batchId]);

  const assignedProblemIds = useMemo(() => {
    // Only blocks the create form for the exact date currently selected.
    const key = toDateInput(form.availableFrom);
    return new Set(
      assignments
        .filter((a) => !a.deleted && toDateInput(a.availableFrom) === key)
        .map((a) => String(a.problem?.id))
    );
  }, [assignments, form.availableFrom]);

  const selectableProblems = useMemo(
    () => assignableProblems.filter((p) => !assignedProblemIds.has(String(p.id))),
    [assignableProblems, assignedProblemIds]
  );

  const openCreate = () => {
    setForm(emptyForm);
    setFormError(null);
    setShowCreate(true);
  };

  const submitCreate = async () => {
    if (!form.problemId) {
      setFormError('Select a problem to assign.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = { problemId: form.problemId };
      if (form.title.trim()) payload.title = form.title.trim();
      if (form.availableFrom) payload.availableFrom = form.availableFrom;
      payload.status = form.status;

      await createAssignment(batchId, payload);
      setShowCreate(false);
      setNotice('Assignment created.');
      await loadAssignments();
    } catch (err) {
      // A real 409 from the unique (batch, problem, availableFrom) index.
      if (err?.response?.status === 409) {
        setFormError('This problem is already assigned to this batch for that date.');
      } else {
        setFormError(err?.response?.data?.message || 'Could not create the assignment.');
      }
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (assignment) => {
    setEditing(assignment);
    setFormError(null);
    setEditForm({
      title: assignment.title || '',
      availableFrom: toDateInput(assignment.availableFrom),
      status: assignment.status || 'ACTIVE',
    });
  };

  const submitEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    setFormError(null);
    try {
      // Only the supported mutable fields. No dueDate exists in the API.
      const payload = {
        title: editForm.title.trim() ? editForm.title.trim() : null,
        availableFrom: editForm.availableFrom || null,
        status: editForm.status,
      };
      await updateAssignment(batchId, editing.id, payload);
      setEditing(null);
      setNotice('Assignment updated.');
      await loadAssignments();
    } catch (err) {
      if (err?.response?.status === 409) {
        setFormError('Another assignment already uses this problem for that date.');
      } else {
        setFormError(err?.response?.data?.message || 'Could not update the assignment.');
      }
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await deleteAssignment(batchId, deleteTarget.id);
      setDeleteTarget(null);
      setNotice('Assignment removed.');
      await loadAssignments();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not remove the assignment.');
      setDeleteTarget(null);
    } finally {
      setDeleteSaving(false);
    }
  };

  // ---------------------------------------------------------------- picker
  if (!batchId) {
    return (
      <div className="trainer-assignments">
        <nav className="trainer-assignments__crumb" aria-label="Breadcrumb">
          <Link to="/trainer">Trainer</Link>
          <span className="trainer-assignments__crumb-sep">/</span>
          <span className="trainer-assignments__crumb-current">Assignments</span>
        </nav>

        <header className="trainer-assignments__header">
          <div>
            <h1 className="trainer-assignments__title">Assignments</h1>
            <p className="trainer-assignments__description">
              Choose a batch to assign problems and track how many students have completed them.
            </p>
          </div>
        </header>

        {batchesLoading && (
          <div className="trainer-assignments__loading" role="status">
            <Spinner /> <span>Loading your batches…</span>
          </div>
        )}

        {batchesError && (
          <div className="trainer-assignments__error" role="alert">
            {batchesError}
            <Button variant="secondary" onClick={loadBatches}>Retry</Button>
          </div>
        )}

        {!batchesLoading && !batchesError && batches.length === 0 && (
          <div className="trainer-assignments__empty">
            <h2>No batches assigned to you yet</h2>
            <p>Once an admin assigns you a batch you can start creating assignments for it.</p>
          </div>
        )}

        {batches.length > 0 && (
          <ul className="trainer-assignments__list">
            {batches.map((b) => (
              <li key={b.id} className="trainer-assignments__row">
                <div className="trainer-assignments__row-info">
                  <span className="trainer-assignments__row-title">{b.name}</span>
                  <div className="trainer-assignments__row-meta">
                    {b.code && <span className="trainer-assignments__tag">{b.code}</span>}
                    {b.status && (
                      <span className={`trainer-assignments__tag trainer-assignments__tag--${statusClass(b.status)}`}>
                        {b.status}
                      </span>
                    )}
                    <span className="trainer-assignments__row-subtle">
                      {b.studentCount ?? 0} enrolled student{b.studentCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/trainer/batches/${b.id}/assignments`)}
                >
                  Manage Assignments
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- list
  if (loading) {
    return (
      <div className="trainer-assignments__loading" role="status">
        <Spinner /> <span>Loading assignments…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trainer-assignments">
        <div className="trainer-assignments__error" role="alert">
          {error}
          <Button variant="secondary" onClick={loadAssignments}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="trainer-assignments">
      <nav className="trainer-assignments__crumb" aria-label="Breadcrumb">
        <Link to="/trainer">Trainer</Link>
        <span className="trainer-assignments__crumb-sep">/</span>
        <Link to="/trainer/batches">Batches</Link>
        <span className="trainer-assignments__crumb-sep">/</span>
        <Link to={`/trainer/batches/${batchId}`}>{batch?.name || 'Batch'}</Link>
        <span className="trainer-assignments__crumb-sep">/</span>
        <span className="trainer-assignments__crumb-current">Assignments</span>
      </nav>

      <header className="trainer-assignments__header">
        <div>
          <h1 className="trainer-assignments__title">Assignments</h1>
          <p className="trainer-assignments__description">
            Open-ended practice for {batch?.name || 'this batch'}. There is no due date — students finish at their own pace.
          </p>
        </div>
        <div className="trainer-assignments__header-actions">
          <Button variant="secondary" onClick={() => navigate(`/trainer/batches/${batchId}`)}>Back to Batch</Button>
          <Button variant="primary" onClick={openCreate}>New Assignment</Button>
        </div>
      </header>

      {notice && (
        <div className="trainer-assignments__notice" role="status">
          {notice}
          <button type="button" className="trainer-assignments__dismiss" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="trainer-assignments__empty">
          <h2>No assignments yet</h2>
          <p>Use “New Assignment” above to assign a published problem so enrolled students can start practising.</p>
        </div>
      ) : (
        <ul className="trainer-assignments__list">
          {assignments.map((assignment) => {
            const percent = completionPercent(assignment.monitoring);
            return (
              <li key={assignment.id} className="trainer-assignments__row">
                <div className="trainer-assignments__row-info">
                  <span className="trainer-assignments__row-title">
                    {assignment.title || assignment.problem?.title || 'Untitled assignment'}
                  </span>
                  <div className="trainer-assignments__row-meta">
                    <span className={`trainer-assignments__tag trainer-assignments__tag--${statusClass(assignment.status)}`}>
                      {assignment.status}
                    </span>
                    {assignment.problem?.scope && (
                      <span className="trainer-assignments__tag">{assignment.problem.scope}</span>
                    )}
                    {assignment.problem?.difficulty && (
                      <span className="trainer-assignments__tag">{assignment.problem.difficulty}</span>
                    )}
                    <span className="trainer-assignments__row-subtle">
                      {availabilityLabel(assignment.availableFrom)}
                    </span>
                  </div>
                  {percent !== null && (
                    <div className="trainer-assignments__progress">
                      <div
                        className="trainer-assignments__progress-track"
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Completion for ${assignment.title || assignment.problem?.title}`}
                      >
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <span className="trainer-assignments__progress-label">
                        {assignment.monitoring.completed} completed · {assignment.monitoring.pending} pending ·{' '}
                        {assignment.monitoring.enrolledStudents} enrolled · {percent}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="trainer-assignments__row-actions">
                  <Button variant="secondary" onClick={() => openEdit(assignment)}>Edit</Button>
                  <Button variant="danger" onClick={() => { setFormError(null); setDeleteTarget(assignment); }}>
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create — no dueDate control: the API has none */}
      <Modal isOpen={showCreate} onClose={() => !saving && setShowCreate(false)} title="New Assignment">
        <div className="trainer-assignments__field">
          <label htmlFor="assignment-problem">Problem</label>
          <select
            id="assignment-problem"
            value={form.problemId}
            onChange={(e) => setForm({ ...form, problemId: e.target.value })}
          >
            <option value="">Select a published problem…</option>
            {selectableProblems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} — {p.scope} · {p.difficulty}
              </option>
            ))}
          </select>
          {assignableProblems.length > 0 && selectableProblems.length === 0 && (
            <p className="trainer-assignments__hint">
              Every assignable problem is already assigned for the selected date.
            </p>
          )}
        </div>

        <div className="trainer-assignments__field">
          <label htmlFor="assignment-title">Title (optional)</label>
          <input
            id="assignment-title"
            type="text"
            value={form.title}
            placeholder="Defaults to the problem title"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div className="trainer-assignments__field">
          <label htmlFor="assignment-available-from">Available from (optional)</label>
          <input
            id="assignment-available-from"
            type="date"
            value={form.availableFrom}
            onChange={(e) => setForm({ ...form, availableFrom: e.target.value })}
          />
          <p className="trainer-assignments__hint">Leave empty to make it available immediately. There is no deadline.</p>
        </div>

        <div className="trainer-assignments__field">
          <label htmlFor="assignment-status">Status</label>
          <select
            id="assignment-status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {formError && <div className="trainer-assignments__form-error" role="alert">{formError}</div>}

        <div className="trainer-assignments__modal-actions">
          <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submitCreate} loading={saving} disabled={!form.problemId}>
            Create Assignment
          </Button>
        </div>
      </Modal>

      {/* Edit */}
      <Modal isOpen={Boolean(editing)} onClose={() => !editSaving && setEditing(null)} title="Edit Assignment">
        <div className="trainer-assignments__field">
          <label htmlFor="edit-title">Title</label>
          <input
            id="edit-title"
            type="text"
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
          />
        </div>

        <div className="trainer-assignments__field">
          <label htmlFor="edit-available-from">Available from</label>
          <input
            id="edit-available-from"
            type="date"
            value={editForm.availableFrom}
            onChange={(e) => setEditForm({ ...editForm, availableFrom: e.target.value })}
          />
        </div>

        <div className="trainer-assignments__field">
          <label htmlFor="edit-status">Status</label>
          <select
            id="edit-status"
            value={editForm.status}
            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {formError && <div className="trainer-assignments__form-error" role="alert">{formError}</div>}

        <div className="trainer-assignments__modal-actions">
          <Button variant="secondary" onClick={() => setEditing(null)} disabled={editSaving}>Cancel</Button>
          <Button variant="primary" onClick={submitEdit} loading={editSaving}>Save Changes</Button>
        </div>
      </Modal>

      {/* Soft delete confirmation */}
      <Modal isOpen={Boolean(deleteTarget)} onClose={() => !deleteSaving && setDeleteTarget(null)} title="Remove Assignment">
        <p>
          Remove &quot;{deleteTarget?.title || deleteTarget?.problem?.title}&quot; from this batch?
          The record is kept for reporting and the same problem can be assigned again straight away.
        </p>
        <div className="trainer-assignments__modal-actions">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} loading={deleteSaving}>Remove</Button>
        </div>
      </Modal>
    </div>
  );
}