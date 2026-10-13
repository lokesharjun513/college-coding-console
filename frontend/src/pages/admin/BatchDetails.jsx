import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getBatch,
  getTrainers,
  updateBatch,
  deleteBatch,
  getBatchStudents,
  getStudents,
  enrollStudent,
  deleteStudentEnrollment,
  updateStudentEnrollment,
} from '../../api/admin';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Toast from '../../components/ui/Toast';
import PageHeader from '../../components/ui/PageHeader';
import EnrollStudentsModal from '../../components/admin/EnrollStudentsModal';
import BatchEnrollmentSection from '../../components/admin/BatchEnrollmentSection';
import { Award, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import '../../styles/pages/admin.css';
import '../../styles/pages/admin-dashboard.css';
import '../../styles/pages/admin-batch-details.css';

/**
 * Normalise any identifier shape to a stable string.
 *
 * Enrollments store the linked User id. The student list returns the Student
 * profile document as `_id` plus the User id as `userId`, and enrolled records
 * come back with a populated `student` object. Comparing raw values would miss
 * matches (and would re-offer already-enrolled students), so both sides are
 * reduced to strings before comparison. Names are never used for identity.
 */
const normalizeId = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    return normalizeId(value.userId ?? value.student?.id ?? value.student?.userId ?? value._id ?? value.id);
  }
  const asString = String(value);
  return asString && asString !== '[object Object]' ? asString : null;
};

/* ─────────────────────────────────────────────────────────────
   Trainer assignment card
   ───────────────────────────────────────────────────────────── */
