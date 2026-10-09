import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Pencil, Trash2, Plus, Users, Award, BookOpen, AlertCircle, Search } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import TableActions from '../../components/ui/table/TableActions';
import Toast from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import { getBatches, createBatch, updateBatch, deleteBatch, getTrainers } from '../../api/admin';
import '../../styles/pages/admin.css';
import '../../styles/pages/admin-dashboard.css';
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
    <div className="admin-page">
      <PageHeader
        title="Batches"
        description="Organize academic batches, assign trainers, and manage timelines."
        breadcrumb={
          <>
            <Link to="/admin" className="admin-breadcrumb__item">Home</Link>
            <span className="admin-breadcrumb__separator">/</span>
            <span className="admin-breadcrumb__current" aria-current="page">Batches</span>
          </>
        }
        actions={<Button onClick={openCreate}><Plus size={16} /> Create Batch</Button>}
      />

      {/* KPI Summary Cards */}
      <div className="admin-dashboard__kpi-grid">
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Total Batches</span>
            <div className="admin-dashboard__stat-icon">{totalBatchesCount}</div>
          </div>
          <div className="admin-dashboard__stat-value">{totalBatchesCount}</div>
          <div className="admin-dashboard__stat-meta">All batches</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Active</span>
            <div className="admin-dashboard__stat-icon">{activeBatchesCount}</div>
          </div>
          <div className="admin-dashboard__stat-value">{activeBatchesCount}</div>
          <div className="admin-dashboard__stat-meta">Currently active</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Completed</span>
            <div className="admin-dashboard__stat-icon">{completedBatchesCount}</div>
          </div>
          <div className="admin-dashboard__stat-value">{completedBatchesCount}</div>
          <div className="admin-dashboard__stat-meta">Finished batches</div>
        </div>
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Assigned Trainers</span>
            <div className="admin-dashboard__stat-icon">{assignedTrainersCount}</div>
          </div>
          <div className="admin-dashboard__stat-value">{assignedTrainersCount}</div>
          <div className="admin-dashboard__stat-meta">Unique trainers</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            placeholder="Search batches by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="admin-input admin-input--with-icon"
          />
        </div>

        <select
          className="admin-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="COMPLETED">Completed</option>
        </select>

        {(searchTerm || statusFilter !== 'ALL') && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('ALL');
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {/* Content Area */}
      {loading && <Spinner />}
      {error && (
        <div className="admin-card admin-card-centered">
          <AlertCircle size={40} style={{ color: 'var(--admin-danger-text)', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>{error}</h3>
          <Button variant="secondary" size="sm" onClick={fetchBatches}>Retry</Button>
        </div>
      )}

      {!loading && !error && (
        <div className="admin-card">
          {paginatedBatches.length === 0 ? (
            <div className="admin-card admin-card-empty">
              <BookOpen size={40} style={{ color: 'var(--admin-text-muted)', marginBottom: '16px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--admin-text-primary)' }}>No batches found</h3>
              <p style={{ fontSize: '14px', color: 'var(--admin-text-secondary)', marginBottom: '20px' }}>No batches match your search criteria or none have been created yet.</p>
              <Button onClick={openCreate}>Create First Batch</Button>
            </div>
          ) : (
            <>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th >#</th>
                    <th >Batch Name</th>
                    <th >Code</th>
                    <th >Trainer</th>
                    <th >Timeline</th>
                    <th >Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBatches.map((b, idx) => {
                    const rowNumber = (meta.page - 1) * meta.limit + idx + 1;
                    return (
                      <tr key={b.id} >
                        <td >{rowNumber}</td>
                        <td >
                          <div
                            onClick={() => navigate(`/admin/batches/${b.id}`)}
                            title="View Batch Details"
                          >
                            {b.name}
                          </div>
                          {b.description && (
                            <div className="admin-text-ellipsis">
                              {b.description}
                            </div>
                          )}
                        </td>
                        <td >
                          <code style={{ background: 'var(--admin-bg-subtle)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
                            {b.code}
                          </code>
                        </td>
                        <td >
                          {b.trainer ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 500 }}>{b.trainer.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--admin-text-muted)' }}>{b.trainer.email}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--admin-text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                          )}
                        </td>
                        <td >
                          <div className="admin-timeline">
                            {b.startDate ? new Date(b.startDate).toLocaleDateString() : '—'} → {b.endDate ? new Date(b.endDate).toLocaleDateString() : '—'}
                          </div>
                        </td>
                        <td >
                          <button
                            type="button"
                            className={`admin-badge admin-badge--${b.status.toLowerCase()}`}
                            onClick={() => toggleStatus(b)}
                            title="Click to toggle batch status"
                            aria-label={`Toggle status (currently ${b.status})`}
                          >
                            {b.status}
                          </button>
                        </td>
                        <td>
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
                                    onClick: () => openRemoveTrainer(b),
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
              <div className="admin-pagination">
                <div>
                  Showing {(meta.page - 1) * meta.limit + 1} to {Math.min(meta.page * meta.limit, filteredBatches.length)} of {filteredBatches.length} batches
                </div>
                <div className="admin-pagination-controls">
                  <button
                    className="admin-page-btn"
                    disabled={meta.page <= 1}
                    onClick={() => setMeta(prev => ({ ...prev, page: prev.page - 1 }))}
                  >
                    Previous
                  </button>
                  <button
                    className="admin-page-btn"
                    disabled={meta.page >= totalPages}
                    onClick={() => setMeta(prev => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editing ? 'Edit Batch' : 'Create New Batch'}
        >
          <div className="admin-modal__body">
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label htmlFor="name" className="admin-form-label">
                    Batch Name *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Full Stack 2026"
                    className="admin-input"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="code" className="admin-form-label">
                    Batch Code *
                  </label>
                  <input
                    id="code"
                    name="code"
                    type="text"
                    value={form.code}
                    onChange={handleChange}
                    placeholder="e.g. FS-2026-A"
                    className="admin-input"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label htmlFor="trainer" className="admin-form-label">
                    Assigned Trainer
                  </label>
                  <select
                    id="trainer"
                    name="trainer"
                    value={form.trainer}
                    onChange={handleChange}
                    className="admin-select"
                  >
                    <option value="">No trainer assigned</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="status" className="admin-form-label">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="admin-select"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label htmlFor="startDate" className="admin-form-label">
                    Start Date
                  </label>
                  <input
                    id="startDate"
                    name="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={handleChange}
                    className="admin-input"
                  />
                </div>
                <div>
                  <label htmlFor="endDate" className="admin-form-label">
                    End Date
                  </label>
                  <input
                    id="endDate"
                    name="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={handleChange}
                    className="admin-input"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="description" className="admin-form-label">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Optional batch description or curriculum notes..."
                  className="admin-input"
                  style={{ resize: 'vertical', minHeight: '80px' }}
                />
              </div>
            </form>
          </div>
          <div className="admin-modal__footer">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Batch'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Assign Trainer Modal */}
      {assignModalOpen && (
        <Modal
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          title="Assign Trainer"
        >
          <div className="admin-modal__body">
            <p style={{ fontSize: '14px', color: 'var(--admin-text-secondary)', marginBottom: '20px' }}>
              Select an instructional lead for <strong>{assignBatch?.name}</strong>.
            </p>
            <form onSubmit={handleAssignSubmit} id="assign-trainer-form">
              <div>
                <label htmlFor="assignTrainer" className="admin-form-label">
                  Trainer
                </label>
                <select
                  id="assignTrainer"
                  value={assignTrainer}
                  onChange={(e) => setAssignTrainer(e.target.value)}
                  className="admin-select"
                >
                  <option value="">No trainer assigned</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>
            </form>
          </div>
          <div className="admin-modal__footer">
            <Button variant="secondary" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="assign-trainer-form" disabled={submitting}>
              {submitting ? 'Assigning...' : 'Confirm Assignment'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Delete Batch"
        >
          <div className="admin-modal__body">
            <p style={{ fontSize: '14px', color: 'var(--admin-text-secondary)' }}>
              Are you sure you want to delete <strong>{deleteBatchName}</strong>? This action cannot be undone.
            </p>
          </div>
          <div className="admin-modal__footer">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </Modal>
      )}

      {/* Remove Trainer Confirmation Modal */}
      {removeTrainerModalOpen && (
        <Modal
          isOpen={removeTrainerModalOpen}
          onClose={() => setRemoveTrainerModalOpen(false)}
          title="Remove Trainer"
        >
          <div className="admin-modal__body">
            <p style={{ fontSize: '14px', color: 'var(--admin-text-secondary)' }}>
              Are you sure you want to remove the assigned trainer from <strong>{batchToRemoveTrainer?.name}</strong>?
            </p>
          </div>
          <div className="admin-modal__footer">
            <Button variant="secondary" onClick={() => setRemoveTrainerModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRemoveTrainer}>
              Confirm
            </Button>
          </div>
        </Modal>
      )}

      {/* Status Toggle Confirmation Modal */}
      {toggleId && (
        <Modal
          isOpen={toggleId !== null}
          onClose={() => setToggleId(null)}
          title="Confirm Status Change"
        >
          <div className="admin-modal__body">
            <p style={{ fontSize: '14px', color: 'var(--admin-text-secondary)' }}>
              Are you sure you want to change status of <strong>{toggleName}</strong> to <strong>{toggleTargetStatus}</strong>?
            </p>
          </div>
          <div className="admin-modal__footer">
            <Button variant="secondary" onClick={() => setToggleId(null)}>
              Cancel
            </Button>
            <Button onClick={confirmToggleStatus}>
              Confirm
            </Button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}