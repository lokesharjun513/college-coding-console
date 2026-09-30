import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getBatch,
  getBatchStudents,
  getStudents,
  enrollStudent,
  deleteStudentEnrollment,
  updateStudentEnrollment,
} from '../../api/admin';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { Search, Plus, Trash2, Users, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import '../../styles/pages/admin-batches.css';

/**
 * Admin - Batch Students / Enrollment Management Page
 */
export default function AdminBatchStudentsList() {
  const { batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedEnrolledIds, setSelectedEnrolledIds] = useState([]);
  const [toast, setToast] = useState(null);

  // Add students modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [availableSearch, setAvailableSearch] = useState('');
  const [selectedAvailableIds, setSelectedAvailableIds] = useState([]);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollError, setEnrollError] = useState(null);

  // Remove confirm modal state
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removeStudentId, setRemoveStudentId] = useState(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchRes, enrolledRes, allStudentsRes] = await Promise.all([
        getBatch(batchId),
        getBatchStudents(batchId),
        getStudents(),
      ]);
      setBatch(batchRes.data?.data || null);
      setEnrolledStudents(enrolledRes.data?.data || []);
      setAllStudents((allStudentsRes.data?.data || []).map(s => ({ ...s, id: s._id || s.id })));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load enrollment data');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (batchId) {
      fetchData();
    }
  }, [batchId, fetchData]);

  // Filter enrolled students
  const filteredEnrolled = useMemo(() => {
    return enrolledStudents.filter((e) => {
      const s = e.student;
      const matchesSearch =
        s?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s?.rollNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' ? true : e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [enrolledStudents, searchTerm, statusFilter]);

  // Available students not already enrolled
  const enrolledStudentIds = useMemo(() => new Set(enrolledStudents.map(e => e.student?.id)), [enrolledStudents]);

  const availableStudents = useMemo(() => {
    return allStudents.filter((s) => {
      if (enrolledStudentIds.has(s.id)) return false;
      const matchesSearch =
        s.name?.toLowerCase().includes(availableSearch.toLowerCase()) ||
        s.email?.toLowerCase().includes(availableSearch.toLowerCase()) ||
        s.rollNumber?.toLowerCase().includes(availableSearch.toLowerCase());
      return matchesSearch && s.status === 'ACTIVE';
    });
  }, [allStudents, enrolledStudentIds, availableSearch]);

  const toggleSelectAllEnrolled = () => {
    if (selectedEnrolledIds.length === filteredEnrolled.length) {
      setSelectedEnrolledIds([]);
    } else {
      setSelectedEnrolledIds(filteredEnrolled.map(e => e.student?.id));
    }
  };

  const toggleSelectEnrolled = (id) => {
    setSelectedEnrolledIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleEnrollSubmit = async () => {
    if (selectedAvailableIds.length === 0) return;
    setEnrollSubmitting(true);
    setEnrollError(null);
    try {
      // Enroll each selected student sequentially or via Promise.all
      for (const studentId of selectedAvailableIds) {
        await enrollStudent(batchId, studentId);
      }
      setToast({ message: `Successfully enrolled ${selectedAvailableIds.length} student(s)`, type: 'success' });
      setSelectedAvailableIds('');
      setAddModalOpen(false);
      await fetchData();
    } catch (err) {
      setEnrollError(err?.response?.data?.message || 'Failed to enroll selected students');
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const handleRemoveSingle = (studentId) => {
    setRemoveStudentId(studentId);
    setRemoveModalOpen(true);
  };

  const handleRemoveBulk = () => {
    if (selectedEnrolledIds.length === 0) return;
    setRemoveStudentId(null); // null indicates bulk
    setRemoveModalOpen(true);
  };

  const confirmRemove = async () => {
    setRemoveSubmitting(true);
    try {
      if (removeStudentId) {
        await deleteStudentEnrollment(batchId, removeStudentId);
        setToast({ message: 'Student removed from batch successfully', type: 'success' });
      } else if (selectedEnrolledIds.length > 0) {
        for (const studentId of selectedEnrolledIds) {
          await deleteStudentEnrollment(batchId, studentId);
        }
        setToast({ message: `Successfully removed ${selectedEnrolledIds.length} student(s) from batch`, type: 'success' });
        setSelectedEnrolledIds([]);
      }
      setRemoveModalOpen(false);
      setRemoveStudentId(null);
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to remove student(s)', type: 'error' });
      setRemoveModalOpen(false);
    } finally {
      setRemoveSubmitting(false);
    }
  };

  const handleToggleStatus = async (studentId, currentStatus) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateStudentEnrollment(batchId, studentId, newStatus);
      setToast({ message: `Student enrollment status updated to ${newStatus}`, type: 'success' });
      await fetchData();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to update status', type: 'error' });
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
          <Button onClick={() => window.location.href = '/admin/batches'}>Back to Batches</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-batches">
      {/* Back Link */}
      <div style={{ marginBottom: '-12px' }}>
        <Link
          to={`/admin/batches/${batchId}`}
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
          <ArrowLeft size={16} /> Back to Batch Details
        </Link>
      </div>

      {/* Header */}
      <div className="admin-batches__header">
        <div>
          <div className="admin-batches__eyebrow">Student Enrollment Management</div>
          <h1>{batch.name} — Students</h1>
          <p>Manage enrolled students, enrollment status, and add new students to this batch.</p>
        </div>
        <div className="admin-batches__actions">
          {selectedEnrolledIds.length > 0 && (
            <Button variant="danger" onClick={handleRemoveBulk}>
              <Trash2 size={16} style={{ marginRight: '6px' }} /> Remove Selected ({selectedEnrolledIds.length})
            </Button>
          )}
          <Button onClick={() => { setAvailableSearch(''); setSelectedAvailableIds([]); setAddModalOpen(true); }}>
            <Plus size={16} style={{ marginRight: '6px' }} /> Add Students
          </Button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="admin-batches__kpi">
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Total Enrolled</span>
          <span className="admin-batches__kpi-value">{enrolledStudents.length}</span>
          <span className="admin-batches__kpi-meta">Active roster</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Active Enrollments</span>
          <span className="admin-batches__kpi-value" style={{ color: 'var(--color-success, #16a34a)' }}>
            {enrolledStudents.filter(e => e.status === 'ACTIVE').length}
          </span>
          <span className="admin-batches__kpi-meta">In good standing</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Inactive Enrollments</span>
          <span className="admin-batches__kpi-value" style={{ color: 'var(--text-muted)' }}>
            {enrolledStudents.filter(e => e.status !== 'ACTIVE').length}
          </span>
          <span className="admin-batches__kpi-meta">Paused/Inactive</span>
        </div>
        <div className="admin-batches__kpi-card">
          <span className="admin-batches__kpi-label">Batch Code</span>
          <span className="admin-batches__kpi-value" style={{ fontSize: '22px' }}><code>{batch.code}</code></span>
          <span className="admin-batches__kpi-meta">{batch.status}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="admin-batches__toolbar">
        <div className="admin-batches__toolbar-left">
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search enrolled students by name, email, roll no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="admin-batches__search"
              style={{ paddingLeft: '38px' }}
            />
          </div>

          <div className="admin-batches__toggle-group">
            {['ALL', 'ACTIVE', 'INACTIVE'].map((st) => (
              <button
                key={st}
                type="button"
                className={`admin-batches__toggle-btn ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st.charAt(0) + st.slice(1).toLowerCase()}
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

      {/* Table Content */}
      <div className="admin-batches__card">
        {filteredEnrolled.length === 0 ? (
          <div className="admin-batches__empty">
            <Users size={40} style={{ color: 'var(--text-muted)' }} />
            <h3>No enrolled students found</h3>
            <p>No students match your search criteria or no students have been enrolled in this batch yet.</p>
            <Button onClick={() => { setAvailableSearch(''); setSelectedAvailableIds([]); setAddModalOpen(true); }}>Add Students Now</Button>
          </div>
        ) : (
          <table className="admin-batches__table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={filteredEnrolled.length > 0 && selectedEnrolledIds.length === filteredEnrolled.length}
                    onChange={toggleSelectAllEnrolled}
                  />
                </th>
                <th>#</th>
                <th>Student</th>
                <th>Roll Number</th>
                <th>Email</th>
                <th>Department</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnrolled.map((enrollment, idx) => {
                const s = enrollment.student;
                const isSelected = selectedEnrolledIds.includes(s?.id);
                return (
                  <tr key={enrollment.id} style={{ backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'transparent' }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectEnrolled(s?.id)}
                      />
                    </td>
                    <td>{idx + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={s?.name || 'Student'} size={32} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s?.name || 'Unknown'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {s?.id?.slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td><code>{s?.rollNumber || '—'}</code></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s?.email || '—'}</td>
                    <td>{s?.department || '—'}</td>
                    <td>
                      <Badge variant={enrollment.status === 'ACTIVE' ? 'success' : 'default'}>
                        {enrollment.status}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleToggleStatus(s?.id, enrollment.status)}
                        >
                          {enrollment.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleRemoveSingle(s?.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Students Modal */}
      {addModalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()} style={{ width: '680px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Enroll Students</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Select active institution students not currently enrolled in {batch.name}.
                </p>
              </div>
              <button onClick={() => setAddModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Search available students by name, email, roll number..."
                value={availableSearch}
                onChange={(e) => setAvailableSearch(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-app)', color: 'var(--text-primary)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                {selectedAvailableIds.length} student(s) selected
              </span>
              {availableStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedAvailableIds.length === availableStudents.length) {
                      setSelectedAvailableIds([]);
                    } else {
                      setSelectedAvailableIds(availableStudents.map(s => s.id));
                    }
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--interactive)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  {selectedAvailableIds.length === availableStudents.length ? 'Deselect All' : 'Select All Available'}
                </button>
              )}
            </div>

            <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '10px', background: 'var(--bg-app)', marginBottom: '16px' }}>
              {availableStudents.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                  No available students found matching your search.
                </div>
              ) : (
                availableStudents.map((student) => {
                  const isSelected = selectedAvailableIds.includes(student.id);
                  return (
                    <div
                      key={student.id}
                      onClick={() => {
                        setSelectedAvailableIds(prev =>
                          prev.includes(student.id) ? prev.filter(i => i !== student.id) : [...prev, student.id]
                        );
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 150ms ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: 'pointer' }}
                        />
                        <Avatar name={student.name} size={32} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{student.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{student.email} • Roll: {student.rollNumber || '—'}</div>
                        </div>
                      </div>
                      <Badge variant="success">{student.department || 'Student'}</Badge>
                    </div>
                  );
                })
              )}
            </div>

            {enrollError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger, #dc2626)', fontSize: '13px', marginBottom: '16px' }}>
                {enrollError}
              </div>
            )}

            <div className="admin-batches__modal-actions">
              <Button type="button" variant="secondary" onClick={() => setAddModalOpen(false)}>Cancel</Button>
              <Button onClick={handleEnrollSubmit} disabled={enrollSubmitting || selectedAvailableIds.length === 0}>
                {enrollSubmitting ? 'Enrolling...' : `Enroll Selected (${selectedAvailableIds.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {removeModalOpen && (
        <div className="admin-batches__modal-overlay" onClick={() => setRemoveModalOpen(false)}>
          <div className="admin-batches__modal-glass" onClick={(e) => e.stopPropagation()} style={{ width: '440px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-danger)' }}>
              Remove Student Enrollment
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {removeStudentId
                ? 'Are you sure you want to remove this student from the batch?'
                : `Are you sure you want to remove ${selectedEnrolledIds.length} student(s) from the batch?`}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', background: 'var(--bg-app)', padding: '10px', borderRadius: '8px' }}>
              Note: Student accounts, submissions, practice history, and performance data are fully preserved and will not be deleted.
            </p>
            <div className="admin-batches__modal-actions" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
              <Button variant="secondary" onClick={() => setRemoveModalOpen(false)}>Cancel</Button>
              <Button variant="danger" disabled={removeSubmitting} onClick={confirmRemove}>
                {removeSubmitting ? 'Removing...' : 'Confirm Removal'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
