import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { enrollStudent, getTrainerBatches, getTrainerStudents } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Avatar from '../../components/ui/Avatar';
import Icon from '../../components/ui/Icon';
import StatusBadge from '../../components/trainer/StatusBadge';
import {
  TrainerEmptyState,
  TrainerErrorState,
  TrainerKpiCard,
  TrainerKpiGrid,
  TrainerLoadingState,
} from '../../components/trainer';
import { NOT_AVAILABLE, formatCount } from '../../utils/trainerDisplay';
import { uniqueStudents } from '../../utils/trainerAggregates';
import '../../styles/pages/trainer-students.css';

/**
 * Trainer students across all assigned batches — /trainer/students
 *
 * Enrollments are returned one row per batch, so the totals de-duplicate on
 * `student.id`. A student enrolled in two batches counts once in "Total
 * Students" but appears on two rows, matching the API.
 *
 * The enroll action adds an EXISTING student to a batch you own. It does not
 * create user accounts — that is admin-only and has no trainer endpoint.
 */
export default function TrainerStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [studentIdInput, setStudentIdInput] = useState('');
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [studentsRes, batchesRes] = await Promise.all([
        getTrainerStudents(),
        getTrainerBatches(),
      ]);
      setStudents(studentsRes?.data?.data || []);
      setBatches(batchesRes?.data?.data || []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((row) => {
      const fields = [
        row.student?.name,
        row.student?.email,
        row.student?.id,
        row.batch?.name,
        row.batch?.code,
      ];
      return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
    });
  }, [students, search]);

  // De-duplicated so a multi-batch student is counted once.
  const totalStudents = useMemo(() => uniqueStudents(students), [students]);

  const summary = useMemo(() => {
    const activeIds = new Set();
    const inactiveIds = new Set();
    const batchIds = new Set();
    for (const row of students) {
      const id = row.student?.id;
      if (id === undefined || id === null) continue;
      batchIds.add(String(row.batch?.id));
      if (String(row.status || '').toUpperCase() === 'ACTIVE') activeIds.add(String(id));
      else inactiveIds.add(String(id));
    }
    return {
      active: activeIds.size,
      inactive: [...inactiveIds].filter((id) => !activeIds.has(id)).length,
      batches: batchIds.size,
    };
  }, [students]);

  const handleEnroll = async (event) => {
    event.preventDefault();
    if (!selectedBatchId || !studentIdInput.trim()) return;
    try {
      setEnrollLoading(true);
      setEnrollError(null);
      await enrollStudent(selectedBatchId, studentIdInput.trim());
      setStudentIdInput('');
      setSelectedBatchId('');
      setEnrollOpen(false);
      await fetchData();
    } catch (err) {
      setEnrollError(err?.response?.data?.message || 'Failed to enroll student');
    } finally {
      setEnrollLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="trainer-page">
        <PageHeader title="Students" description="Students across your assigned batches." />
        <TrainerLoadingState label="Loading students…" />
      </div>
    );
  }

  if (error && students.length === 0) {
    return (
      <div className="trainer-page">
        <PageHeader title="Students" description="Students across your assigned batches." />
        <TrainerErrorState title="Couldn’t load students" message={error} onRetry={fetchData} />
      </div>
    );
  }

  return (
    <div className="trainer-page">
      <PageHeader
        title="Students"
        description="Every student enrolled across the batches assigned to you."
        breadcrumb={<span className="admin-breadcrumb__current">Students</span>}
        actions={
          <div className="trainer-page__actions">
            <Button variant="primary" onClick={() => setEnrollOpen(true)}>
              <Icon name="userPlus" size={14} />
              Enroll Student
            </Button>
          </div>
        }
      />

      {students.length > 0 ? (
        <TrainerKpiGrid title="Student summary">
          <TrainerKpiCard
            label="Total Students"
            icon="users"
            value={formatCount(totalStudents)}
            meta="Unique across your batches"
            tone="blue"
          />
          <TrainerKpiCard
            label="Active Enrollments"
            icon="userCheck"
            value={formatCount(summary.active)}
            meta="Currently active in at least one batch"
            tone="green"
          />
          <TrainerKpiCard
            label="Inactive Only"
            icon="user"
            value={formatCount(summary.inactive)}
            meta="No active enrollment"
            tone="orange"
          />
          <TrainerKpiCard
            label="Batches Represented"
            icon="layers"
            value={formatCount(summary.batches)}
            meta="With at least one enrollment"
            tone="red"
          />
        </TrainerKpiGrid>
      ) : null}

      {error ? (
        <div className="trainer-notice trainer-notice--error" role="alert">
          <Icon name="alertTriangle" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {students.length > 0 ? (
        <div className="trainer-filter-bar">
          <label className="trainer-sr-only" htmlFor="trainer-all-students-search">
            Search students
          </label>
          <input
            id="trainer-all-students-search"
            type="search"
            className="trainer-search"
            placeholder="Search by name, ID, email or batch…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <Button variant="secondary" onClick={() => setSearch('')}>
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      {students.length === 0 ? (
        <TrainerEmptyState
          icon="users"
          title="No students yet"
          description="Students enrolled in your batches appear here. Enroll an existing student to get started."
        >
          <div className="trainer-page__actions">
            <Button variant="primary" onClick={() => setEnrollOpen(true)}>
              <Icon name="userPlus" size={14} />
              Enroll Student
            </Button>
            <Button variant="secondary" onClick={fetchData}>
              <Icon name="refreshCw" size={14} />
              Refresh
            </Button>
          </div>
        </TrainerEmptyState>
      ) : filtered.length === 0 ? (
        <TrainerEmptyState
          icon="users"
          title="No matching students"
          description="No students match your current search."
        >
          <Button variant="secondary" onClick={() => setSearch('')}>
            Clear search
          </Button>
        </TrainerEmptyState>
      ) : (
        <>
          {/* Desktop: real table. Mobile: the card list below. Both are in the
              DOM and the stylesheet switches between them, so no JS resize
              listener is needed and both are testable. */}
          <div className="trainer-table-wrapper trainer-hide-mobile">
            <table className="admin-table">
              <caption className="trainer-sr-only">
                Students enrolled across your batches
              </caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Batch</th>
                  <th scope="col">Student ID</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="trainer-table__row-head">
                      <span className="trainer-table__identity">
                        <Avatar name={row.student?.name || ''} size={28} />
                        <span>{row.student?.name || NOT_AVAILABLE}</span>
                      </span>
                    </th>
                    <td>
                      <span className="trainer-table__stack">
                        <span>{row.batch?.name || NOT_AVAILABLE}</span>
                        <span className="trainer-table__muted">{row.batch?.code}</span>
                      </span>
                    </td>
                    <td className="trainer-table__muted">
                      {row.student?.id || NOT_AVAILABLE}
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      <span className="trainer-table__actions">
                        <Link
                          to={`/trainer/batches/${row.batch?.id}/students/${row.student?.id}`}
                          className="btn btn-secondary"
                        >
                          View
                          <Icon name="chevronRight" size={14} />
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="trainer-enrollment-cards trainer-hide-desktop">
            {filtered.map((row) => (
              <li key={row.id} className="trainer-enrollment-card">
                <div className="trainer-enrollment-card__head">
                  <Avatar name={row.student?.name || ''} size={36} />
                  <span className="trainer-enrollment-card__identity">
                    <p className="trainer-enrollment-card__name">
                      {row.student?.name || NOT_AVAILABLE}
                    </p>
                    <p className="trainer-enrollment-card__email">
                      {row.student?.email || NOT_AVAILABLE}
                    </p>
                  </span>
                  <StatusBadge status={row.status} />
                </div>
                <div className="trainer-enrollment-card__meta">
                  <span>Student ID: {row.student?.id || NOT_AVAILABLE}</span>
                  <span>
                    Batch: {row.batch?.name || NOT_AVAILABLE} ({row.batch?.code || NOT_AVAILABLE})
                  </span>
                </div>
                <div className="trainer-enrollment-card__actions">
                  <Link
                    to={`/trainer/batches/${row.batch?.id}/students/${row.student?.id}`}
                    className="btn btn-secondary"
                  >
                    View enrollment
                    <Icon name="chevronRight" size={14} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal isOpen={enrollOpen} onClose={() => setEnrollOpen(false)} title="Enroll Student">
        <form className="trainer-form" onSubmit={handleEnroll}>
          <p className="trainer-form__hint">
            Enrolls an existing student into one of your batches. Student accounts are created by an
            administrator.
          </p>

          <div className="trainer-form__field">
            <label className="trainer-form__label" htmlFor="trainer-enroll-batch">
              Batch
            </label>
            <select
              id="trainer-enroll-batch"
              className="trainer-select"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              required
            >
              <option value="">Select a batch…</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name} ({batch.code || 'no code'})
                </option>
              ))}
            </select>
          </div>

          <div className="trainer-form__field">
            <label className="trainer-form__label" htmlFor="trainer-enroll-student-id">
              Student ID
            </label>
            <input
              id="trainer-enroll-student-id"
              type="text"
              className="trainer-form__input"
              placeholder="Existing student ID"
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value)}
              required
            />
          </div>

          {enrollError ? (
            <div className="trainer-form__error" role="alert">
              {enrollError}
            </div>
          ) : null}

          <div className="trainer-form__actions">
            <Button variant="secondary" type="button" onClick={() => setEnrollOpen(false)} disabled={enrollLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={enrollLoading}
              disabled={!selectedBatchId || !studentIdInput.trim()}
            >
              Enroll Student
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}