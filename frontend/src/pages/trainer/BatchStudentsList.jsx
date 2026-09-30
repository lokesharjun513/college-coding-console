import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getTrainerBatch,
  getBatchStudents,
  getAvailableBatchStudents,
  bulkEnrollStudents,
  bulkUnenrollStudents,
  updateStudentEnrollment,
} from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
// import Card from '../../components/ui/Card'; // unused, removed to satisfy lint
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

export default function BatchStudentsList() {
  const { batchId } = useParams();

  const [batch, setBatch] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingBatch, setLoadingBatch] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [errorBatch, setErrorBatch] = useState(null);
  const [errorStudents, setErrorStudents] = useState(null);
  const [search, setSearch] = useState('');

  // Selected enrolled students for bulk unenroll
  const [selectedEnrolledIds, setSelectedEnrolledIds] = useState([]);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [availableSearch, setAvailableSearch] = useState('');
  const [selectedAvailableIds, setSelectedAvailableIds] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  // Update Enrollment Modal
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState(null);

  // Confirm Delete Modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch batch details
  useEffect(() => {
    const fetchBatch = async () => {
      try {
        setLoadingBatch(true);
        const res = await getTrainerBatch(batchId);
        setBatch(res.data?.data);
        setErrorBatch(null);
      } catch (err) {
        setErrorBatch(err?.response?.data?.message || 'Failed to load batch');
      } finally {
        setLoadingBatch(false);
      }
    };
    fetchBatch();
  }, [batchId]);

  // Fetch students list
  const fetchStudents = async () => {
    try {
      setLoadingStudents(true);
      const res = await getBatchStudents(batchId);
      setStudents(res.data?.data || []);
      setSelectedEnrolledIds([]);
      setErrorStudents(null);
    } catch (err) {
      setErrorStudents(err?.response?.data?.message || 'Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchStudents();
  }, [batchId]);

  // Fetch available students when modal opens or search changes
  useEffect(() => {
    if (!addModalOpen) return;
    const fetchAvailable = async () => {
      try {
        setLoadingAvailable(true);
        const res = await getAvailableBatchStudents(batchId, { search: availableSearch });
        setAvailableStudents(res.data?.data || []);
      } catch (err) {
        console.error('Failed to load available students', err);
      } finally {
        setLoadingAvailable(false);
      }
    };
    const timer = setTimeout(fetchAvailable, 300);
    return () => clearTimeout(timer);
  }, [batchId, addModalOpen, availableSearch]);

  const filteredStudents = useMemo(() => {
    if (!search) return students;
    const lower = search.toLowerCase();
    return students.filter((e) => {
      const name = e.student?.name?.toLowerCase() || '';
      const email = e.student?.email?.toLowerCase() || '';
      const roll = e.student?.rollNumber?.toLowerCase() || '';
      return name.includes(lower) || email.includes(lower) || roll.includes(lower);
    });
  }, [students, search]);

  const toggleSelectAllEnrolled = () => {
    if (selectedEnrolledIds.length === filteredStudents.length) {
      setSelectedEnrolledIds([]);
    } else {
      setSelectedEnrolledIds(filteredStudents.map(e => e.student.id));
    }
  };

  const toggleSelectEnrolled = (id) => {
    setSelectedEnrolledIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllAvailable = () => {
    if (selectedAvailableIds.length === availableStudents.length) {
      setSelectedAvailableIds([]);
    } else {
      setSelectedAvailableIds(availableStudents.map(s => s.id));
    }
  };

  const toggleSelectAvailable = (id) => {
    setSelectedAvailableIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkEnroll = async () => {
    if (selectedAvailableIds.length === 0) return;
    try {
      setAddLoading(true);
      setAddError(null);
      await bulkEnrollStudents(batchId, selectedAvailableIds);
      setSelectedAvailableIds([]);
      setAddModalOpen(false);
      await fetchStudents();
    } catch (err) {
      setAddError(err?.response?.data?.message || 'Failed to enroll students');
    } finally {
      setAddLoading(false);
    }
  };

  const handleBulkUnenroll = async () => {
    if (selectedEnrolledIds.length === 0) return;
    try {
      setDeleteLoading(true);
      await bulkUnenrollStudents(batchId, selectedEnrolledIds);
      setConfirmModalOpen(false);
      setSelectedEnrolledIds([]);
      await fetchStudents();
    } catch (err) {
      console.error('Failed to remove students', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openUpdateModal = (enrollment) => {
    setSelectedEnrollment(enrollment);
    setUpdateStatus(enrollment.status || '');
    setUpdateModalOpen(true);
  };

  const handleUpdateEnrollment = async (e) => {
    e.preventDefault();
    if (!selectedEnrollment) return;
    try {
      setUpdateLoading(true);
      setUpdateError(null);
      await updateStudentEnrollment(batchId, selectedEnrollment.student.id, updateStatus);
      setUpdateModalOpen(false);
      await fetchStudents();
    } catch (err) {
      setUpdateError(err?.response?.data?.message || 'Failed to update enrollment');
    } finally {
      setUpdateLoading(false);
    }
  };

  if (loadingBatch || loadingStudents) {
    return <Spinner />;
  }

  if (errorBatch || errorStudents) {
    return <EmptyState message={errorBatch || errorStudents} actionLabel="Retry" onAction={fetchStudents} />;
  }

  return (
    <div style={{ padding: 'var(--space-8)' }}>
      <PageHeader
        title="Students"
        description={`${batch?.name || ''} · ${batch?.code || ''}`}
        breadcrumb={<Link to="/trainer/batches">← Back to Batches</Link>}
        actions={<Button variant="primary" onClick={() => { setAvailableSearch(''); setSelectedAvailableIds([]); setAddModalOpen(true); }}>Add Students</Button>}
      />

      {/* Toolbar & Bulk Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search enrolled students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 250px', padding: 'var(--space-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
        />
        {selectedEnrolledIds.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', backgroundColor: 'var(--color-surface-muted)', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)' }}>{selectedEnrolledIds.length} selected</span>
            <Button variant="danger" size="sm" onClick={() => setConfirmModalOpen(true)}>Remove Selected</Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedEnrolledIds([])}>Clear</Button>
          </div>
        )}
      </div>

      {/* Table / List */}
      {filteredStudents.length === 0 ? (
        <EmptyState message="No students found" />
      ) : (
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--color-surface-muted)' }}>
                <th style={{ padding: 'var(--space-3)', width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={filteredStudents.length > 0 && selectedEnrolledIds.length === filteredStudents.length}
                    onChange={toggleSelectAllEnrolled}
                  />
                </th>
                <th style={{ padding: 'var(--space-3)' }}>Student</th>
                <th style={{ padding: 'var(--space-3)' }}>Roll Number</th>
                <th style={{ padding: 'var(--space-3)' }}>Email</th>
                <th style={{ padding: 'var(--space-3)' }}>Status</th>
                <th style={{ padding: 'var(--space-3)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((enrollment) => {
                const s = enrollment.student;
                const isSelected = selectedEnrolledIds.includes(s?.id);
                return (
                  <tr key={enrollment.id} style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: isSelected ? 'var(--color-surface-muted)' : 'transparent' }}>
                    <td style={{ padding: 'var(--space-3)' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectEnrolled(s?.id)}
                      />
                    </td>
                    <td style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Avatar name={s?.name} size={32} />
                      <span style={{ fontWeight: 500 }}>{s?.name}</span>
                    </td>
                    <td style={{ padding: 'var(--space-3)' }}>{s?.rollNumber || '—'}</td>
                    <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-muted)' }}>{s?.email}</td>
                    <td style={{ padding: 'var(--space-3)' }}>
                      <Badge variant={enrollment.status === 'ACTIVE' ? 'success' : 'danger'}>{enrollment.status}</Badge>
                    </td>
                    <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                        <Link to={`/trainer/batches/${batchId}/students/${s?.id}`} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }}>View</Link>
                        <Button variant="secondary" size="sm" onClick={() => openUpdateModal(enrollment)}>Update</Button>
                        <Button variant="danger" size="sm" onClick={() => { setSelectedEnrolledIds([s?.id]); setConfirmModalOpen(true); }}>Remove</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Students Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Students">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '70vh' }}>
          <input
            type="search"
            placeholder="Search available students by name, email, roll no..."
            value={availableSearch}
            onChange={(e) => setAvailableSearch(e.target.value)}
            style={{ padding: 'var(--space-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              {selectedAvailableIds.length} selected
            </span>
            {availableStudents.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAllAvailable}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}
              >
                {selectedAvailableIds.length === availableStudents.length ? 'Clear All' : 'Select All'}
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', maxHeight: '300px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            {loadingAvailable ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}><Spinner /></div>
            ) : availableStudents.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)' }}>No available students found.</div>
            ) : (
              availableStudents.map(student => {
                const isSelected = selectedAvailableIds.includes(student.id);
                return (
                  <div
                    key={student.id}
                    onClick={() => toggleSelectAvailable(student.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3)',
                      borderBottom: '1px solid var(--border-subtle)',
                      backgroundColor: isSelected ? 'var(--color-surface-muted)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>{student.name} {student.rollNumber ? `(${student.rollNumber})` : ''}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{student.email}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {addError && <p style={{ color: 'var(--color-danger)', margin: 0 }}>{addError}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setAddModalOpen(false)} disabled={addLoading}>Cancel</Button>
            <Button variant="primary" onClick={handleBulkEnroll} loading={addLoading} disabled={selectedAvailableIds.length === 0}>
              Add Students ({selectedAvailableIds.length})
            </Button>
          </div>
        </div>
      </Modal>

      {/* Update Enrollment Modal */}
      <Modal isOpen={updateModalOpen} onClose={() => setUpdateModalOpen(false)} title="Update Enrollment">
        <form onSubmit={handleUpdateEnrollment}>
          <label htmlFor="status" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Status</label>
          <select
            id="status"
            value={updateStatus}
            onChange={(e) => setUpdateStatus(e.target.value)}
            required
            style={{ width: '100%', padding: 'var(--space-2)', marginBottom: 'var(--space-4)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
          {updateError && <p style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-2)' }}>{updateError}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setUpdateModalOpen(false)} disabled={updateLoading}>Cancel</Button>
            <Button variant="primary" type="submit" loading={updateLoading}>Save</Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} title="Remove Students">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ margin: 0 }}>Are you sure you want to remove {selectedEnrolledIds.length} student(s) from this batch?</p>
          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Their submissions and performance history will be preserved.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setConfirmModalOpen(false)} disabled={deleteLoading}>Cancel</Button>
            <Button variant="danger" onClick={handleBulkUnenroll} loading={deleteLoading}>Remove Students</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
