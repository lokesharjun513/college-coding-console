import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Search, X, UserPlus, AlertTriangle, RotateCcw, Users, SlidersHorizontal,
  Building2, CalendarRange, LayoutGrid, ChevronDown,
} from 'lucide-react';
import Button from '../ui/Button';
import { getInitials } from '../../utils/initials';
import { readYears, academicBatchLabel, currentYearLabel } from '../../utils/academicBatch';
import '../../styles/pages/admin-enroll-modal.css';

/**
 * EnrollStudentsModal
 *
 * Picks eligible students who are not already enrolled in the batch.
 * Presentational only — the parent owns the roster, the selection and the
 * submit handler.
 *
 * `eligibleStudents` is the *eligibility-filtered* set (already enrolled and
 * non-ACTIVE students removed by the caller). This component owns only the
 * transient view state: search and the filter selects.
 *
 * Identity: `student.id` is the linked **User** id, because BatchStudent.student,
 * authentication and submissions all key off User._id. Student documents expose
 * `studentId`/`_id`, so those are never used as the row key.
 */

const ALL = 'ALL';

export default function EnrollStudentsModal({
  isOpen = false,
  batchName = '',
  eligibleStudents = [],
  selectedIds = [],
  loading = false,
  loadError = null,
  submitting = false,
  error = null,
  onRetry,
  onToggle,
  onToggleAll,
  onClose,
  onSubmit,
}) {
  const searchRef = useRef(null);
  const selectAllRef = useRef(null);

  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState(ALL);
  const [academicBatch, setAcademicBatch] = useState(ALL);
  const [section, setSection] = useState(ALL);

  // Reopening always starts from a clean, predictable filter state.
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setDepartment(ALL);
      setAcademicBatch(ALL);
      setSection(ALL);
      // Focus the search field so keyboard users land inside the dialog.
      searchRef.current?.focus();
    }
  }, [isOpen]);

  // Escape closes. Safe because closing only discards the in-progress view
  // state; the parent resets the selection when it reopens the modal.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  /* ── Facets are derived from the real roster, never hard-coded ── */

  const facets = useMemo(() => {
    const departments = new Set();
    const sections = new Set();
    const batches = new Map();
    for (const student of eligibleStudents) {
      if (student?.department) departments.add(student.department);
      if (student?.section) sections.add(student.section);
      const { startYear, endYear } = readYears(student);
      if (startYear !== null && endYear !== null) {
        batches.set(`${startYear}-${endYear}`, `${startYear}–${endYear}`);
      }
    }
    return {
      departments: [...departments].sort(),
      sections: [...sections].sort(),
      batches: [...batches.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
    };
  }, [eligibleStudents]);

  /**
   * One filtering implementation shared by the table and the segment counts.
   * `skipDepartment` lets the segment row count departments without the
   * department predicate collapsing every other segment to zero.
   */
  const matchesFilters = useCallback((student, { skipDepartment = false } = {}) => {
    if (!skipDepartment && department !== ALL && (student.department || '') !== department) {
      return false;
    }
    if (section !== ALL && (student.section || '') !== section) return false;

    if (academicBatch !== ALL) {
      const { startYear, endYear } = readYears(student);
      if (startYear === null || endYear === null) return false;
      if (`${startYear}-${endYear}` !== academicBatch) return false;
    }

    const needle = search.trim().toLowerCase();
    if (needle) {
      const haystack = [student.name, student.email, student.rollNumber]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }, [search, department, academicBatch, section]);

  const filtered = useMemo(
    () => eligibleStudents.filter((student) => matchesFilters(student)),
    [eligibleStudents, matchesFilters]
  );

  // Segment counts ignore the department predicate so every segment shows how
  // many students it would yield given the *other* active filters.
  const segmentCounts = useMemo(() => {
    const counts = new Map([[ALL, 0]]);
    for (const dept of facets.departments) counts.set(dept, 0);
    for (const student of eligibleStudents) {
      if (!matchesFilters(student, { skipDepartment: true })) continue;
      counts.set(ALL, (counts.get(ALL) ?? 0) + 1);
      const dept = student.department;
      if (dept && counts.has(dept)) counts.set(dept, counts.get(dept) + 1);
    }
    return counts;
  }, [eligibleStudents, matchesFilters, facets.departments]);

  const hasActiveFilters = Boolean(
    search.trim() || department !== ALL || academicBatch !== ALL || section !== ALL
  );

  const clearFilters = useCallback(() => {
    setSearch('');
    setDepartment(ALL);
    setAcademicBatch(ALL);
    setSection(ALL);
  }, []);

  /* ── Selection ──
     Selection is owned by the parent. We derive the "live" selection by
     intersecting it with the eligible roster so a student who became
     ineligible (e.g. enrolled in another tab) can never be submitted. */

  const eligibleIds = useMemo(
    () => new Set(eligibleStudents.map((s) => s.id).filter(Boolean)),
    [eligibleStudents]
  );

  const activeSelectedIds = useMemo(
    () => selectedIds.filter((id) => eligibleIds.has(id)),
    [selectedIds, eligibleIds]
  );
  const selectedSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);

  const filteredIds = useMemo(
    () => filtered.map((s) => s.id).filter(Boolean),
    [filtered]
  );

  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedSet.has(id));
  const someFilteredSelected = !allFilteredSelected && filteredIds.some((id) => selectedSet.has(id));

  // `indeterminate` is a DOM-only property; React does not expose it as a prop.
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someFilteredSelected;
  }, [someFilteredSelected]);

  const selectedCount = activeSelectedIds.length;
  const eligibleCount = eligibleStudents.length;
  const submitted = submitting || selectedCount === 0;

  if (!isOpen) return null;

  return (
    <div className="admin-enroll-overlay" role="presentation">
      <div
        className="admin-enroll-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enroll-students-title"
      >
        {/* ── Header ── */}
        <header className="admin-enroll-modal__header">
          <div className="admin-enroll-modal__heading">
            <span className="admin-enroll-modal__icon" aria-hidden="true">
              <UserPlus size={22} />
            </span>
            <div>
              <h2 className="admin-enroll-modal__title" id="enroll-students-title">
                Enroll Students
              </h2>
              <p className="admin-enroll-modal__subtitle">
                Select eligible students who are not already enrolled in {batchName}.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="admin-enroll-modal__close"
            onClick={onClose}
            aria-label="Close enrollment dialog"
          >
            <X size={20} />
          </button>
        </header>

        {/* ── Search + filters ── */}
        <div className="admin-enroll-modal__controls">
          <div className="admin-enroll-search">
            <span className="admin-enroll-search__icon" aria-hidden="true">
              <Search size={16} />
            </span>
            <input
              ref={searchRef}
              type="text"
              className="admin-enroll-search__input"
              placeholder="Search by name, email or roll number..."
              aria-label="Search available students"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="admin-enroll-filters" role="group" aria-label="Advanced filters">
            <div className="admin-enroll-filters__field">
              <label className="admin-enroll-filters__label" htmlFor="enroll-filter-department">
                <Building2 size={13} aria-hidden="true" /> Department
              </label>
              <div className="admin-enroll-filters__control">
                <select
                  id="enroll-filter-department"
                  className={`admin-enroll-filters__select${department !== ALL ? ' is-active' : ''}`}
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                >
                  <option value={ALL}>All departments</option>
                  {facets.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown size={15} className="admin-enroll-filters__chevron" aria-hidden="true" />
              </div>
            </div>

            <div className="admin-enroll-filters__field">
              <label className="admin-enroll-filters__label" htmlFor="enroll-filter-batch">
                <CalendarRange size={13} aria-hidden="true" /> Academic Batch
              </label>
              <div className="admin-enroll-filters__control">
                <select
                  id="enroll-filter-batch"
                  className={`admin-enroll-filters__select${academicBatch !== ALL ? ' is-active' : ''}`}
                  value={academicBatch}
                  onChange={(event) => setAcademicBatch(event.target.value)}
                >
                  <option value={ALL}>All academic years</option>
                  {facets.batches.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <ChevronDown size={15} className="admin-enroll-filters__chevron" aria-hidden="true" />
              </div>
            </div>

            <div className="admin-enroll-filters__field">
              <label className="admin-enroll-filters__label" htmlFor="enroll-filter-section">
                <LayoutGrid size={13} aria-hidden="true" /> Section
              </label>
              <div className="admin-enroll-filters__control">
                <select
                  id="enroll-filter-section"
                  className={`admin-enroll-filters__select${section !== ALL ? ' is-active' : ''}`}
                  value={section}
                  onChange={(event) => setSection(event.target.value)}
                >
                  <option value={ALL}>All sections</option>
                  {facets.sections.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={15} className="admin-enroll-filters__chevron" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Segments + eligible count ──
            The segments and the Department select share one piece of state, so
            they can never disagree; the select is the precise control and the
            segments are the quick one. */}
        <div className="admin-enroll-modal__segments-row">
          <div
            className="admin-enroll-modal__segments"
            role="group"
            aria-label="Filter eligible students by department"
          >
            <button
              type="button"
              className={`admin-enroll-segment${department === ALL ? ' is-selected' : ''}`}
              aria-pressed={department === ALL}
              onClick={() => setDepartment(ALL)}
            >
              All Students
              <span className="admin-enroll-segment__count">{segmentCounts.get(ALL) ?? 0}</span>
            </button>
            {facets.departments.map((dept) => (
              <button
                key={dept}
                type="button"
                className={`admin-enroll-segment${department === dept ? ' is-selected' : ''}`}
                aria-pressed={department === dept}
                onClick={() => setDepartment(department === dept ? ALL : dept)}
              >
                {dept}
                <span className="admin-enroll-segment__count">{segmentCounts.get(dept) ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="admin-enroll-modal__meta">
            <span className="admin-enroll-modal__count" role="status" data-testid="enroll-eligible-count">
              {filtered.length} of {eligibleCount} eligible
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                className="admin-enroll-modal__clear"
                onClick={clearFilters}
              >
                <SlidersHorizontal size={13} aria-hidden="true" /> Clear filters
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="admin-enroll-alert admin-enroll-alert--danger" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Student table (the only vertically scrolling region) ── */}
        <div className="admin-enroll-modal__body">
          {loadError ? (
            <div className="admin-enroll-state">
              <span className="admin-enroll-state__icon admin-enroll-state__icon--danger" aria-hidden="true">
                <AlertTriangle size={30} />
              </span>
              <h3 className="admin-enroll-state__title">Could not load students</h3>
              <p className="admin-enroll-state__text">{loadError}</p>
              <Button variant="secondary" onClick={onRetry}>
                <RotateCcw size={15} style={{ marginRight: '6px' }} /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="admin-enroll-skeleton" role="status" aria-label="Loading eligible students">
              {Array.from({ length: 6 }, (_, row) => (
                // eslint-disable-next-line react/no-array-index-key
                <div className="admin-enroll-skeleton__row" key={row}>
                  <span className="admin-enroll-skeleton__cell admin-enroll-skeleton__cell--check" />
                  <span className="admin-enroll-skeleton__cell admin-enroll-skeleton__cell--name" />
                  <span className="admin-enroll-skeleton__cell" />
                  <span className="admin-enroll-skeleton__cell" />
                  <span className="admin-enroll-skeleton__cell" />
                </div>
              ))}
            </div>
          ) : eligibleStudents.length === 0 ? (
            <div className="admin-enroll-state">
              <span className="admin-enroll-state__icon" aria-hidden="true"><Users size={30} /></span>
              <h3 className="admin-enroll-state__title">No eligible students available</h3>
              <p className="admin-enroll-state__text">
                Every active student is already enrolled in {batchName}, or no students have been created yet.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-enroll-state">
              <span className="admin-enroll-state__icon" aria-hidden="true"><Search size={28} /></span>
              <h3 className="admin-enroll-state__title">No matching students</h3>
              <p className="admin-enroll-state__text">
                No eligible student matches the current search and filters.
              </p>
              <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <div className="admin-enroll-table-wrap">
              <table className="admin-enroll-table">
                <thead>
                  <tr>
                    <th className="is-check" scope="col">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        aria-label="Select all eligible students"
                        checked={allFilteredSelected}
                        disabled={filteredIds.length === 0}
                        onChange={() => onToggleAll(filteredIds)}
                      />
                    </th>
                    <th className="is-index" scope="col">#</th>
                    <th scope="col">Student</th>
                    <th scope="col">Roll Number</th>
                    <th scope="col">Email</th>
                    <th scope="col">Department</th>
                    <th scope="col">Academic Batch</th>
                    <th scope="col">Section</th>
                    <th scope="col">Current Year</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student, idx) => {
                    const isSelected = selectedSet.has(student.id);
                    return (
                      <tr key={student.id} className={isSelected ? 'is-selected' : undefined}>
                        <td className="is-check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            aria-label={`Select ${student.name || 'student'}`}
                            onChange={() => onToggle(student.id)}
                          />
                        </td>
                        <td className="is-index">{idx + 1}</td>
                        <td>
                          <div className="admin-enroll-identity">
                            <div className="admin-avatar admin-avatar--student" aria-hidden="true">
                              {getInitials(student.name || 'Student')}
                            </div>
                            <span className="admin-enroll-identity__name">{student.name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td><span className="admin-enroll-cell-code">{student.rollNumber || '—'}</span></td>
                        <td><span className="admin-enroll-cell-email">{student.email || '—'}</span></td>
                        <td>{student.department || '—'}</td>
                        <td><span className="admin-enroll-cell-batch">{academicBatchLabel(student)}</span></td>
                        <td>{student.section || '—'}</td>
                        <td><span className="admin-enroll-cell-year">{currentYearLabel(student)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Sticky footer ── */}
        <footer className="admin-enroll-modal__footer">
          <span className="admin-enroll-modal__selection" role="status" data-testid="enroll-selection-count">
            <strong>{selectedCount}</strong> of {eligibleCount} student{eligibleCount === 1 ? '' : 's'} selected
          </span>
          <div className="admin-enroll-modal__actions">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={onSubmit} loading={submitting} disabled={submitted}>
              <UserPlus size={16} style={{ marginRight: '6px' }} />
              Enroll Selected ({selectedCount})
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

EnrollStudentsModal.propTypes = {
  isOpen: PropTypes.bool,
  batchName: PropTypes.string,
  eligibleStudents: PropTypes.arrayOf(PropTypes.shape({
    // The linked User id — the identity BatchStudent stores.
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    email: PropTypes.string,
    rollNumber: PropTypes.string,
    department: PropTypes.string,
    section: PropTypes.string,
    academicBatch: PropTypes.object,
  })),
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  loading: PropTypes.bool,
  loadError: PropTypes.string,
  submitting: PropTypes.bool,
  error: PropTypes.string,
  onRetry: PropTypes.func,
  onToggle: PropTypes.func.isRequired,
  onToggleAll: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};