import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import TableActions from '../../components/ui/table/TableActions';
import { Pencil, Trash2, Plus, Search, Calendar, Users, Award, BookOpen, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import { getBatches, createBatch, updateBatch, deleteBatch, getTrainers } from '../../api/admin';
import '../../styles/pages/admin-batches.css';

/**
 * Admin - Batches Management Page (Apple iOS Enterprise SaaS Redesign)
 */
export default function Batches() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignBatch, setAssignBatch] = useState(null);
  const [assignTrainer, setAssignTrainer] = useState('');
  const [meta, setMeta] = useState({ page: 1, limit: 10 });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteBatchId, setDeleteBatchId] = useState(null);
  const [deleteBatchName, setDeleteBatchName] = useState('');
  const [removeTrainerModalOpen, setRemoveTrainerModalOpen] = useState(false);
  const [batchToRemoveTrainer, setBatchToRemoveTrainer] = useState(null);
  const [toast, setToast] = useState(null);
  const [toggleId, setToggleId] = useState(null);
  const [toggleName, setToggleName] = useState('');
  const [toggleTargetStatus, setToggleTargetStatus] = useState(null);
  const [editing, setEditing] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    trainer: '',
    status: 'ACTIVE',
    startDate: '',
    endDate: '',
  });

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchesRes, trainersRes] = await Promise.all([getBatches(), getTrainers()]);
      setBatches(batchesRes.data?.data || []);
      setTrainers(trainersRes.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const filteredBatches = batches.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' ? true : b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const paginatedBatches = filteredBatches.slice(
    (meta.page - 1) * meta.limit,
    meta.page * meta.limit
  );

  const totalPages = Math.ceil(filteredBatches.length / meta.limit);

  useEffect(() => {
    setMeta(prev => ({ ...prev, page: 1 }));
  }, [searchTerm, statusFilter]);

  const openCreate = () => {
    setForm({
      name: '',
      code: '',
      description: '',
      trainer: '',
      status: 'ACTIVE',
      startDate: '',
      endDate: '',
    });
    setEditing(null);
    setModalOpen(true);
  };

  const openAssignTrainer = (batch) => {
    setAssignBatch(batch);
    setAssignTrainer(batch.trainer?.id || '');
    setAssignModalOpen(true);
  };

  const openRemoveTrainer = (batch) => {
    setBatchToRemoveTrainer(batch);
    setRemoveTrainerModalOpen(true);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateBatch(assignBatch.id, { trainer: assignTrainer || null });
      setToast({ message: 'Trainer assigned successfully', type: 'success' });
      setAssignModalOpen(false);
      await fetchBatches();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Assignment failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (batch) => {
    setForm({
      name: batch.name || '',
      code: batch.code || '',
      description: batch.description || '',
      trainer: batch.trainer?.id || '',
      status: batch.status || 'ACTIVE',
      startDate: batch.startDate ? new Date(batch.startDate).toISOString().split('T')[0] : '',
      endDate: batch.endDate ? new Date(batch.endDate).toISOString().split('T')[0] : '',
    });
    setEditing(batch);
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await updateBatch(editing.id, form);
        setToast({ message: 'Batch updated successfully', type: 'success' });
      } else {
        await createBatch(form);
        setToast({ message: 'Batch created successfully', type: 'success' });
      }
      setModalOpen(false);
      await fetchBatches();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Operation failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (id, name) => {
    setDeleteBatchId(id);
    setDeleteBatchName(name);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteBatchId) return;
    try {
      await deleteBatch(deleteBatchId);
      setToast({ message: 'Batch deleted successfully', type: 'success' });
      setDeleteModalOpen(false);
      setDeleteBatchId(null);
      setDeleteBatchName('');
      await fetchBatches();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Delete failed', type: 'error' });
      setDeleteModalOpen(false);
    }
  };


  const handleRemoveTrainer = async () => {
    if (!batchToRemoveTrainer) return;
    try {
      await updateBatch(batchToRemoveTrainer.id, { trainer: null });
      setToast({ message: 'Trainer removed successfully', type: 'success' });
      setRemoveTrainerModalOpen(false);
      setBatchToRemoveTrainer(null);
      await fetchBatches();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to remove trainer', type: 'error' });
      setRemoveTrainerModalOpen(false);
      setBatchToRemoveTrainer(null);
    }
  };

  const toggleStatus = (batch) => {
    setToggleId(batch.id);
    setToggleName(batch.name);
    const target = batch.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setToggleTargetStatus(target);
  };

  const confirmToggleStatus = async () => {
    if (!toggleId) return;
    try {
      await updateBatch(toggleId, { status: toggleTargetStatus });
      setToast({ message: `Batch ${toggleTargetStatus.toLowerCase()} successfully`, type: 'success' });
      setToggleId(null);
      await fetchBatches();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to update batch status', type: 'error' });
    }
  };


  // KPI Calculations
  const totalBatchesCount = batches.length;
  const activeBatchesCount = batches.filter(b => b.status === 'ACTIVE').length;
  const completedBatchesCount = batches.filter(b => b.status === 'COMPLETED').length;
  const assignedTrainersCount = new Set(batches.filter(b => b.trainer).map(b => b.trainer.id)).size;

  return (
    <div className="admin-batches">
      {/* Apple iOS SaaS Header */}
      <div className="admin-batches__header">
        <div>
          <div className="admin-batches__eyebrow">Academic Administration</div>
          <h1>Batches & Schedules</h1>
          <p>Organize academic batches, assign trainers, and manage timelines.</p>
        </div>
        <div className="admin-batches__actions">
          <Button onClick={openCreate} className="admin-batches__bulk-btn">
            <Plus size={16} style={{ marginRight: '6px' }} /> Create Batch
          </Button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="admin-batches__kpi">
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Total Batches</span>
          <span className="admin-batches__kpi-value">{totalBatchesCount}</span>
          <span className="admin-batches__kpi-meta">All registered cohorts</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Active Batches</span>
          <span className="admin-batches__kpi-value" style={{ color: 'var(--color-success, #16a34a)' }}>{activeBatchesCount}</span>
          <span className="admin-batches__kpi-meta">Currently running</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Completed</span>
          <span className="admin-batches__kpi-value" style={{ color: 'var(--interactive, #2563eb)' }}>{completedBatchesCount}</span>
          <span className="admin-batches__kpi-meta">Finished cohorts</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Assigned Trainers</span>
          <span className="admin-batches__kpi-value">{assignedTrainersCount}</span>
          <span className="admin-batches__kpi-meta">Active instructional leads</span>
        </div>
      </div>

      {/* Search & Status Toggle Toolbar */}
      <div className="admin-batches__toolbar">
        <div className="admin-batches__toolbar-left">
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search batches by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="admin-batches__search"
              style={{ paddingLeft: '38px' }}
            />
          </div>

          <div className="admin-batches__toggle-group">
            {['ALL', 'ACTIVE', 'INACTIVE', 'COMPLETED'].map((status) => (
              <button
                key={status}
                type="button"
                className={`admin-batches__toggle-btn ${statusFilter === status ? 'active' : ''}`}
                onClick={() => setStatusFilter(status)}
              >
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {(searchTerm || statusFilter !== 'ALL') && (
          <button
            className="admin-batches__clear-btn"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('ALL');
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Content Area */}
      {loading && <Spinner />}
      {error && (
        <div className="admin-batches__error">
          <AlertCircle size={20} />
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={fetchBatches}>Retry</Button>
        </div>
      )}

      {!loading && !error && (
        <div className="admin-batches__card">
          {paginatedBatches.length === 0 ? (
            <div className="admin-batches__empty">
              <BookOpen size={40} style={{ color: 'var(--text-muted)' }} />
              <h3>No batches found</h3>
              <p>No batches match your search criteria or none have been created yet.</p>
              <Button onClick={openCreate}>Create First Batch</Button>
            </div>
          ) : (
            <>
              <table className="admin-batches__table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Batch Name</th>
                    <th>Code</th>
                    <th>Trainer</th>
                    <th>Timeline</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBatches.map((b, idx) => {
                    const rowNumber = (meta.page - 1) * meta.limit + idx + 1;
                    return (
                      <tr key={b.id}>
                        <td>{rowNumber}</td>
                        <td>
                          <div
                            style={{ fontWeight: 600, color: 'var(--interactive)', cursor: 'pointer' }}
                            onClick={() => navigate(`/admin/batches/${b.id}`)}
                            title="View Batch Details"
                          >
                            {b.name}
                          </div>
                          {b.description && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {b.description}
                            </div>
                          )}
                        </td>
                        <td>
                          <code style={{ background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
                            {b.code}
                          </code>
                        </td>
                        <td>
                          {b.trainer ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 500 }}>{b.trainer.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{b.trainer.email}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {b.startDate ? new Date(b.startDate).toLocaleDateString() : '—'} → {b.endDate ? new Date(b.endDate).toLocaleDateString() : '—'}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`admin-batches__badge admin-batches__badge--${b.status?.toLowerCase() || 'active'}`}
                            onClick={() => toggleStatus(b)}
                            style={{ cursor: 'pointer', border: 'none' }}
                            title="Click to toggle batch status"
                            aria-label={`Toggle status (currently ${b.status})`}
                          >
                            {b.status}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <TableActions
                            actions={[
                              {
                                label: 'View Students',
                                icon: Users,
                                onClick: () => navigate(`/admin/batches/${b.id}/students`),
                              },
                              b.trainer
                                ? {
                                    label: 'Remove Trainer',
                                    icon: Award,
                                    onClick: () => confirmRemoveTrainer(b),
                                  }
                                : {
                                    label: 'Assign Trainer',
                                    icon: Award,
                                    onClick: () => openAssignTrainer(b),
                                  },
                              {
                                label: 'Edit Batch',
                                icon: Pencil,
                                onClick: () => openEdit(b),
                              },
                              {
                                label: 'Delete',
                                icon: Trash2,
                                onClick: () => confirmDelete(b.id, b.name),
                                variant: 'danger',
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Showing {(meta.page - 1) * meta.limit + 1} to {Math.min(meta.page * meta.limit, filteredBatches.length)} of {filteredBatches.length} batches
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={meta.page <= 1}
                    onClick={() => setMeta(prev => ({ ...prev, page: prev.page - 1 }))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={meta.page >= totalPages}
                    onClick={() => setMeta(prev => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>
                {editing ? 'Edit Batch' : 'Create New Batch'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="admin-batches__form-row">
                <div className="admin-batches__form-group">
                  <label htmlFor="name">Batch Name *</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Full Stack 2026"
                    required
                  />
                </div>
                <div className="admin-batches__form-group">
                  <label htmlFor="code">Batch Code *</label>
                  <input
                    id="code"
                    name="code"
                    type="text"
                    value={form.code}
                    onChange={handleChange}
                    placeholder="e.g. FS-2026-A"
                    required
                  />
                </div>
              </div>

              <div className="admin-batches__form-row">
                <div className="admin-batches__form-group">
                  <label htmlFor="trainer">Assigned Trainer</label>
                  <select
                    id="trainer"
                    name="trainer"
                    value={form.trainer}
                    onChange={handleChange}
                  >
                    <option value="">No trainer assigned</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-batches__form-group">
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>

              <div className="admin-batches__form-row">
                <div className="admin-batches__form-group">
                  <label htmlFor="startDate">Start Date</label>
                  <input
                    id="startDate"
                    name="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={handleChange}
                  />
                </div>
                <div className="admin-batches__form-group">
                  <label htmlFor="endDate">End Date</label>
                  <input
                    id="endDate"
                    name="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="admin-batches__form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Optional batch description or curriculum notes..."
                />
              </div>

              <div className="admin-batches__modal-actions">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Batch'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Trainer Modal */}
      {assignModalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setAssignModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()} style={{ width: '480px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Assign Trainer</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Select an instructional lead for <strong>{assignBatch?.name}</strong>.
            </p>

            <form onSubmit={handleAssignSubmit}>
              <div className="admin-batches__form-group">
                <label htmlFor="assignTrainer">Trainer</label>
                <select
                  id="assignTrainer"
                  value={assignTrainer}
                  onChange={(e) => setAssignTrainer(e.target.value)}
                >
                  <option value="">No trainer assigned</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-batches__modal-actions">
                <Button type="button" variant="secondary" onClick={() => setAssignModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Assigning...' : 'Confirm Assignment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setDeleteModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()} style={{ width: '440px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-danger)' }}>
              Delete Batch
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Are you sure you want to delete <strong>{deleteBatchName}</strong>? This action cannot be undone.
            </p>
            <div className="admin-batches__modal-actions" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
              <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete Batch
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Trainer Confirmation Modal */}
      {removeTrainerModalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setRemoveTrainerModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()} style={{ width: '440px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              Remove Trainer
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Are you sure you want to remove the assigned trainer from <strong>{batchToRemoveTrainer?.name}</strong>?
            </p>
            <div className="admin-batches__modal-actions" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
              <button
                type="button"
                className="admin-batches__btn-danger-gradient"
                onClick={() => setRemoveTrainerModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-batches__btn-success-gradient"
                onClick={handleRemoveTrainer}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Toggle Confirmation Modal */}
      {toggleId && (
        <div className="admin-batches__modal-overlay" onClick={() => setToggleId(null)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()} style={{ width: '440px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
              Confirm Status Change
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Are you sure you want to change status of <strong>{toggleName}</strong> to <strong>{toggleTargetStatus}</strong>?
            </p>
            <div className="admin-batches__modal-actions" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
              <button
                type="button"
                className="admin-batches__btn-danger-gradient"
                onClick={() => setToggleId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-batches__btn-success-gradient"
                onClick={confirmToggleStatus}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
