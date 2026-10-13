import React, { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Users, Plus, Search, SlidersHorizontal, Trash2, CheckSquare, XCircle, UserCheck,
} from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import TableActions from '../ui/table/TableActions';
import { getInitials } from '../../utils/initials';
import '../../styles/pages/admin-batch-enrollment.css';

/**
 * Admin — Batch Student Enrollment section.
 *
 * Owns its own filter / selection / confirmation state. Data fetching and the
 * batch KPI cards stay with the parent page, which passes the roster in and
 * receives `onRefresh` after a mutation.
 *
 * Data safety: the only destructive call here is `removeEnrollment`, which
 * deletes the BatchStudent relationship. It never touches the linked User or
 * Student document, and never affects enrollment in other batches.
 */

const STATUS_SEGMENTS = [
  { key: 'ALL', label: 'All Students' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'INACTIVE', label: 'Inactive' },
];

const PAGE_SIZE = 10;

/** Normalise any identifier shape to a stable string (never a name). */
const normalizeId = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    return normalizeId(value.userId ?? value.student?.id ?? value.student?._id ?? value._id ?? value.id);
  }
  const asString = String(value);
  return asString && asString !== '[object Object]' ? asString : null;
};

const UNASSIGNED = 'Unassigned';

export default function BatchEnrollmentSection({
  batch,
  enrolledStudents,
  onToggleStatus,
  onRemoveEnrollment,
  onOpenEnrollment,
  onBulkRemoveComplete,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [department, setDepartment] = useState('ALL');
  const [academicBatch, setAcademicBatch] = useState('ALL');
  const [section, setSection] = useState('ALL');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);

  // Pending confirmation
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);

  /* ── Filter options come from the real roster ─────────────── */
  const facets = useMemo(() => {
    const departments = new Set();
    const sections = new Set();
    const batches = new Map();
    for (const { student } of enrolledStudents) {
      if (student?.department) departments.add(student.department);
      if (student?.section) sections.add(student.section);
      const from = student?.academicBatch?.startYear ?? student?.startYear;
      const to = student?.academicBatch?.endYear ?? student?.endYear;
      if (from && to) batches.set(`${from}-${to}`, `${from}–${to}`);
    }
    return {
      departments: [...departments].sort(),
      sections: [...sections].sort(),
      batches: [...batches.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
    };
  }, [enrolledStudents]);

  const statusCounts = useMemo(() => ({
    ALL: enrolledStudents.length,
    ACTIVE: enrolledStudents.filter((e) => e.status === 'ACTIVE').length,
    INACTIVE: enrolledStudents.filter((e) => e.status !== 'ACTIVE').length,
  }), [enrolledStudents]);

  /* ── Single filtering implementation ───────────────────────── */
  const matches = useCallback((enrollment) => {
    const s = enrollment.student || {};
    const needle = search.trim().toLowerCase();

    if (statusFilter !== 'ALL' && enrollment.status !== statusFilter) return false;
    if (department !== 'ALL' && (s.department || UNASSIGNED) !== department) return false;
    if (section !== 'ALL' && (s.section || UNASSIGNED) !== section) return false;

    if (academicBatch !== 'ALL') {
      const from = s.academicBatch?.startYear ?? s.startYear;
      const to = s.academicBatch?.endYear ?? s.endYear;
      if (from == null || to == null) return false;
      const [lo, hi] = academicBatch.split('-').map(Number);
      if (from !== lo || to !== hi) return false;
    }

    if (needle) {
      const haystack = [s.name, s.email, s.rollNumber, s.department, s.section]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }, [search, statusFilter, department, academicBatch, section]);

  const filtered = useMemo(() => enrolledStudents.filter(matches), [enrolledStudents, matches]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const visibleIds = useMemo(() => visible.map((e) => normalizeId(e.student)).filter(Boolean), [visible]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  /* ── Active filter chips ───────────────────────────────────── */
  const chips = useMemo(() => {
    const list = [];
    if (search.trim()) list.push({ key: 'search', label: `“${search.trim()}”`, clear: () => setSearch('') });
    if (department !== 'ALL') list.push({ key: 'department', label: department, clear: () => setDepartment('ALL') });
    if (academicBatch !== 'ALL') {
      const label = facets.batches.find(([value]) => value === academicBatch)?.[1] ?? academicBatch;
      list.push({ key: 'academicBatch', label, clear: () => setAcademicBatch('ALL') });
    }
    if (section !== 'ALL') list.push({ key: 'section', label: `Section ${section}`, clear: () => setSection('ALL') });
    return list;
  }, [search, department, academicBatch, section, facets.batches]);

  const dropdownFiltersActive = department !== 'ALL' || academicBatch !== 'ALL' || section !== 'ALL';
  const hasActiveFilters = chips.length > 0 || statusFilter !== 'ALL';

  const clearAll = useCallback(() => {
    setSearch('');
    setStatusFilter('ALL');
    setDepartment('ALL');
    setAcademicBatch('ALL');
    setSection('ALL');
  }, []);

  // Reset paging when the result set changes underneath it.
  const filterSignature = `${search}|${statusFilter}|${department}|${academicBatch}|${section}`;
  const [lastSignature, setLastSignature] = useState(filterSignature);
  if (filterSignature !== lastSignature) {
    setLastSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  /* ── Selection ─────────────────────────────────────────────── */
  const toggleRow = (id) => {
    if (!id) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => (allVisibleSelected ? prev.filter((id) => !visibleIds.includes(id)) : [...new Set([...prev, ...visibleIds])]));
  };

  /* ── Mutations ─────────────────────────────────────────────── */
  const confirmStatusChange = async () => {
    if (!statusTarget || statusBusy) return;
    setStatusBusy(true);
    const nextStatus = statusTarget.enrollment.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await onToggleStatus(statusTarget.enrollment, nextStatus);
      setStatusTarget(null);
    } catch {
      // The parent already surfaced the failure; keep the dialog open so the
      // user can retry instead of silently losing the confirmation step.
    } finally {
      setStatusBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget || removeBusy) return;
    setRemoveBusy(true);
    try {
      await onRemoveEnrollment(removeTarget.enrollment);
      setSelectedIds((prev) => prev.filter((id) => id !== removeTarget.id));
      setRemoveTarget(null);
    } catch {
      // Parent surfaced the error; keep the dialog open to allow a retry.
    } finally {
      setRemoveBusy(false);
    }
  };

  const confirmBulkRemove = async () => {
    if (!bulkRemoveOpen || removeBusy) return;
    const ids = selectedIds;
    if (ids.length === 0) {
      setBulkRemoveOpen(false);
      return;
    }
    setRemoveBusy(true);
    try {
      // Sequential on purpose: each enrollment is deleted independently so one
      // failure cannot abandon the remaining deletions silently. `silent` keeps
      // the parent from firing a success toast per student.
      let removed = 0;
      let lastError = null;
      for (const enrollment of enrolledStudents) {
        if (!ids.includes(normalizeId(enrollment.student))) continue;
        try {
          await onRemoveEnrollment(enrollment, { silent: true });
          removed += 1;
        } catch (err) {
          lastError = err;
        }
      }
      setSelectedIds([]);
      setBulkRemoveOpen(false);
      if (lastError) {
        onBulkRemoveComplete?.(removed, ids.length - removed);
      } else {
        onBulkRemoveComplete?.(removed, 0);
      }
    } finally {
      setRemoveBusy(false);
    }
  };

  const emptyBecauseNoStudents = enrolledStudents.length === 0;

  return (
    <section id="enrollment-section" className="admin-batch-enrollment" aria-labelledby="enrollment-title">
      {/* ── Header ── */}
      <header className="admin-enroll-header">
        <div className="admin-enroll-header__main">
          <span className="admin-enroll-header__icon" aria-hidden="true">
            <Users size={20} />
          </span>
          <div className="admin-enroll-header__text">
            <h2 className="admin-enroll-header__title" id="enrollment-title">Student Enrollment</h2>
            <p className="admin-enroll-header__subtitle">
              Search, filter and manage the students enrolled in {batch.name}.
            </p>
          </div>
        </div>

        <div className="admin-enroll-header__actions">
          <div className="admin-enroll-count" role="status" aria-label="Total enrolled students">
            <span className="admin-enroll-count__icon" aria-hidden="true"><UserCheck size={16} /></span>
            <span className="admin-enroll-count__body">
              <span className="admin-enroll-count__label">Enrolled</span>
              <span className="admin-enroll-count__value" data-testid="enrolled-total">{enrolledStudents.length}</span>
            </span>
          </div>

          <button
            type="button"
            className={`admin-enroll-filter-btn${dropdownFiltersActive ? ' is-active' : ''}`}
            onClick={() => setFiltersOpen((prev) => !prev)}
            aria-expanded={filtersOpen}
            aria-controls="enrollment-filters"
          >
            <SlidersHorizontal size={16} />
            Filters
            {hasActiveFilters && (
              <span className="admin-enroll-filter-btn__dot" aria-hidden="true" />
            )}
          </button>

          <Button onClick={onOpenEnrollment}>
            <Plus size={16} style={{ marginRight: '6px' }} /> Add Students
          </Button>
        </div>
      </header>

      {/* ── Unified toolbar ── */}
      <div className="admin-batch-toolbar">
        <div className="admin-batch-toolbar__search">
          <span className="admin-batch-toolbar__search-icon" aria-hidden="true">
            <Search size={16} />
          </span>
          <input
            type="text"
            className="admin-input"
            placeholder="Search by name, email or roll number…"
            aria-label="Search enrolled students"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-enroll-segment" role="group" aria-label="Filter by enrollment status">
          {STATUS_SEGMENTS.map((seg) => {
            const isSelected = statusFilter === seg.key;
            return (
              <button
                key={seg.key}
                type="button"
                className={`admin-enroll-segment__btn${isSelected ? ' is-selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => setStatusFilter(seg.key)}
              >
                {seg.label}
                <span className="admin-enroll-segment__count">{statusCounts[seg.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Filter panel ── */}
      {filtersOpen && (
        <div className="admin-batch-filters" id="enrollment-filters" role="group" aria-label="Advanced filters">
          <div className="admin-batch-filters__field">
            <label className="admin-batch-filters__label" htmlFor="filter-department">Department</label>
            <select
              id="filter-department"
              className={`admin-batch-filters__select${department !== 'ALL' ? ' is-active' : ''}`}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="ALL">All departments</option>
              {facets.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="admin-batch-filters__field">
            <label className="admin-batch-filters__label" htmlFor="filter-year">Academic Batch</label>
            <select
              id="filter-year"
              className={`admin-batch-filters__select${academicBatch !== 'ALL' ? ' is-active' : ''}`}
              value={academicBatch}
              onChange={(e) => setAcademicBatch(e.target.value)}
            >
              <option value="ALL">All academic batches</option>
              {facets.batches.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div className="admin-batch-filters__field">
            <label className="admin-batch-filters__label" htmlFor="filter-section">Section</label>
            <select
              id="filter-section"
              className={`admin-batch-filters__select${section !== 'ALL' ? ' is-active' : ''}`}
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="ALL">All sections</option>
              {facets.sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <button
            type="button"
            className="admin-batch-filters__clear"
            onClick={clearAll}
            disabled={!hasActiveFilters}
          >
            Clear all filters
          </button>

          <span className="admin-batch-filters__count" role="status" data-testid="enrolled-match-count">
            {filtered.length} of {enrolledStudents.length} students found
          </span>
        </div>
      )}

      {chips.length > 0 && (
        <div className="admin-enroll-chips">
          <span className="admin-enroll-chips__label">Active filters:</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="admin-enroll-chip"
              onClick={chip.clear}
              aria-label={`Remove ${chip.key} filter ${chip.label}`}
            >
              {chip.label}
              <span className="admin-enroll-chip__x" aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="admin-enroll-chips__clear" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}

      {/* ── Bulk selection ── */}
      {selectedIds.length > 0 && (
        <div className="admin-batch-bulkbar">
          <span className="admin-batch-bulkbar__text" role="status" data-testid="bulk-selection-count">
            <strong>{selectedIds.length}</strong> student{selectedIds.length === 1 ? '' : 's'} selected
          </span>
          <div className="admin-batch-bulkbar__actions">
            <Button variant="danger" onClick={() => setBulkRemoveOpen(true)}>
              <Trash2 size={16} style={{ marginRight: '6px' }} /> Remove selected
            </Button>
            <Button variant="secondary" onClick={() => setSelectedIds([])}>Clear selection</Button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {visible.length === 0 ? (
        <div className="admin-card admin-batch-table-card">
          <div className="admin-batch-empty">
            <span className="admin-batch-empty__icon"><Users size={36} /></span>
            <h3 className="admin-batch-empty__title">
              {emptyBecauseNoStudents ? 'No students enrolled yet' : 'No matching students'}
            </h3>
            <p className="admin-batch-empty__text">
              {emptyBecauseNoStudents
                ? `No students have been enrolled in ${batch.name} yet.`
                : 'No students match the current search and filters.'}
            </p>
            {emptyBecauseNoStudents ? (
              <Button onClick={onOpenEnrollment}>Add Students</Button>
            ) : (
              <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            )}
          </div>
        </div>
      ) : (
        <div className="admin-card admin-batch-table-card">
          <div className="admin-batch-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="col-select" scope="col">
                    <input
                      type="checkbox"
                      aria-label="Select all enrolled students on this page"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th className="col-index is-center" scope="col">#</th>
                  <th scope="col">Student</th>
                  <th scope="col">Roll Number</th>
                  <th scope="col">Email</th>
                  <th className="is-center" scope="col">Department</th>
                  <th className="is-center" scope="col">Status</th>
                  <th className="is-right" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((enrollment, idx) => {
                  const s = enrollment.student || {};
                  const studentId = normalizeId(enrollment.student);
                  const isSelected = Boolean(studentId) && selectedIds.includes(studentId);
                  const isActive = enrollment.status === 'ACTIVE';
                  return (
                    <tr key={enrollment.id} className={isSelected ? 'is-selected' : undefined}>
                      <td className="col-select">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          aria-label={`Select ${s.name || 'student'}`}
                          onChange={() => toggleRow(studentId)}
                        />
                      </td>
                      <td className="col-index is-center">{(safePage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td>
                        <div className="admin-enroll-student">
                          <div className="admin-avatar admin-avatar--student" aria-hidden="true">
                            {getInitials(s.name || 'Student')}
                          </div>
                          <div className="admin-enroll-student__info">
                            <span className="admin-enroll-student__name">{s.name || 'Unknown'}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className="admin-batch-cell-code">{s.rollNumber || '—'}</span></td>
                      <td><span className="admin-batch-cell-email">{s.email || '—'}</span></td>
                      <td className="is-center">{s.department || '—'}</td>
                      <td className="is-center">
                        {/* The badge is the status control. */}
                        <button
                          type="button"
                          className={`admin-badge admin-badge--status admin-enroll-status ${isActive ? 'admin-badge--active' : 'admin-badge--inactive'}`}
                          onClick={() => setStatusTarget({ enrollment, name: s.name })}
                          aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${s.name || 'student'}`}
                          title={`${isActive ? 'Deactivate' : 'Activate'} enrollment`}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="is-right">
                        <TableActions
                          actions={[
                            {
                              label: `Remove ${s.name || 'student'} from batch`,
                              icon: Trash2,
                              variant: 'danger',
                              onClick: () => setRemoveTarget({ enrollment, name: s.name, id: studentId }),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="admin-batch-pagination">
            <span>
              Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}
              {' –'}
              {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="admin-batch-pagination__controls">
              <button
                type="button"
                className="admin-page-btn"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="admin-page-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Status confirmation ── */}
      <Modal
        isOpen={!!statusTarget}
        onClose={() => !statusBusy && setStatusTarget(null)}
        title={statusTarget?.enrollment?.status === 'ACTIVE' ? 'Deactivate student?' : 'Activate student?'}
      >
        {statusTarget && (() => {
          const deactivating = statusTarget.enrollment.status === 'ACTIVE';
          return (
            <>
              <div className="admin-modal__body">
                <div className={`admin-confirm ${deactivating ? 'admin-confirm--danger' : 'admin-confirm--success'}`}>
                  <span className="admin-confirm__icon" aria-hidden="true">
                    {deactivating ? <XCircle size={20} /> : <CheckSquare size={20} />}
                  </span>
                  <p className="admin-confirm__message">
                    Are you sure you want to {deactivating ? 'deactivate' : 'activate'} {statusTarget.name || 'this student'}?
                  </p>
                  <p className="admin-confirm__note">
                    {deactivating
                      ? 'Their enrollment in this batch will be marked inactive, so they lose access to this batch. Their student account stays active and they can still sign in.'
                      : 'They will regain access to this batch.'}
                  </p>
                </div>
              </div>
              <div className="admin-modal__footer">
                <Button variant="secondary" onClick={() => setStatusTarget(null)} disabled={statusBusy}>
                  Cancel
                </Button>
                <Button
                  variant={deactivating ? 'danger' : 'primary'}
                  onClick={confirmStatusChange}
                  loading={statusBusy}
                  disabled={statusBusy}
                >
                  {statusBusy ? 'Saving…' : deactivating ? 'Deactivate Student' : 'Activate Student'}
                </Button>
              </div>
            </>
          );
        })()}
      </Modal>

      {/* ── Enrollment removal confirmation ── */}
      <Modal
        isOpen={!!removeTarget}
        onClose={() => !removeBusy && setRemoveTarget(null)}
        title="Remove student from batch?"
      >
        {removeTarget && (
          <>
            <div className="admin-modal__body">
              <div className="admin-confirm admin-confirm--danger">
                <span className="admin-confirm__icon" aria-hidden="true"><Trash2 size={20} /></span>
                <div>
                  <p className="admin-confirm__message">
                    Are you sure you want to remove {removeTarget.name || 'this student'} from this batch?
                  </p>
                  <p className="admin-confirm__note">
                    This removes the student&apos;s enrollment from this batch but does not delete their
                    student account. Submissions and history are preserved.
                  </p>
                </div>
              </div>
            </div>
            <div className="admin-modal__footer">
              <Button variant="secondary" onClick={() => setRemoveTarget(null)} disabled={removeBusy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmRemove} loading={removeBusy} disabled={removeBusy}>
                {removeBusy ? 'Removing…' : 'Remove from Batch'}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Bulk removal confirmation ── */}
      <Modal
        isOpen={bulkRemoveOpen}
        onClose={() => !removeBusy && setBulkRemoveOpen(false)}
        title="Remove selected students?"
      >
        <div className="admin-modal__body">
          <div className="admin-confirm admin-confirm--danger">
            <span className="admin-confirm__icon" aria-hidden="true"><Trash2 size={20} /></span>
            <div>
              <p className="admin-confirm__message">
                Are you sure you want to remove {selectedIds.length} student{selectedIds.length === 1 ? '' : 's'} from this batch?
              </p>
              <p className="admin-confirm__note">
                This removes the selected enrollments from this batch but does not delete any
                student account. Submissions and history are preserved.
              </p>
            </div>
          </div>
        </div>
        <div className="admin-modal__footer">
          <Button variant="secondary" onClick={() => setBulkRemoveOpen(false)} disabled={removeBusy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmBulkRemove} loading={removeBusy} disabled={removeBusy}>
            {removeBusy ? 'Removing…' : `Remove ${selectedIds.length} Student${selectedIds.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

BatchEnrollmentSection.propTypes = {
  batch: PropTypes.shape({ id: PropTypes.string, name: PropTypes.string }).isRequired,
  enrolledStudents: PropTypes.arrayOf(PropTypes.object).isRequired,
  onToggleStatus: PropTypes.func.isRequired,
  onRemoveEnrollment: PropTypes.func.isRequired,
  onOpenEnrollment: PropTypes.func.isRequired,
  onBulkRemoveComplete: PropTypes.func,
};