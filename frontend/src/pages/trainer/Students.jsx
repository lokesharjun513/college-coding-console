// Trainer Global Students Page
// Path: /trainer/students
// This page lists all students across the trainer's assigned batches and allows adding students.

import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTrainerStudents, getTrainerBatches, enrollStudent } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import Icon from '../../components/ui/Icon';

export default function TrainerStudents() {
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Add Student modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [studentIdInput, setStudentIdInput] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  // Fetch students & batches
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, batchesRes] = await Promise.all([
        getTrainerStudents(),
        getTrainerBatches(),
      ]);
      setStudents(studentsRes.data?.data || []);
      setBatches(batchesRes.data?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filtering
  const filtered = useMemo(() => {
    if (!search) return students;
    const lower = search.toLowerCase();
    return students.filter((e) => {
      const name = e.student?.name?.toLowerCase() ?? '';
      const email = e.student?.email?.toLowerCase() ?? '';
      const sid = e.student?.id?.toString().toLowerCase() ?? '';
      const batchName = e.batch?.name?.toLowerCase() ?? '';
      const batchCode = e.batch?.code?.toLowerCase() ?? '';
      return name.includes(lower) || email.includes(lower) || sid.includes(lower) || batchName.includes(lower) || batchCode.includes(lower);
    });
  }, [students, search]);

  // Summary metrics
  const totalStudents = students.length;
  const statusCounts = useMemo(() => {
    const map = {};
    students.forEach((e) => {
      const s = e.status?.toUpperCase();
      if (s) map[s] = (map[s] || 0) + 1;
    });
    return map;
  }, [students]);
  const batchSet = new Set(students.map((e) => e.batch?.id).filter(Boolean));
  const batchCount = batchSet.size;

  const statusVariant = (status) => {
    const s = status?.toUpperCase();
    switch (s) {
      case 'ACTIVE':
        return 'success';
      case 'INACTIVE':
        return 'danger';
      case 'PENDING':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!selectedBatchId || !studentIdInput.trim()) return;
    try {
      setAddLoading(true);
      setAddError(null);
      await enrollStudent(selectedBatchId, studentIdInput.trim());
      setStudentIdInput('');
      setSelectedBatchId('');
      setAddModalOpen(false);
      await fetchData();
    } catch (err) {
      setAddError(err?.response?.data?.message || 'Failed to enroll student');
    } finally {
      setAddLoading(false);
    }
  };

  // Loading / error states
  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <EmptyState
          message={error}
          actionLabel="Retry"
          onAction={fetchData}
        />
      </div>
    );
  }

  // Table columns for desktop view
  const columns = [
    {
      key: 'student',
      header: 'Student',
      formatter: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Avatar name={row.student?.name} size={32} />
          <div>
            <div>{row.student?.name || '—'}</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-muted)' }}>{row.student?.email || '—'}</div>
          </div>
        </div>
      ),
    },
    { key: 'studentId', header: 'Student ID', formatter: (_, row) => row.student?.id || '—' },
    { key: 'email', header: 'Email', formatter: (_, row) => row.student?.email || '—' },
    {
      key: 'batch',
      header: 'Batch',
      formatter: (_, row) => (
        <div>
          <div>{row.batch?.name || '—'}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-muted)' }}>{row.batch?.code || '—'}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      formatter: (_, row) => row.status ? <Badge variant={statusVariant(row.status)}>{row.status}</Badge> : '—',
      align: 'center',
    },
    {
      key: 'actions',
      header: '',
      formatter: (_, row) => (
        <Link
          to={`/trainer/batches/${row.batch?.id}/students/${row.student?.id}`}
          className="btn btn-secondary"
        >
          View
        </Link>
      ),
      align: 'center',
    },
  ];

  return (
    <div className="trainer-students-page" style={{ padding: 'var(--space-8)' }}>
      <PageHeader
        title="Students"
        description="Manage and monitor students across your assigned batches."
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="primary" onClick={() => setAddModalOpen(true)}>
              + Add Student
            </Button>
            <Button variant="secondary" onClick={fetchData}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Summary Strip */}
      <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 'var(--space-8)' }}>
        <Card>
          <h3 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Total Students</h3>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-semibold)', margin: 'var(--space-1) 0 0' }}>{totalStudents}</p>
        </Card>
        <Card>
          <h3 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Active Students</h3>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-semibold)', margin: 'var(--space-1) 0 0' }}>{statusCounts['ACTIVE'] || 0}</p>
        </Card>
        <Card>
          <h3 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Inactive Students</h3>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-semibold)', margin: 'var(--space-1) 0 0' }}>{statusCounts['INACTIVE'] || 0}</p>
        </Card>
        <Card>
          <h3 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Batches Represented</h3>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-semibold)', margin: 'var(--space-1) 0 0' }}>{batchCount}</p>
        </Card>
      </div>

      {/* Toolbar / Search (only show if students exist or search is active) */}
      {(students.length > 0 || search) && (
        <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search by name, ID, email or batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search students"
            style={{
              flex: '1 1 250px',
              padding: 'var(--space-2) var(--space-3)',
              border: `1px solid var(--border-subtle)`,
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-body)',
              backgroundColor: 'var(--color-surface)',
            }}
          />
          {search && (
            <Button variant="secondary" onClick={() => setSearch('')}>Clear</Button>
          )}
        </div>
      )}

      {/* Content Area */}
      {students.length === 0 ? (
        <Card variant="flat">
          <div style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-4)' }}>
            <div style={{ display: 'inline-flex', padding: 'var(--space-4)', borderRadius: '50%', backgroundColor: 'var(--color-surface-hover)', marginBottom: 'var(--space-4)' }}>
              <Icon name="users" size={32} color="var(--color-text-muted)" ariaLabel="No students" />
            </div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)' }}>No students yet</h2>
            <p style={{ color: 'var(--color-text-muted)', maxWidth: '420px', margin: '0 auto var(--space-6)', fontSize: 'var(--font-size-body)' }}>
              Students enrolled in your batches will appear here. Add your first student to get started.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => setAddModalOpen(true)}>
                + Add Student
              </Button>
              <Button variant="secondary" onClick={() => navigate('/trainer/batches')}>
                View Batches
              </Button>
            </div>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card variant="flat">
          <div style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-4)' }}>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)' }}>No students found</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-body)' }}>
              We couldn&apos;t find any students matching your search.
            </p>
            <Button variant="secondary" onClick={() => setSearch('')}>Clear Search</Button>
          </div>
        </Card>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filtered.map((row) => (
            <Card key={row.id} variant="interactive">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Avatar name={row.student?.name} size={40} />
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--font-size-md)' }}>{row.student?.name || '—'}</h3>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-muted)' }}>{row.student?.email || '—'}</p>
                </div>
                {row.status && <Badge variant={statusVariant(row.status)}>{row.status}</Badge>}
              </div>
              <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-muted)' }}>
                <div>Student ID: {row.student?.id || '—'}</div>
                <div>Batch: {row.batch?.name || '—'} ({row.batch?.code || '—'})</div>
              </div>
              <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                <Link to={`/trainer/batches/${row.batch?.id}/students/${row.student?.id}`} className="btn btn-secondary">
                  View →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          emptyMessage="No students"
        />
      )}

      {/* Add Student Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Student">
        <form onSubmit={handleAddStudent}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="batchSelect" style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>
              Batch
            </label>
            <select
              id="batchSelect"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                fontSize: 'var(--font-size-body)',
              }}
            >
              <option value="">Select a batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="studentIdInput" style={{ display: 'block', marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>
              Student ID
            </label>
            <input
              id="studentIdInput"
              type="text"
              placeholder="Enter existing student ID"
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value)}
              required
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                fontSize: 'var(--font-size-body)',
              }}
            />
          </div>

          {addError && (
            <p style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
              {addError}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button variant="secondary" onClick={() => setAddModalOpen(false)} disabled={addLoading} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={addLoading} disabled={addLoading}>
              Add Student
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
