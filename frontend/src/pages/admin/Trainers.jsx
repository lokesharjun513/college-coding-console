import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Pencil, Trash2, Users, UserCheck, UserRound, Search, UserPlus, Layers, Download, Upload } from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import TableActions from '../../components/ui/table/TableActions';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import {
  getTrainers,
  createTrainer,
  updateTrainer,
  deleteTrainer,
  deleteTrainerForce,
  getTrainerAssignments,
  removeTrainerFromBatch,
  bulkUploadTrainers,
  downloadTrainerTemplate,
  getBatches,
  updateBatch,
} from '../../api/admin';
import '../../styles/pages/admin.css';
import '../../styles/pages/admin-trainers.css';

/**
 * Admin Trainers page – Apple-inspired enterprise management console.
 */
export default function Trainers() {
  const navigate = useNavigate();
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', trainerId: '', status: 'ACTIVE' });
  const [formErrors, setFormErrors] = useState({});

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState(null);

  // Status toggle confirmation modal
  const [toggleId, setToggleId] = useState(null);
  const [toggleName, setToggleName] = useState('');
  const [toggleTargetStatus, setToggleTargetStatus] = useState(null);

  // Unassign confirmation modal
  const [unassignModalOpen, setUnassignModalOpen] = useState(false);
  const [trainerToUnassign, setTrainerToUnassign] = useState(null);
  const [batchToUnassign, setBatchToUnassign] = useState(null);

  // Assign confirmation modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [trainerToAssign, setTrainerToAssign] = useState(null);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [assignStep, setAssignStep] = useState('select');

  const fileInputRef = useRef(null);

  // Search / filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination meta
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  const fetchTrainers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: meta.page, limit: meta.limit };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await getTrainers(params);
      setTrainers(res.data?.data || []);
      setMeta(res.data?.meta || { page: meta.page, limit: meta.limit, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load trainers');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, meta.page, meta.limit]);

  useEffect(() => { fetchTrainers(); }, [fetchTrainers]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await downloadTrainerTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'trainer_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Template downloaded successfully');
    } catch (err) {
      showToast('Failed to download template', 'error');
    }
  };

  const handleBulkUpload = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      const parsedTrainers = lines.slice(1).map(line => {
        const [name, email, trainerId] = line.split(',');
        return { name: name?.trim(), email: email?.trim(), trainerId: trainerId?.trim() };
      }).filter(t => t.name && t.email && t.trainerId);
      try {
        await bulkUploadTrainers({ trainers: parsedTrainers });
        showToast('Trainers uploaded successfully');
        await fetchTrainers();
      } catch (err) {
        showToast(err?.response?.data?.message || 'Bulk upload failed', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getInitials = (name) => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Filtered rows
  const filtered = trainers.filter(t => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      t.name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.id?.toLowerCase().includes(q);
    const matchesStatus = !statusFilter || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // KPI stats
  const totalCount = meta.total || trainers.length;
  const activeCount = trainers.filter(t => t.status === 'ACTIVE').length;
  const inactiveCount = trainers.filter(t => t.status !== 'ACTIVE').length;

  const columns = [
    { key: 'trainer', header: 'TRAINER' },
    { key: 'email', header: 'EMAIL' },
    { key: 'status', header: 'STATUS', align: 'center' },
    { key: 'assignedBatches', header: 'ASSIGNED BATCHES', align: 'center' },
    { key: 'actions', header: 'ACTIONS', align: 'center' },
  ];

  const rows = filtered.map(t => ({
    ...t,
    trainer: (
      <div className="admin-trainers__user-cell">
        <div className="admin-trainers__avatar admin-trainers__avatar--trainer">
          {getInitials(t.name)}
        </div>
        <div>
          <div className="admin-trainers__user-name">{t.name}</div>
          <div className="admin-trainers__user-id">{t.trainerId}</div>
        </div>
      </div>
    ),
    email: t.email,
    status: (
      <button
        type="button"
        className={`admin-badge admin-badge--${t.status?.toLowerCase() || 'active'}`}
        onClick={() => toggleStatus(t)}
        style={{ cursor: 'pointer', border: 'none' }}
        title="Click to toggle status"
      >
        {t.status || 'ACTIVE'}
      </button>
    ),
    assignedBatches: t.assignedBatches && t.assignedBatches.length > 0 ? (
      <div className="admin-trainers__batches">
        {t.assignedBatches.slice(0, 3).map(b => (
          <button
            key={b.id}
            type="button"
            className="admin-trainers__batch-chip"
            onClick={() => {
              setTrainerToUnassign(t);
              setBatchToUnassign(b);
              setUnassignModalOpen(true);
            }}
            title={`Click to unassign from ${b.name}`}
          >
            <Layers size={12} className="admin-trainers__batch-chip-icon" />
            <span className="admin-trainers__batch-chip-name">{b.name}</span>
          </button>
        ))}
        {t.assignedBatches.length > 3 && (
          <span className="admin-trainers__batch-more">+{t.assignedBatches.length - 3}</span>
        )}
      </div>
    ) : (
      <Button variant="ghost" size="sm" onClick={() => openAssign(t)} className="admin-trainers__assign-btn">
        + Assign
      </Button>
    ),
    actions: (
      <TableActions
        actions={[
          {
            label: `Edit ${t.name}`,
            icon: Pencil,
            onClick: () => openEdit(t),
          },
          {
            label: `Delete ${t.name}`,
            icon: Trash2,
            onClick: () => confirmDelete(t.id),
            variant: 'danger',
          },
        ]}
      />
    ),
  }));

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Invalid email address';
    }
    if (!editing) {
      if (!form.trainerId?.trim()) {
        errs.trainerId = 'Trainer ID is required';
      } else if (!/^T[0-9]{3,6}$/.test(form.trainerId.trim())) {
        errs.trainerId = 'Trainer ID must be T followed by 3-6 digits';
      }
    }
    return errs;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setFormErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const openCreate = () => {
    setForm({ name: '', email: '', trainerId: '', status: 'ACTIVE' });
    setFormErrors({});
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (trainer) => {
    setForm({ name: trainer.name || '', email: trainer.email || '', status: trainer.status || 'ACTIVE' });
    setFormErrors({});
    setEditing(trainer);
    setModalOpen(true);
  };

  const openAssign = async (trainer) => {
    setTrainerToAssign(trainer);
    setSelectedBatchId('');
    setAssignStep('select');
    try {
      const res = await getBatches();
      setAvailableBatches(res.data?.data || []);
      setAssignModalOpen(true);
    } catch (err) {
      showToast('Failed to load batches', 'error');
    }
  };

  const handleAssignContinue = () => {
    if (!selectedBatchId) return;
    setAssignStep('confirm');
  };

  const handleAssignConfirmFinal = async () => {
    try {
      await updateBatch(selectedBatchId, { trainer: trainerToAssign.id });
      showToast('Trainer assigned to batch successfully');
      setAssignModalOpen(false);
      await fetchTrainers();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to assign trainer', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSubmitting(true);
    try {
      const payload = editing
        ? { name: form.name, email: form.email, status: form.status }
        : { name: form.name, email: form.email, trainerId: form.trainerId };
      if (editing) {
        await updateTrainer(editing.id, payload);
        showToast('Trainer updated successfully');
      } else {
        await createTrainer(payload);
        showToast('Trainer created successfully');
      }
      setModalOpen(false);
      await fetchTrainers();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Operation failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (trainer) => {
    setToggleId(trainer.id);
    setToggleName(trainer.name);
    setToggleTargetStatus(trainer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
  };

  const confirmToggleStatus = async () => {
    if (!toggleId) return;
    try {
      await updateTrainer(toggleId, { status: toggleTargetStatus });
      showToast(`Trainer ${toggleTargetStatus.toLowerCase()} successfully`);
      setToggleId(null);
      await fetchTrainers();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update status', 'error');
    }
  };

  const confirmDelete = async (id) => {
    setDeleteId(id);
    try {
      const res = await getTrainerAssignments(id);
      if (res.data.hasAssignedBatches) {
        setDeleteInfo(res.data);
      } else {
        setDeleteInfo(null);
      }
    } catch (err) {
      showToast('Failed to check assignments', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteTrainer(deleteId);
      showToast('Trainer deleted successfully');
      setDeleteId(null);
      setDeleteInfo(null);
      await fetchTrainers();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleForceDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteTrainerForce(deleteId);
      showToast('Trainer deleted successfully');
      setDeleteId(null);
      setDeleteInfo(null);
      await fetchTrainers();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Force delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleRemoveFromBatch = async (batchId) => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await removeTrainerFromBatch(batchId);
      showToast('Trainer removed from batch successfully');
      const res = await getTrainerAssignments(deleteId);
      if (res.data?.hasAssignedBatches) {
        setDeleteInfo(res.data);
      } else {
        setDeleteInfo(null);
      }
      await fetchTrainers();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to remove trainer from batch', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleUnassignConfirm = async () => {
    if (!batchToUnassign) return;
    try {
      await removeTrainerFromBatch(batchToUnassign.id);
      showToast(`Trainer unassigned from ${batchToUnassign.name} successfully`);
      setUnassignModalOpen(false);
      setTrainerToUnassign(null);
      setBatchToUnassign(null);
      await fetchTrainers();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to unassign trainer', 'error');
    }
  };

  const clearFilters = () => { setSearch(''); setStatusFilter(''); };

  return (
    <div className="admin-trainers">
      <div className="admin-trainers__page-header">
        <nav className="admin-breadcrumb" aria-label="Breadcrumb">
          <Link to="/admin" className="admin-breadcrumb__item">Home</Link>
          <span className="admin-breadcrumb__separator">/</span>
          <span className="admin-breadcrumb__current" aria-current="page">Trainers</span>
        </nav>
        <div className="admin-trainers__header">
          <div>
            <h1 className="admin-trainers__title">Trainers</h1>
            <p className="admin-trainers__description">
              Manage trainer accounts, access privileges and platform responsibilities.
            </p>
          </div>
          <div className="admin-trainers__header-actions">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="admin-trainers__hidden-input" />
            <Button onClick={handleDownloadTemplate} variant="secondary"><Download size={16} />Template</Button>
            <Button onClick={handleBulkUpload} variant="secondary"><Upload size={16} />Bulk Upload</Button>
            <Button onClick={openCreate} className="admin-trainers__add-btn">
              <UserPlus size={16} /> Add Trainer
            </Button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="admin-dashboard__kpi-grid">
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Total Trainers</span>
            <div className="admin-dashboard__stat-icon"><Users size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{totalCount}</div>
          <div className="admin-dashboard__stat-meta">All registered trainers</div>
        </div>

        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Active Trainers</span>
            <div className="admin-dashboard__stat-icon"><UserCheck size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{activeCount}</div>
          <div className="admin-dashboard__stat-meta">Currently active trainers</div>
        </div>

        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Inactive Trainers</span>
            <div className="admin-dashboard__stat-icon"><UserRound size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{inactiveCount}</div>
          <div className="admin-dashboard__stat-meta">Disabled or inactive trainers</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="admin-trainers__toolbar">
        <div className="admin-trainers__search-wrapper">
          <Search className="admin-trainers__search-icon" size={16} />
          <input
            type="text"
            placeholder="Search trainers by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="admin-trainers__search"
            aria-label="Search trainers"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="admin-trainers__select"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {(search || statusFilter) && (
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear Filters
          </Button>
        )}
      </div>

      {loading && (
        <div className="admin-trainers__skeleton">
          <Skeleton width="100%" height="40px" />
          <Skeleton width="100%" height="40px" />
          <Skeleton width="100%" height="40px" />
        </div>
      )}
      {error && (
        <div className="admin-trainers__error" role="alert">
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={fetchTrainers} className="admin-trainers__retry-btn">
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && (
        <section className="admin-trainers__section">
          <Card elevation="card" className="admin-trainers__card">
            {rows.length === 0 ? (
              <EmptyState
                message={search || statusFilter ? 'No matching trainers' : 'No trainers found'}
                actionLabel={!search && !statusFilter ? 'Add Trainer' : 'Clear Filters'}
                onAction={!search && !statusFilter ? openCreate : clearFilters}
              />
            ) : (
               <DataTable
                 columns={columns}
                 data={rows}
                 loading={false}
                 error={null}
                 emptyMessage="No trainers available."
                 showSNo={true}
                 currentPage={meta.page}
                 pageSize={meta.limit}
                 className="admin-table"
               />
            )}
          </Card>

          {/* Pagination */}
          <div className="admin-trainers__pagination">
            <div>
              Page {meta.page} of {meta.totalPages || 1}
            </div>
            <div className="admin-trainers__pagination-controls">
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
                disabled={meta.page >= meta.totalPages}
                onClick={() => setMeta(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Create / Edit Modal */}
<Modal isOpen={modalOpen} onClose={() => !submitting && setModalOpen(false)} title={editing ? 'Edit Trainer' : 'Create Trainer'}>
         <div className="admin-modal__body">
           <form onSubmit={handleSubmit} noValidate>
             <div className="admin-trainers__form-group">
               <label htmlFor="name" className="admin-trainers__form-label">Full Name</label>
               <input
                 id="name"
                 name="name"
                 type="text"
                 value={form.name}
                 onChange={handleChange}
                 required
                 className={`admin-trainers__form-input ${formErrors.name ? 'error' : ''}`}
               />
               {formErrors.name && <span className="admin-trainers__field-error">{formErrors.name}</span>}
             </div>

             <div className="admin-trainers__form-group">
               <label htmlFor="email" className="admin-trainers__form-label">Email Address</label>
               <input
                 id="email"
                 name="email"
                 type="email"
                 value={form.email}
                 onChange={handleChange}
                 required
                 className={`admin-trainers__form-input ${formErrors.email ? 'error' : ''}`}
               />
               {formErrors.email && <span className="admin-trainers__field-error">{formErrors.email}</span>}
             </div>

             {!editing && (
               <div className="admin-trainers__form-group">
                 <label htmlFor="trainerId" className="admin-trainers__form-label">Trainer ID (e.g., T001)</label>
                 <input
                   id="trainerId"
                   name="trainerId"
                   type="text"
                   value={form.trainerId}
                   onChange={handleChange}
                   required
                   className={`admin-trainers__form-input ${formErrors.trainerId ? 'error' : ''}`}
                 />
                 {formErrors.trainerId && <span className="admin-trainers__field-error">{formErrors.trainerId}</span>}
               </div>
             )}

             {editing && (
               <div className="admin-trainers__form-group">
                 <label htmlFor="status" className="admin-trainers__form-label">Status</label>
                 <select
                   id="status"
                   name="status"
                   value={form.status}
                   onChange={handleChange}
                   className="admin-trainers__form-input"
                 >
                   <option value="ACTIVE">Active</option>
                   <option value="INACTIVE">Inactive</option>
                 </select>
               </div>
             )}

             <div className="admin-modal__footer">
               <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
               <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : (editing ? 'Save Changes' : 'Create Trainer')}</Button>
             </div>
           </form>
         </div>
       </Modal>

      {/* Status Toggle Confirmation Modal */}
<Modal isOpen={!!toggleId} onClose={() => setToggleId(null)} title="Confirm Status Change">
         <div className="admin-modal__body">
           <p className="admin-trainers__modal-text">
             Are you sure you want to change <strong>{toggleName}</strong> status to <strong>{toggleTargetStatus}</strong>?
           </p>
         </div>
         <div className="admin-modal__footer">
           <Button variant="secondary" onClick={() => setToggleId(null)}>Cancel</Button>
           <Button variant="primary" onClick={confirmToggleStatus}>Confirm</Button>
         </div>
       </Modal>

      {/* Unassign Confirmation Modal */}
<Modal isOpen={unassignModalOpen} onClose={() => setUnassignModalOpen(false)} title="Unassign Trainer from Batch">
         <div className="admin-modal__body">
           <p className="admin-trainers__modal-text">
             Do you want to remove/unassign <strong>{trainerToUnassign?.name}</strong> from <strong>{batchToUnassign?.name}</strong>?
           </p>
         </div>
         <div className="admin-modal__footer">
           <Button variant="secondary" onClick={() => setUnassignModalOpen(false)}>Cancel</Button>
           <Button variant="danger" onClick={handleUnassignConfirm}>Yes Continue</Button>
         </div>
       </Modal>

      {/* Assign Confirmation Modal */}
<Modal isOpen={assignModalOpen} onClose={() => { setAssignModalOpen(false); setAssignStep('select'); setSelectedBatchId(''); setTrainerToAssign(null); setAvailableBatches([]); }} title="Assign Trainer to Batch">
         {assignStep === 'select' && (
           <>
             <div className="admin-modal__body">
               <p className="admin-trainers__modal-text">Select a batch to assign <strong>{trainerToAssign?.name}</strong> to:</p>
               <div className="admin-trainers__batch-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                 <ul className="admin-trainers__batch-list">
                   {availableBatches.map(b => (
                     <li key={b.id} className="admin-trainers__batch-item">
                       <button
                         type="button"
                         className="admin-trainers__batch-chip"
                         onClick={() => setSelectedBatchId(b.id)}
                         style={{ background: selectedBatchId === b.id ? 'rgba(0, 122, 255, 0.1)' : undefined }}
                       >
                         <Layers size={12} className="admin-trainers__batch-chip-icon" />
                         <span className="admin-trainers__batch-chip-name">{b.name}</span>
                       </button>
                     </li>
                   ))}
                 </ul>
               </div>
               <div className="admin-modal__footer">
                 <Button variant="secondary" onClick={() => { setAssignModalOpen(false); setAssignStep('select'); setSelectedBatchId(''); setTrainerToAssign(null); setAvailableBatches([]); }}>Cancel</Button>
                 <Button variant="primary" onClick={handleAssignContinue} disabled={!selectedBatchId}>Yes, Continue</Button>
               </div>
             </div>
           </>
         )}
         {assignStep === 'confirm' && (
           <div>
             <div className="admin-modal__body">
               <p className="admin-trainers__modal-text">
                 Assign <strong>{trainerToAssign?.name}</strong> to batch <strong>{availableBatches.find(b => b.id === selectedBatchId)?.name}</strong>?
               </p>
             </div>
             <div className="admin-modal__footer">
               <Button variant="secondary" onClick={() => setAssignStep('select')}>Back</Button>
               <Button variant="primary" onClick={handleAssignConfirmFinal}>Yes, Continue</Button>
             </div>
           </div>
         )}
       </Modal>

      {/* Delete Confirmation Modal */}
<Modal isOpen={!!deleteId} onClose={() => { setDeleteId(null); setDeleteInfo(null); }} title="Delete Trainer">
         {deleteInfo && deleteInfo.hasAssignedBatches ? (
           <div>
             <div className="admin-modal__body">
               <p className="admin-trainers__modal-batch-info">
                 Trainer is currently assigned to <strong>{deleteInfo.assignedBatchCount || deleteInfo.batches?.length || 0}</strong> batch(es).
               </p>
               {deleteInfo.batches && deleteInfo.batches.length > 0 && (
                 <div className="admin-trainers__batch-wrapper">
                   <p className="admin-trainers__batch-label">Assigned Batches:</p>
                   <ul className="admin-trainers__batch-list">
                     {deleteInfo.batches.map(b => (
                       <li key={b.id} className="admin-trainers__batch-item">
                         <span><strong>{b.name}</strong> <small className="admin-trainers__batch-code">({b.code})</small></span>
                         <Button variant="secondary" size="sm" onClick={() => handleRemoveFromBatch(b.id)} disabled={deleting}>Remove from batch</Button>
                       </li>
                     ))}
                   </ul>
                 </div>
               )}
             </div>
             <div className="admin-modal__footer">
               <Button type="button" variant="secondary" onClick={() => { setDeleteId(null); setDeleteInfo(null); }} disabled={deleting}>Cancel</Button>
               <Button type="button" variant="danger" onClick={handleForceDelete} disabled={deleting}>
                 {deleting ? 'Force Deleting…' : 'Force Delete'}
               </Button>
             </div>
           </div>
         ) : (
           <div>
             <div className="admin-modal__body">
               <p className="admin-trainers__modal-text">
                 Are you sure you want to delete this trainer? This action is permanent and cannot be undone.
               </p>
             </div>
             <div className="admin-modal__footer">
               <Button type="button" variant="secondary" onClick={() => { setDeleteId(null); setDeleteInfo(null); }} disabled={deleting}>Cancel</Button>
               <Button type="button" variant="danger" onClick={handleDelete} disabled={deleting}>
                 {deleting ? 'Deleting…' : 'Delete Trainer'}
               </Button>
             </div>
           </div>
         )}
       </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
