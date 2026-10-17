import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  bulkEnrollStudents,
  bulkUnenrollStudents,
  getAvailableBatchStudents,
  getBatchStudents,
  getTrainerBatch,
} from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Avatar from '../../components/ui/Avatar';
import Icon from '../../components/ui/Icon';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import StatusBadge from '../../components/trainer/StatusBadge';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
} from '../../components/trainer';
import { NOT_AVAILABLE, formatDate } from '../../utils/trainerDisplay';
import '../../styles/pages/trainer-students.css';

/**
 * Batch students — /trainer/batches/:batchId/students
 *
 * Batch ownership is enforced server-side on every call; this page never creates
 * users, it only manages enrollments of students that already exist.
 */
export default function TrainerBatchStudentsList() {
  const { batchId } = useParams();

  const [batch, setBatch] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [available, setAvailable] = useState([]);
  const [availableSearch, setAvailableSearch] = useState('');
  const [selectedAvailable, setSelectedAvailable] = useState([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  // A failed "available students" request must surface as an error. It must
  // never be rendered as an empty candidate list.
  const [availableError, setAvailableError] = useState(null);
  const [adding, setAdding] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [batchRes, studentsRes] = await Promise.all([
        getTrainerBatch(batchId),
        getBatchStudents(batchId),
      ]);
      setBatch(batchRes?.data?.data || null);
      setStudents(studentsRes?.data?.data || []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((row) => {
      const s = row.student || {};
      const matchesSearch =
        !q ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        String(s.id || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [students, search, statusFilter]);

  // Debounced candidate lookup for the enroll modal.
  useEffect(() => {
    if (!addModalOpen) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setAvailableLoading(true);
      setAvailableError(null);
      try {
        const res = await getAvailableBatchStudents(
          batchId,
          availableSearch ? { search: availableSearch } : {}
        );
        if (!active) return;
        setAvailable(res?.data?.data || []);
      } catch (err) {
        if (!active) return;
        setAvailable([]);
        setAvailableError(
          err?.response?.data?.message ||
            'Could not load students available for enrollment. Please try again.'
        );
      } finally {
        if (active) setAvailableLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [addModalOpen, availableSearch, batchId]);

  const handleRemove = async () => {
    const ids = confirmRemove?.bulk ? selectedIds : [confirmRemove?.id];
    if (!ids || ids.length === 0) return;
    setRemoving(true);
    try {
      await bulkUnenrollStudents(batchId, ids);
      setSelectedIds([]);
      setConfirmRemove(null);
      await fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to remove students');
    } finally {
      setRemoving(false);
    }
  };

  const toggleAvailable = (id) =>
    setSelectedAvailable((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );

  const handleEnroll = async () => {
    if (selectedAvailable.length === 0) return;
    setAdding(true);
    try {
      await bulkEnrollStudents(batchId, selectedAvailable);
      setAddModalOpen(false);
      setSelectedAvailable([]);
      setAvailableSearch('');
      await fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to enroll students');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading batch students…" />
      </div>
    );
  }

  if (error && students.length === 0) {
    return (
      <div className="trainer-page">
        <TrainerErrorState
          title="Couldn’t load batch students"
          message={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((row) => selectedIds.includes(row.student?.id));

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Batches', to: '/trainer/batches' },
          { label: batch?.name || 'Batch', to: `/trainer/batches/${batchId}` },
          { label: 'Students' },
        ]}
      />

      <PageHeader
        title="Batch Students"
        description={`Manage enrollments for ${batch?.name || 'this batch'}.`}
        actions={
          <div className="trainer-page__actions">
            <Button variant="primary" onClick={() => setAddModalOpen(true)}>
              <Icon name="plus" size={14} />
              Enroll Students
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="trainer-notice trainer-notice--error" role="alert">
          <Icon name="alertTriangle" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {students.length === 0 ? (
        <TrainerEmptyState
          icon="users"
          title="No students enrolled"
          description="This batch has no enrollments yet. Enroll existing students to get started."
        >
          <Button variant="primary" onClick={() => setAddModalOpen(true)}>
            <Icon name="plus" size={14} />
            Enroll Students
          </Button>
        </TrainerEmptyState>
      ) : (
        <>
          <div className="trainer-filter-bar">
            <label className="trainer-sr-only" htmlFor="trainer-student-search">
              Search students
            </label>
            <input
              id="trainer-student-search"
              type="search"
              className="trainer-search"
              placeholder="Search by name, email or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <label className="trainer-sr-only" htmlFor="trainer-student-status">
              Filter by status
            </label>
            <select
              id="trainer-student-status"
              className="trainer-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <span className="trainer-table__muted">
              {filtered.length} of {students.length} enrolled
            </span>
          </div>

          {filtered.length === 0 ? (
            <TrainerEmptyState
              icon="users"
              title="No matching students"
              description="No students match your current search or filter."
            />
          ) : (
            <div className="trainer-table-wrapper">
              <table className="admin-table">
                <caption className="trainer-sr-only">
                  Students enrolled in {batch?.name || 'this batch'}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={() =>
                          setSelectedIds(
                            allFilteredSelected
                              ? []
                              : filtered.map((r) => r.student?.id).filter(Boolean)
                          )
                        }
                        aria-label="Select all students"
                      />
                    </th>
                    <th scope="col">Student</th>
                    <th scope="col">Email</th>
                    <th scope="col">Enrolled</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const id = row.student?.id;
                    return (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(id)}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(id)
                                  ? prev.filter((i) => i !== id)
                                  : [...prev, id]
                              )
                            }
                            aria-label={`Select ${row.student?.name || 'student'}`}
                          />
                        </td>
                        <th scope="row" className="trainer-table__row-head">
                          <span className="trainer-table__identity">
                            <Avatar name={row.student?.name || ''} size={28} />
                            <span>{row.student?.name || NOT_AVAILABLE}</span>
                          </span>
                        </th>
                        <td className="trainer-table__muted">{row.student?.email || NOT_AVAILABLE}</td>
                        <td className="trainer-table__muted">{formatDate(row.enrolledAt)}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>
                          <span className="trainer-table__actions">
                            <button
                              type="button"
                              className="trainer-table__icon-action trainer-table__icon-action--danger"
                              onClick={() => setConfirmRemove({ id: row.student?.id, name: row.student?.name })}
                              aria-label={`Remove ${row.student?.name || 'student'} from this batch`}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedIds.length > 0 ? (
            <div className="trainer-bulk-bar" role="status">
              <span>{selectedIds.length} selected</span>
              <Button variant="danger" size="sm" onClick={() => setConfirmRemove({ bulk: true })}>
                <Icon name="trash" size={14} />
                Remove Selected
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* Remove confirmation — a real dialog, not window.confirm. */}
      <Modal
        isOpen={Boolean(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
        title={confirmRemove?.bulk ? 'Remove Students' : 'Remove Student'}
      >
        <p>
          {confirmRemove?.bulk
            ? `Remove ${selectedIds.length} selected student${selectedIds.length === 1 ? '' : 's'} from this batch? Their enrollments are removed; the student accounts are untouched.`
            : `Remove ${confirmRemove?.name || 'this student'} from this batch? Their enrollment is removed; the student account is untouched.`}
        </p>
        <div className="trainer-form__actions trainer-form__actions--modal">
          <Button variant="secondary" onClick={() => setConfirmRemove(null)} disabled={removing}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRemove} loading={removing}>
            Remove
          </Button>
        </div>
      </Modal>

      {/* Enroll modal — surfaces request failures instead of an empty list. */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Enroll Students">
        <div className="trainer-form">
          <div className="trainer-form__field">
            <label className="trainer-form__label" htmlFor="trainer-available-search">
              Search available students
            </label>
            <input
              id="trainer-available-search"
              type="search"
              className="trainer-search"
              placeholder="Name, email or roll number…"
              value={availableSearch}
              onChange={(e) => setAvailableSearch(e.target.value)}
            />
          </div>

          {availableLoading ? (
            <TrainerLoadingState label="Loading available students…" />
          ) : availableError ? (
            <div className="trainer-form__error" role="alert">
              {availableError}
            </div>
          ) : available.length === 0 ? (
            <TrainerEmptyState
              icon="users"
              title="No available students"
              description="Every active student matching this search is already enrolled in this batch."
            />
          ) : (
            <ul className="trainer-candidate-list">
              {available.map((student) => (
                <li key={student.id}>
                  <label className="trainer-candidate">
                    <input
                      type="checkbox"
                      checked={selectedAvailable.includes(student.id)}
                      onChange={() => toggleAvailable(student.id)}
                    />
                    <Avatar name={student.name || ''} size={28} />
                    <span className="trainer-candidate__name">{student.name}</span>
                    <span className="trainer-table__muted">{student.email}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="trainer-form__actions">
            <Button variant="secondary" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleEnroll}
              loading={adding}
              disabled={selectedAvailable.length === 0}
            >
              Enroll{selectedAvailable.length > 0 ? ` (${selectedAvailable.length})` : ''}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}