import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getBatch, getTrainers, updateBatch, deleteBatch, getBatchStudents } from '../../api/admin';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Toast from '../../components/ui/Toast';
import { Users, BookOpen, Calendar, Award, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import '../../styles/pages/admin-batches.css';

/**
 * Admin - Batch Details Page (Apple iOS Enterprise SaaS Redesign)
 */
export default function AdminBatchDetails() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batch, setBatch] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [studentsCount, setStudentsCount] = useState(0);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTrainerId, setAssignTrainerId] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    trainer: '',
    status: 'ACTIVE',
    startDate: '',
    endDate: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchRes, trainersRes, studentsRes] = await Promise.all([
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
      setStudentsCount((studentsRes.data?.data || []).length);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load batch details');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (batchId) {
      fetchData();
    }
  }, [batchId, fetchData]);

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

  if (loading) {
    return (
      <div className="admin-batches" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="admin-batches">
        <div className="admin-batches__error">
          <h3>Batch Not Found</h3>
          <p>{error || 'The requested batch could not be found.'}</p>
          <Button onClick={() => navigate('/admin/batches')}>Back to Batches</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-batches">
      {/* Back Link */}
      <div style={{ marginBottom: '-12px' }}>
        <Link
          to="/admin/batches"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} /> Back to Batches
        </Link>
      </div>

      {/* Header */}
      <div className="admin-batches__header">
        <div>
          <div className="admin-batches__eyebrow">Batch Administration</div>
          <h1>{batch.name}</h1>
          <p>Code: <code>{batch.code}</code> — {batch.description || 'No description provided.'}</p>
        </div>
        <div className="admin-batches__actions">
          <Button variant="secondary" onClick={openEdit}>
            <Pencil size={16} style={{ marginRight: '6px' }} /> Edit Batch
          </Button>
          <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
            <Trash2 size={16} style={{ marginRight: '6px' }} /> Delete
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-batches__kpi">
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Enrolled Students</span>
          <span className="admin-batches__kpi-value">{studentsCount}</span>
          <span className="admin-batches__kpi-meta">Active roster count</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Status</span>
          <span className="admin-batches__kpi-value" style={{ fontSize: '24px' }}>
            <Badge variant={batch.status === 'ACTIVE' ? 'success' : batch.status === 'COMPLETED' ? 'info' : 'default'}>
              {batch.status}
            </Badge>
          </span>
          <span className="admin-batches__kpi-meta">Cohort state</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Timeline</span>
          <span className="admin-batches__kpi-value" style={{ fontSize: '16px', fontWeight: 600 }}>
            {batch.startDate ? new Date(batch.startDate).toLocaleDateString() : '—'} → {batch.endDate ? new Date(batch.endDate).toLocaleDateString() : '—'}
          </span>
          <span className="admin-batches__kpi-meta">Academic schedule</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Assigned Trainer</span>
          <span className="admin-batches__kpi-value" style={{ fontSize: '16px', fontWeight: 600 }}>
            {batch.trainer ? batch.trainer.name : 'Unassigned'}
          </span>
          <span className="admin-batches__kpi-meta">
            {batch.trainer ? batch.trainer.email : <a href="#assign" onClick={(e) => { e.preventDefault(); setAssignTrainerId(''); setAssignModalOpen(true); }} style={{ color: 'var(--interactive)' }}>Assign Trainer</a>}
          </span>
        </div>
      </div>

      {/* Gateway Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div className="admin-batches__kpi-card" style={{ padding: '24px', cursor: 'pointer' }} onClick={() => navigate(`/admin/batches/${batchId}/students`)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.1)', color: 'var(--interactive)' }}>
                <Users size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Student Enrollment</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Manage enrolled students, bulk add, status updates</p>
              </div>
            </div>
            <Badge variant="info">{studentsCount} Enrolled</Badge>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <Button size="sm">Manage Students &rarr;</Button>
          </div>
        </div>

        <div className="admin-batches__kpi-card" style={{ padding: '24px', cursor: 'pointer' }} onClick={() => {
          setAssignTrainerId(batch.trainer?.id || '');
          setAssignModalOpen(true);
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success, #10b981)' }}>
                <Award size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Trainer Assignment</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Assign or change instructional lead for this batch</p>
              </div>
            </div>
            <Badge variant={batch.trainer ? 'success' : 'warning'}>{batch.trainer ? 'Assigned' : 'Unassigned'}</Badge>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <Button size="sm" variant="secondary">{batch.trainer ? 'Change Trainer' : 'Assign Trainer'}</Button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editModalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Edit Batch</h2>
              <button onClick={() => setEditModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="admin-batches__form-row">
                <div className="admin-batches__form-group">
                  <label htmlFor="edit-name">Batch Name *</label>
                  <input id="edit-name" name="name" type="text" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} required />
                </div>
                <div className="admin-batches__form-group">
                  <label htmlFor="edit-code">Batch Code *</label>
                  <input id="edit-code" name="code" type="text" value={form.code} onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value }))} required />
                </div>
              </div>
              <div className="admin-batches__form-row">
                <div className="admin-batches__form-group">
                  <label htmlFor="edit-trainer">Assigned Trainer</label>
                  <select id="edit-trainer" name="trainer" value={form.trainer} onChange={(e) => setForm(prev => ({ ...prev, trainer: e.target.value }))}>
                    <option value="">No trainer assigned</option>
                    {trainers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                    ))}
                  </select>
                </div>
                <div className="admin-batches__form-group">
                  <label htmlFor="edit-status">Status</label>
                  <select id="edit-status" name="status" value={form.status} onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>
              <div className="admin-batches__form-row">
                <div className="admin-batches__form-group">
                  <label htmlFor="edit-startDate">Start Date</label>
                  <input id="edit-startDate" name="startDate" type="date" value={form.startDate} onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))} />
                </div>
                <div className="admin-batches__form-group">
                  <label htmlFor="edit-endDate">End Date</label>
                  <input id="edit-endDate" name="endDate" type="date" value={form.endDate} onChange={(e) => setForm(prev => ({ ...prev, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="admin-batches__form-group">
                <label htmlFor="edit-description">Description</label>
                <textarea id="edit-description" name="description" rows={3} value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="admin-batches__modal-actions">
                <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Trainer Modal */}
      {assignModalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setAssignModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()} style={{ width: '460px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Assign Trainer</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Select an instructional lead for <strong>{batch.name}</strong>.
            </p>
            <form onSubmit={handleAssignSubmit}>
              <div className="admin-batches__form-group">
                <label htmlFor="assignTrainer">Trainer</label>
                <select id="assignTrainer" value={assignTrainerId} onChange={(e) => setAssignTrainerId(e.target.value)}>
                  <option value="">No trainer assigned</option>
                  {trainers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                  ))}
                </select>
              </div>
              <div className="admin-batches__modal-actions">
                <Button type="button" variant="secondary" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Assigning...' : 'Confirm Assignment'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setDeleteModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()} style={{ width: '420px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-danger)' }}>Delete Batch</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Are you sure you want to delete <strong>{batch.name}</strong>? This action cannot be undone.
            </p>
            <div className="admin-batches__modal-actions" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
              <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete Batch</Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