/** Mirrors the Admin Trainers table initials helper. */
const getInitials = (name) => {
  if (!name) return '';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

function TrainerAssignmentCard({ trainer, onAssign }) {
  const isAssigned = Boolean(trainer);

  return (
    <section className="admin-batch-trainer" aria-label="Trainer assignment" role="region">
      <span className="admin-batch-trainer__icon" aria-hidden="true">
        <Award size={20} />
      </span>

      <div className="admin-batch-trainer__content">
        <h3 className="admin-batch-trainer__title">Trainer Assignment</h3>
        <p className="admin-batch-trainer__description">
          Manage the instructional lead for this batch
        </p>

        <div className="admin-batch-trainer__identity">
          {isAssigned ? (
            <>
              {/* 48px initials avatar reusing the shared admin avatar tokens */}
              <div className="admin-batch-trainer__avatar admin-avatar admin-avatar--trainer" aria-hidden="true">
                {getInitials(trainer.name)}
              </div>
              <div className="admin-batch-trainer__identity-text">
                <span className="admin-batch-trainer__name">{trainer.name}</span>
                <span className="admin-batch-trainer__email">{trainer.email}</span>
              </div>
            </>
          ) : (
            <>
              <div className="admin-batch-trainer__avatar admin-batch-trainer__avatar--empty" aria-hidden="true">
                <UserPlus size={20} />
              </div>
              <div className="admin-batch-trainer__identity-text">
                <span className="admin-batch-trainer__name">No trainer assigned</span>
                <span className="admin-batch-trainer__email">
                  Assign an instructional lead to get started
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="admin-batch-trainer__actions">
        {/* Text carries the meaning; colour and dot are supplementary. */}
        <span
          className={`admin-batch-trainer__status ${isAssigned ? 'admin-batch-trainer__status--assigned' : 'admin-batch-trainer__status--unassigned'}`}
          role="status"
        >
          {isAssigned ? 'Assigned' : 'Not Assigned'}
        </span>
        <button
          type="button"
          className="admin-batch-trainer__action"
          onClick={onAssign}
        >
          {isAssigned ? 'Change Trainer' : 'Assign Trainer'}
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Admin – Batch Details
   ───────────────────────────────────────────────────────────── */
export default function AdminBatchDetails() {
  const { batchId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trainerSearch, setTrainerSearch] = useState('');
  const [batch, setBatch] = useState(null);
  const [trainers, setTrainers] = useState([]);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTrainerId, setAssignTrainerId] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', description: '', trainer: '',
    status: 'ACTIVE', startDate: '', endDate: '',
  });

  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);

  // Enrollment filtering / selection / confirmation state now lives inside
  // <BatchEnrollmentSection>. The Add Students modal owns only its view state
  // (search + filters); the roster and the selection stay here.
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedAvailableIds, setSelectedAvailableIds] = useState([]);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollError, setEnrollError] = useState(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState(null);

  const [toast, setToast] = useState(null);

  const filteredTrainers = useMemo(
    () => trainers.filter((t) =>
      t.name?.toLowerCase().includes(trainerSearch.toLowerCase()) ||
      t.email?.toLowerCase().includes(trainerSearch.toLowerCase())
    ),
    [trainers, trainerSearch]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchRes, trainersRes, enrolledRes] = await Promise.all([
        getBatch(batchId),
        getTrainers(),
        getBatchStudents(batchId).catch(() => ({ data: { data: [] } })),
      ]);
      const batchData = batchRes.data?.data;
      if (!batchData) {
        setError('Batch not found');
        return;
      }
      setBatch(batchData);
      setTrainers(trainersRes.data?.data || []);
      setEnrolledStudents(enrolledRes.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load batch details');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  /**
   * The eligible-student roster is loaded separately from the batch itself so
   * a failure here degrades the enrollment modal (which shows an explicit error
   * and a Retry) instead of failing the whole page.
   */
  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setStudentsError(null);
    try {
      const res = await getStudents();
      setAllStudents((res.data?.data || []).map((s) => ({ ...s, id: s._id || s.id })));
    } catch (err) {
      setStudentsError(err?.response?.data?.message || 'Failed to load students');
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (batchId) fetchData();
  }, [batchId, fetchData]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  /* ── Eligible (available) students ─────────────────────── */

  const enrolledStudentIds = useMemo(() => {
    const ids = new Set();
    for (const enrollment of enrolledStudents) {
      const id = normalizeId(enrollment.student);
      if (id) ids.add(id);
    }
    return ids;
  }, [enrolledStudents]);

  // Eligibility only: search and the filter selects are owned by the modal.
  const availableStudents = useMemo(() => {
    return allStudents
      .map((student) => ({
        ...student,
        // Enrollment must key off the linked User id, not the Student document.
        id: normalizeId(student.userId) ?? normalizeId(student.studentId) ?? normalizeId(student._id ?? student.id),
      }))
      .filter((student) => {
        if (!student.id) return false;
        if (enrolledStudentIds.has(student.id)) return false;
        if (student.status !== 'ACTIVE') return false;
        return true;
      });
  }, [allStudents, enrolledStudentIds]);

  /* ── Actions ───────────────────────────────────────────── */

  const openEdit = () => {
    if (!batch) return;
    setForm({
      name: batch.name || '',
      code: batch.code || '',
      description: batch.description || '',
      trainer: batch.trainer?.id || '',
      status: batch.status || 'ACTIVE',
      startDate: batch.startDate ? new Date(batch.startDate).toISOString().split('T')[0] : '',
      endDate: batch.endDate ? new Date(batch.endDate).toISOString().split('T')[0] : '',
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateBatch(batchId, form);
      setToast({ message: 'Batch updated successfully', type: 'success' });
      setEditModalOpen(false);
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Update failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const openAssignModal = () => {
    setTrainerSearch('');
    setAssignTrainerId(batch.trainer?.id || '');
    setAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateBatch(batchId, { trainer: assignTrainerId || null });
      setToast({ message: 'Trainer assigned successfully', type: 'success' });
      setAssignModalOpen(false);
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Assignment failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBatch(batchId);
      setToast({ message: 'Batch deleted successfully', type: 'success' });
      setDeleteModalOpen(false);
      setTimeout(() => navigate('/admin/batches'), 600);
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Delete failed', type: 'error' });
      setDeleteModalOpen(false);
    }
  };

  const openEnrollmentModal = () => {
    setSelectedAvailableIds([]);
    setEnrollError(null);
    setAddModalOpen(true);
  };

  const toggleAvailable = (id) => {
    setSelectedAvailableIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  /**
   * The modal passes the ids of the *filtered* eligible rows, so "select all"
   * applies to what the admin can actually see. Selections made outside the
   * current filter are preserved, and every id is de-duplicated.
   */
  const toggleSelectAllAvailable = (ids) => {
    setSelectedAvailableIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.includes(id));
      return allSelected
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])];
    });
  };

  const handleEnrollSubmit = async () => {
    if (selectedAvailableIds.length === 0 || enrollSubmitting) return;
    setEnrollSubmitting(true);
    setEnrollError(null);
    try {
      // Re-validate against the current eligible roster: a student enrolled in
      // another tab since the modal opened must not be submitted.
      const eligibleIds = new Set(availableStudents.map((s) => s.id));
      const targets = [...new Set(selectedAvailableIds.filter((id) => eligibleIds.has(id)))];

      if (targets.length === 0) {
        setEnrollError('None of the selected students are eligible for this batch anymore.');
        setSelectedAvailableIds([]);
        return;
      }

      // Sequential on purpose: the existing contract is one enrollment per
      // request, and a failure must not silently skip the remaining students.
      const succeeded = [];
      let lastError = null;
      for (const studentId of targets) {
        try {
          await enrollStudent(batchId, studentId);
          succeeded.push(studentId);
        } catch (err) {
          lastError = err;
        }
      }

      // Drop the ids that are already enrolled so a retry cannot duplicate them.
      setSelectedAvailableIds((prev) => prev.filter((id) => !succeeded.includes(id)));

      if (lastError) {
        setEnrollError(lastError?.response?.data?.message || 'Failed to enroll selected students');
        if (succeeded.length > 0) {
          setToast({ message: `Enrolled ${succeeded.length} student(s)`, type: 'success' });
        }
        return;
      }

      setToast({ message: `Successfully enrolled ${targets.length} student(s)`, type: 'success' });
      setSelectedAvailableIds([]);
      setAddModalOpen(false);
      // Refresh the roster so newly enrolled students leave the eligible list.
      await Promise.all([fetchData(), loadStudents()]);
    } catch (err) {
      // Selection is preserved so a partial failure can be retried.
      setEnrollError(err?.response?.data?.message || 'Failed to enroll selected students');
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const handleEnrollmentStatusChange = async (enrollment, nextStatus) => {
    const studentId = normalizeId(enrollment?.student);
    if (!studentId) return;
    try {
      await updateStudentEnrollment(batchId, studentId, nextStatus);
      const verb = nextStatus === 'ACTIVE' ? 'activated' : 'deactivated';
      setToast({ message: `Student ${verb} successfully`, type: 'success' });
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to update status', type: 'error' });
      throw err;
    }
  };

  const handleEnrollmentRemoval = async (enrollment, options = {}) => {
    const studentId = normalizeId(enrollment?.student);
    if (!studentId) return;
    try {
      await deleteStudentEnrollment(batchId, studentId);
      // Bulk removal fires once per student; the summary toast is emitted by
      // handleBulkRemovalSummary instead of repeating a success toast per row.
      if (!options.silent) {
        setToast({ message: 'Student removed from batch successfully', type: 'success' });
      }
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to remove student', type: 'error' });
      throw err;
    }
  };

  const handleBulkRemovalSummary = (removed, failed) => {
    if (failed === 0 && removed > 0) {
      setToast({ message: `Successfully removed ${removed} student(s) from batch`, type: 'success' });
      return;
    }
    setToast({
      message: removed > 0
        ? `Removed ${removed} student(s). ${failed} could not be removed.`
        : 'Failed to remove the selected students',
      type: 'error',
    });
  };


  /* ── Render ────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="admin-page admin-batch" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="admin-page admin-batch">
        <div className="admin-error">
          <h3>Batch Not Found</h3>
          <p>{error || 'The requested batch could not be found.'}</p>
          <Button onClick={() => navigate('/admin/batches')}>Back to Batches</Button>
        </div>
      </div>
    );
  }

  const activeEnrollments = enrolledStudents.filter((e) => e.status === 'ACTIVE').length;

  return (
    <div className="admin-page admin-batch">
      <PageHeader
        title={batch.name}
        description={`Code: ${batch.code} — ${batch.description || 'No description provided.'}`}
        breadcrumb={
          <>
            <Link to="/admin" className="admin-breadcrumb__item">Admin</Link>
            <span className="admin-breadcrumb__separator">/</span>
            <Link to="/admin/batches" className="admin-breadcrumb__item">Batches</Link>
            <span className="admin-breadcrumb__separator">/</span>
            <span className="admin-breadcrumb__current">{batch.name}</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={openEdit}>
              <Pencil size={16} style={{ marginRight: '6px' }} /> Edit Batch
            </Button>
            <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
              <Trash2 size={16} style={{ marginRight: '6px' }} /> Delete
            </Button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="admin-dashboard__kpi-grid">
        <div className="admin-dashboard__stat-card">
          <span className="admin-dashboard__stat-label">Enrolled Students</span>
          <span className="admin-dashboard__stat-value">{enrolledStudents.length}</span>
          <span className="admin-dashboard__stat-meta">Active roster count</span>
        </div>
        <div className="admin-dashboard__stat-card">
          <span className="admin-dashboard__stat-label">Status</span>
          <span className="admin-dashboard__stat-value">
            <Badge variant={batch.status === 'ACTIVE' ? 'success' : batch.status === 'COMPLETED' ? 'info' : 'neutral'}>
              {batch.status}
            </Badge>
          </span>
          <span className="admin-dashboard__stat-meta">Cohort state</span>
        </div>
        <div className="admin-dashboard__stat-card">
          <span className="admin-dashboard__stat-label">Timeline</span>
          <span className="admin-dashboard__stat-value" style={{ fontSize: '16px' }}>
            {batch.startDate ? new Date(batch.startDate).toLocaleDateString() : '—'} → {batch.endDate ? new Date(batch.endDate).toLocaleDateString() : '—'}
          </span>
          <span className="admin-dashboard__stat-meta">Academic schedule</span>
        </div>
        <div className="admin-dashboard__stat-card">
          <span className="admin-dashboard__stat-label">Active Students</span>
          <span className="admin-dashboard__stat-value">{activeEnrollments}</span>
          <span className="admin-dashboard__stat-meta">Active enrollments</span>
        </div>
      </div>

      <TrainerAssignmentCard trainer={batch.trainer} onAssign={openAssignModal} />
      {/* Enrollment */}
      <BatchEnrollmentSection
        batch={batch}
        enrolledStudents={enrolledStudents}
        onOpenEnrollment={openEnrollmentModal}
        onToggleStatus={handleEnrollmentStatusChange}
        onRemoveEnrollment={handleEnrollmentRemoval}
        onBulkRemoveComplete={handleBulkRemovalSummary}
      />


      {/* ── Edit Batch ── */}
      {editModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setEditModalOpen(false)} role="presentation">
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit batch">
            <div className="admin-modal__header">
              <h2 className="admin-modal__title">Edit Batch</h2>
              <button type="button" className="admin-modal__close" onClick={() => setEditModalOpen(false)} aria-label="Close edit dialog">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="admin-modal__body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label htmlFor="edit-name" className="admin-form-label">Batch Name *</label>
                    <input id="edit-name" name="name" type="text" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} required className="admin-input" />
                  </div>
                  <div>
                    <label htmlFor="edit-code" className="admin-form-label">Batch Code *</label>
                    <input id="edit-code" name="code" type="text" value={form.code} onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value }))} required className="admin-input" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label htmlFor="edit-trainer" className="admin-form-label">Assigned Trainer</label>
                    <select id="edit-trainer" name="trainer" value={form.trainer} onChange={(e) => setForm(prev => ({ ...prev, trainer: e.target.value }))} className="admin-select">
                      <option value="">No trainer assigned</option>
                      {trainers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-status" className="admin-form-label">Status</label>
                    <select id="edit-status" name="status" value={form.status} onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))} className="admin-select">
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label htmlFor="edit-startDate" className="admin-form-label">Start Date</label>
                    <input id="edit-startDate" name="startDate" type="date" value={form.startDate} onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))} className="admin-input" />
                  </div>
                  <div>
                    <label htmlFor="edit-endDate" className="admin-form-label">End Date</label>
                    <input id="edit-endDate" name="endDate" type="date" value={form.endDate} onChange={(e) => setForm(prev => ({ ...prev, endDate: e.target.value }))} className="admin-input" />
                  </div>
                </div>
                <div>
                  <label htmlFor="edit-description" className="admin-form-label">Description</label>
                  <textarea id="edit-description" name="description" rows={3} value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} className="admin-input" style={{ resize: 'vertical', minHeight: '80px' }} />
                </div>
              </div>
              <div className="admin-modal__footer">
                <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Assign Trainer ── */}
      {assignModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setAssignModalOpen(false)} role="presentation">
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Change trainer" style={{ maxWidth: 480 }}>
            <div className="admin-modal__header">
              <div>
                <h2 className="admin-modal__title">Change Trainer</h2>
                <p className="admin-modal__description">
                  Select an instructional lead for <strong>{batch.name}</strong>.
                </p>
              </div>
              <button type="button" className="admin-modal__close" onClick={() => setAssignModalOpen(false)} aria-label="Close trainer dialog">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAssignSubmit}>
              <div className="admin-modal__body">
                <div style={{ marginBottom: '12px' }}>
                  <label className="admin-form-label" htmlFor="trainer-search">Search trainers</label>
                  <input
                    id="trainer-search"
                    type="text"
                    placeholder="Search by name or email…"
                    value={trainerSearch}
                    onChange={(e) => setTrainerSearch(e.target.value)}
                    className="admin-input"
                  />
                </div>
                <div>
                  <label htmlFor="assignTrainer" className="admin-form-label">Trainer</label>
                  <select id="assignTrainer" value={assignTrainerId} onChange={(e) => setAssignTrainerId(e.target.value)} className="admin-select">
                    <option value="">No trainer assigned</option>
                    {filteredTrainers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="admin-modal__footer">
                <Button type="button" variant="secondary" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting || assignTrainerId === (batch.trainer?.id || '')}>
                  {submitting ? 'Assigning…' : 'Confirm Assignment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Batch ── */}
      {deleteModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setDeleteModalOpen(false)} role="presentation">
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delete batch" style={{ maxWidth: 420 }}>
            <h2 className="admin-modal__title" style={{ marginBottom: '8px', color: 'var(--admin-danger-text, #D94668)' }}>Delete Batch</h2>
            <div className="admin-modal__body">
              <p style={{ margin: 0 }}>
                Are you sure you want to delete <strong>{batch.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="admin-modal__footer">
              <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete Batch</Button>
            </div>
          </div>
        </div>
      )}

      <EnrollStudentsModal
        isOpen={addModalOpen}
        batchName={batch.name}
        eligibleStudents={availableStudents}
        selectedIds={selectedAvailableIds}
        loading={studentsLoading}
        loadError={studentsError}
        submitting={enrollSubmitting}
        error={enrollError}
        onRetry={loadStudents}
        onToggle={toggleAvailable}
        onToggleAll={toggleSelectAllAvailable}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleEnrollSubmit}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
