import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTrainerBatch, getBatchStudents, bulkUnenrollStudents, getAvailableBatchStudents, bulkEnrollStudents } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import { Search, Plus, Trash2 } from 'lucide-react';
import '../../styles/pages/trainer-students.css';

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
  const [adding, setAdding] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [batchRes, studentsRes] = await Promise.all([
        getTrainerBatch(batchId),
        getBatchStudents(batchId)
      ]);
      setBatch(batchRes.data?.data);
      setStudents(studentsRes.data?.data || []);
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
    return students.filter(e => {
      const s = e.student || {};
      const matchesSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [students, search, statusFilter]);

  // Load enrollable students when the add modal opens; refetch as search changes.
  useEffect(() => {
    if (!addModalOpen) return;
    let active = true;
    const timer = setTimeout(async () => {
      setAvailableLoading(true);
      try {
        const res = await getAvailableBatchStudents(batchId, availableSearch ? { search: availableSearch } : {});
        if (active) setAvailable(res.data?.data || []);
      } catch (err) {
        if (active) setAvailable([]);
      } finally {
        if (active) setAvailableLoading(false);
      }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [addModalOpen, availableSearch, batchId]);

  const handleRemove = async () => {
    // Single-row removal targets confirmRemove.student; bulk targets the checkbox selection.
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
    setSelectedAvailable(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

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
    return <div className="trainer-students" style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-16)' }}><Spinner /></div>;
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selectedIds.includes(e.student?.id));

  return (
    <div className="trainer-students">
      <nav className="trainer-students__crumb">
        <Link to="/trainer/batches">Batches</Link>
        <span className="trainer-students__crumb-sep">/</span>
        <Link to={`/trainer/batches/${batchId}`}>{batch?.name || 'Batch'}</Link>
        <span className="trainer-students__crumb-sep">/</span>
        <span className="trainer-students__crumb-current">Students</span>
      </nav>

      <header className="trainer-students__header">
        <div>
          <h1 className="trainer-students__title">Batch Students</h1>
          <p className="trainer-students__description">Manage enrollments for {batch?.name}</p>
        </div>
        <div className="trainer-students__header-actions">
          <Button variant="primary" onClick={() => setAddModalOpen(true)}>
            <Plus size={16} style={{ marginRight: 'var(--space-1)' }} /> Add Students
          </Button>
        </div>
      </header>

      <div className="trainer-students__toolbar">
        <div className="trainer-students__search-wrap">
          <Search size={16} className="trainer-students__search-icon" />
          <input
            type="text"
            className="trainer-students__search"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="trainer-students__filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {error && <div className="trainer-students__error" role="alert">{error}</div>}

      <div className="trainer-students__card">
        {students.length === 0 ? (
          <div className="trainer-students__empty">
            <h2>No students yet</h2>
            <p>This batch has no students enrolled. Add students to get started.</p>
            <Button variant="primary" onClick={() => setAddModalOpen(true)}>
              <Plus size={16} style={{ marginRight: 'var(--space-1)' }} /> Add Students
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="trainer-students__empty">
            <h2>No matching students</h2>
            <p>No students match your current search or filter.</p>
          </div>
        ) : (
          <table className="trainer-students__table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={() =>
                      setSelectedIds(allFilteredSelected ? [] : filtered.map(e => e.student?.id).filter(Boolean))
                    }
                    aria-label="Select all"
                  />
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const id = e.student?.id;
                return (
                  <tr key={e.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(id)}
                        onChange={() => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])}
                        aria-label={`Select ${e.student?.name || 'student'}`}
                      />
                    </td>
                    <td className="trainer-students__student-info">
                      <Avatar name={e.student?.name} size={32} />
                      <span className="trainer-students__student-name">{e.student?.name}</span>
                    </td>
                    <td className="trainer-students__student-email">{e.student?.email}</td>
                    <td><Badge variant={e.status === 'ACTIVE' ? 'success' : 'neutral'}>{e.status}</Badge></td>
                    <td className="trainer-students__actions">
                      <Button variant="danger" size="sm" onClick={() => setConfirmRemove(e.student)}>
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="trainer-students__bulk-bar">
          <span className="trainer-students__bulk-count">{selectedIds.length} selected</span>
          <Button variant="danger" size="sm" onClick={() => setConfirmRemove({ bulk: true })}>
            <Trash2 size={16} style={{ marginRight: 'var(--space-1)' }} /> Remove Selected
          </Button>
        </div>
      )}

      <Modal isOpen={!!confirmRemove} onClose={() => setConfirmRemove(null)} title={confirmRemove?.bulk ? 'Remove Students' : 'Remove Student'}>
        <p>
          {confirmRemove?.bulk
            ? `Remove ${selectedIds.length} selected students from this batch?`
            : `Remove ${confirmRemove?.name} from this batch?`}
        </p>
        <div className="trainer-students__modal-actions">
          <Button variant="secondary" onClick={() => setConfirmRemove(null)} disabled={removing}>Cancel</Button>
          <Button variant="danger" onClick={handleRemove} loading={removing}>Remove</Button>
        </div>
      </Modal>

      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Enroll Students">
        <div className="trainer-students__add-search-wrap">
          <Search size={16} className="trainer-students__search-icon" />
          <input
            type="text"
            className="trainer-students__search"
            placeholder="Search students by name, email or roll number..."
            value={availableSearch}
            onChange={(e) => setAvailableSearch(e.target.value)}
          />
        </div>

        <div className="trainer-students__add-list">
          {availableLoading ? (
            <div className="trainer-students__add-loading"><Spinner /></div>
          ) : available.length === 0 ? (
            <p className="trainer-students__add-empty">No available students found.</p>
          ) : (
            available.map(s => (
              <label key={s.id} className="trainer-students__add-item">
                <input
                  type="checkbox"
                  checked={selectedAvailable.includes(s.id)}
                  onChange={() => toggleAvailable(s.id)}
                />
                <Avatar name={s.name} size={28} />
                <span className="trainer-students__add-name">{s.name}</span>
                <span className="trainer-students__add-email">{s.email}</span>
                {s.rollNumber && <span className="trainer-students__add-roll">{s.rollNumber}</span>}
              </label>
            ))
          )}
        </div>

        <div className="trainer-students__modal-actions">
          <Button variant="secondary" onClick={() => setAddModalOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleEnroll}
            loading={adding}
            disabled={selectedAvailable.length === 0}
          >
            Enroll {selectedAvailable.length > 0 ? `(${selectedAvailable.length})` : ''}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
