import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  getTrainerBatch,
  getBatchStudents,
  getBatchPerformance,
  getAvailableBatchStudents,
  bulkEnrollStudents,
  bulkUnenrollStudents,
  enrollStudent,
} from '../../api/trainer';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EnrollStudentsModal from '../../components/admin/EnrollStudentsModal';
import Icon from '../../components/ui/Icon';
import '../../styles/pages/admin.css';
import '../../styles/trainer.css';
import StatusBadge from '../../components/trainer/StatusBadge';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerLoadingState,
  TrainerKpiCard,
  TrainerKpiGrid,
  TrainerSectionCard,
} from '../../components/trainer';
import { NOT_AVAILABLE, formatDate, formatCount } from '../../utils/trainerDisplay';
import '../../styles/pages/trainer-students.css';

export default function TrainerBatchDetails() {
  const { batchId } = useParams();
  const navigate = useNavigate();

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
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [available, setAvailable] = useState([]);
  const [selectedAvailable, setSelectedAvailable] = useState([]);
  const [adding, setAdding] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [batchRes, studentsRes, availableRes] = await Promise.all([
        getTrainerBatch(batchId),
        getBatchStudents(batchId),
        getAvailableBatchStudents(batchId),
      ]);
      setBatch(batchRes?.data?.data || null);
      setStudents(studentsRes?.data?.data || []);
      // Normalize available students to include all required fields for filters
      const normalized = (availableRes?.data?.data || []).map((student) => ({
        ...student,
        id: student._id || student.userId || student.studentId || student.id || '',
        department: student.department || '',
        section: student.section || '',
        rollNumber: student.rollNumber || '',
        startYear: student.startYear || student.academicBatch?.startYear || '',
        endYear: student.endYear || student.academicBatch?.endYear || '',
        name: student.name || '',
        email: student.email || '',
      }));
      setAvailable(normalized);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load batch data');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const totalStudents = students.length;
  const activeStudents = useMemo(() => students.filter((r) => r.status === 'ACTIVE').length, [students]);
  const inactiveStudents = totalStudents - activeStudents;

  // Remaining days calculation
  const remainingDays = useMemo(() => {
    if (!batch?.endDate) return '—';
    const today = new Date();
    const end = new Date(batch.endDate);
    // Clear time part for accurate day diff
    today.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    const diff = Math.floor((end - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Ended';
    if (diff === 0) return 'Ends today';
    return diff;
  }, [batch?.endDate]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selectedIds.includes(row.student?.id));

  const handleRemove = async () => {
    const ids = confirmRemove?.bulk ? selectedIds : [confirmRemove?.id];
    if (!ids || ids.length === 0) return;
    setRemoving(true);
    try {
      await bulkUnenrollStudents(batchId, ids);
      setSelectedIds([]);
      setConfirmRemove(null);
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to remove students');
    } finally {
      setRemoving(false);
    }
  };

  const toggleAvailable = (id) => {
    setSelectedAvailable((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleEnroll = async () => {
    if (selectedAvailable.length === 0) return;
    setAdding(true);
    try {
      await bulkEnrollStudents(batchId, selectedAvailable);
      setAddModalOpen(false);
      setSelectedAvailable([]);
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to enroll students');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading batch…" />
      </div>
    );
  }

  if (error && !batch) {
    return (
      <div className="trainer-page">
        <TrainerErrorState title="Couldn’t load this batch" message={error} onRetry={() => navigate('/trainer/batches')} />
      </div>
    );
  }

  const term = [formatDate(batch?.startDate), formatDate(batch?.endDate)].join(' – ');
  const termIsEmpty = !batch?.startDate && !batch?.endDate;

  return (
    <div className="trainer-page">
      <header className="trainer-page-header">
        <nav className="admin-breadcrumb" aria-label="breadcrumb">
          <Link to="/trainer" className="admin-breadcrumb__item">TRAINER</Link>
          <span className="admin-breadcrumb__separator">/</span>
          <Link to="/trainer/batches" className="admin-breadcrumb__item">BATCH</Link>
          <span className="admin-breadcrumb__separator">/</span>
          <span className="admin-breadcrumb__current" aria-current="page">
            {batch?.name || 'Batch'}
          </span>
        </nav>
        <div className="trainer-page-header-content">
          <div className="trainer-page-header-text">
            <h1 className="admin-dashboard__title">{batch?.name || 'Batch'}</h1>
            <p className="admin-dashboard__description">Manage batch information and enrolled students.</p>
          </div>
          <div className="trainer-page-header-actions">
            <button className="btn btn-primary btn-md admin-trainers__add-btn" onClick={() => setAddModalOpen(true)}>
              <Icon name="userPlus" size={14} />
              Enroll Students
            </button>
          </div>
        </div>
      </header>
      {/* Batch information section */}
      <section className="batch-info-card" aria-labelledby="batch-info-heading">
        <header className="batch-info-card__header">
          <span className="batch-info-card__icon"><Icon name="layers" size={20} /></span>
          <div>
            <h2 id="batch-info-heading" className="batch-info-card__title">Batch Information</h2>
            <p className="batch-info-card__subtitle">Overview of this batch&rsquo;s current configuration</p>
          </div>
          <div className="batch-info-card__status"><StatusBadge status={batch?.status} /></div>
        </header>
        <div className="batch-info-card__grid">
          {batch?.description && (
            <div className="batch-info-card__field">
              <span className="batch-info-card__label">Description</span>
              <span className="batch-info-card__value">{batch?.description}</span>
            </div>
          )}
          <div className="batch-info-card__field">
            <span className="batch-info-card__label">Term</span>
            <span className="batch-info-card__value">{term}</span>
          </div>
        </div>
      </section>

      {/* Batch KPI cards */}
      <TrainerKpiGrid title="Batch summary">
        <TrainerKpiCard label="Remaining Days" icon="calendar" value={remainingDays} tone="blue" />
        <TrainerKpiCard label="Students" icon="users" value={formatCount(totalStudents)} tone="blue" />
        <TrainerKpiCard label="Active" icon="userCheck" value={formatCount(activeStudents)} tone="green" />
        <TrainerKpiCard label="Inactive" icon="user" value={formatCount(inactiveStudents)} tone="orange" />
      </TrainerKpiGrid>

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
            <Icon name="userPlus" size={14} />
            Enroll Students
          </Button>
        </TrainerEmptyState>
      ) : (
        <>
          <div className="admin-trainers__toolbar">
            <div className="admin-trainers__search-wrapper">
              <Search className="admin-trainers__search-icon" size={16} />
              <input
                type="text"
                placeholder="Search by name, email, or roll number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="admin-trainers__search"
                aria-label="Search students"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="admin-trainers__select"
              aria-label="Filter by status"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <span className="admin-trainers__count">
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
            <div className="admin-card admin-table-wrapper">
              <table className="admin-table">
                <caption className="trainer-sr-only">Students in {batch?.name || 'this batch'}</caption>
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
                                prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                              )
                            }
                            aria-label={`Select ${row.student?.name || 'student'}`}
                          />
                        </td>
                        <td className="admin-trainers__user-cell">
                          <div className="admin-avatar admin-avatar--student">
                            {((row.student?.name || '').split(' ')
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join('')
                              .toUpperCase())}
                          </div>
                          <div>
                            <div className="admin-trainers__user-name">{row.student?.name || NOT_AVAILABLE}</div>
                            {row.student?.rollNumber && (
                              <div className="admin-trainers__user-id">Roll No: {row.student.rollNumber}</div>
                            )}
                          </div>
                        </td>
                        <td className="admin-table__email">{row.student?.email || NOT_AVAILABLE}</td>
                        <td>{formatDate(row.enrolledAt)}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="admin-trainers__actions-cell">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setSelectedStudent(row);
                              setStudentModalOpen(true);
                            }}
                          >
                            View
                            <Icon name="chevronRight" size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => setConfirmRemove({ id: row.student?.id, name: row.student?.name })}
                            aria-label={`Remove ${row.student?.name || 'student'} from this batch`}
                          >
                            <Icon name="trash" size={15} />
                          </button>
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

      {/* Removal confirmation modal */}
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

      {/* Enroll modal */}
      <EnrollStudentsModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        batchName={batch?.name}
        eligibleStudents={available}
        selectedIds={selectedAvailable}
        loading={loading}
        loadError={error}
        submitting={adding}
        onRetry={loadData}
        onToggle={toggleAvailable}
        onToggleAll={(ids) => {
          const allSelected = ids.every(id => selectedAvailable.includes(id));
          if (allSelected) {
            setSelectedAvailable([]);
          } else {
            setSelectedAvailable([...new Set([...selectedAvailable, ...ids])]);
          }
        }}
        onSubmit={handleEnroll}
      />

      {/* Student detail modal */}
      <Modal isOpen={studentModalOpen} onClose={() => setStudentModalOpen(false)} title="Student Details">
        {selectedStudent && (
          <div className="trainer-form">
            <TrainerSectionCard title="Student" headingId="student-detail-heading">
              <div className="trainer-metric-grid trainer-section-card__body--padded">
                <div className="trainer-metric-tile">
                  <p className="trainer-metric-tile__label">Name</p>
                  <p className="trainer-metric-tile__value">{selectedStudent.student?.name || NOT_AVAILABLE}</p>
                </div>
                <div className="trainer-metric-tile">
                  <p className="trainer-metric-tile__label">Email</p>
                  <p className="trainer-metric-tile__value">{selectedStudent.student?.email || NOT_AVAILABLE}</p>
                </div>
                <div className="trainer-metric-tile">
                  <p className="trainer-metric-tile__label">Student ID</p>
                  <p className="trainer-metric-tile__value">{selectedStudent.student?.id || NOT_AVAILABLE}</p>
                </div>
                <div className="trainer-metric-tile">
                  <p className="trainer-metric-tile__label">Enrolled At</p>
                  <p className="trainer-metric-tile__value">{formatDate(selectedStudent.enrolledAt)}</p>
                </div>
                <div className="trainer-metric-tile">
                  <p className="trainer-metric-tile__label">Status</p>
                  <p className="trainer-metric-tile__value">{selectedStudent.status}</p>
                </div>
              </div>
            </TrainerSectionCard>
            <div className="trainer-form__actions">
              <Button variant="secondary" onClick={() => setStudentModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
