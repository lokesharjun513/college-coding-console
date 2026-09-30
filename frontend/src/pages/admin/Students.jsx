import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, Download } from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import TableActions from '../../components/ui/table/TableActions';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Card from '../../components/ui/Card';
import { getStudents, createStudent, updateStudent, deleteStudent, downloadStudentTemplate } from '../../api/admin';
import BulkUploadModal from './BulkUploadModal';
import '../../styles/pages/admin-students.css';

/**
 * Admin Students page - Manage students across the institution.
 */
export default function Students() {
  // Data state
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Pagination state
  const [meta, setMeta] = useState({ page: 1, limit: 10 });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  // Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Selected student for edit/delete
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Form state
  const [addForm, setAddForm] = useState({ name: '', email: '', rollNumber: '', startYear: '', endYear: '', department: '', section: '' });
  const [editForm, setEditForm] = useState({ name: '', email: '', rollNumber: '', startYear: '', endYear: '', department: '', section: '' });

  const [submitting, setSubmitting] = useState(false);

  // Fetch students
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudents();
      const formatted = (res.data?.data || []).map(s => ({ ...s, id: s._id }));
      setStudents(formatted);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load students');
      setToast({ message: err?.response?.data?.message || 'Failed to load students', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // Unique departments for filter dropdown
  const departments = React.useMemo(() => {
    const uniq = [...new Set(students.map(s => s.department).filter(Boolean))];
    return uniq.sort();
  }, [students]);

  // Filtered list
  const filteredStudents = React.useMemo(() => {
    let result = [...students];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.rollNumber?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status?.toLowerCase() === statusFilter);
    }
    if (departmentFilter !== 'all') {
      result = result.filter(s => s.department === departmentFilter);
    }
    return result;
  }, [students, searchQuery, statusFilter, departmentFilter]);

  // Pagination
  const paginatedStudents = filteredStudents.slice((meta.page - 1) * meta.limit, meta.page * meta.limit);
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / meta.limit));

  // Reset page when filters change
  useEffect(() => { setMeta(prev => ({ ...prev, page: 1 })); }, [searchQuery, statusFilter, departmentFilter]);

  // KPI metrics
  const kpis = React.useMemo(() => {
    const total = students.length;
    const active = students.filter(s => s.status === 'ACTIVE').length;
    const inactive = students.filter(s => s.status === 'INACTIVE').length;
    const deptCount = departments.length;
    return { total, active, inactive, deptCount };
  }, [students, departments]);

  // Open edit modal
  const openEditModal = (student) => {
    setSelectedStudent(student);
    setEditForm({
      name: student.name || '',
      email: student.email || '',
      rollNumber: student.rollNumber || '',
      startYear: student.academicBatch?.startYear || '',
      endYear: student.academicBatch?.endYear || '',
      department: student.department || '',
      section: student.section || '',
    });
    setEditModalOpen(true);
  };

  // Form change handlers
  const handleAddFormChange = (e) => setAddForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleEditFormChange = (e) => setEditForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  // Add student submit
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.name || !addForm.email || !addForm.rollNumber || !addForm.startYear || !addForm.endYear || !addForm.department) {
      setToast({ message: 'Please fill all required fields', type: 'error' });
      return;
    }
    if (parseInt(addForm.endYear) <= parseInt(addForm.startYear)) {
      setToast({ message: 'End year must be greater than start year', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await createStudent({
        name: addForm.name,
        email: addForm.email,
        rollNumber: addForm.rollNumber,
        academicBatch: { startYear: parseInt(addForm.startYear), endYear: parseInt(addForm.endYear) },
        department: addForm.department,
        section: addForm.section || undefined,
      });
      setToast({ message: 'Student created successfully', type: 'success' });
      setAddModalOpen(false);
      setAddForm({ name: '', email: '', rollNumber: '', startYear: '', endYear: '', department: '', section: '' });
      await fetchStudents();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to create student', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Edit student submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.name || !editForm.email || !editForm.rollNumber || !editForm.startYear || !editForm.endYear || !editForm.department) {
      setToast({ message: 'Please fill all required fields', type: 'error' });
      return;
    }
    if (parseInt(editForm.endYear) <= parseInt(editForm.startYear)) {
      setToast({ message: 'End year must be greater than start year', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await updateStudent(selectedStudent.id, {
        name: editForm.name,
        email: editForm.email,
        rollNumber: editForm.rollNumber,
        academicBatch: { startYear: parseInt(editForm.startYear), endYear: parseInt(editForm.endYear) },
        department: editForm.department,
        section: editForm.section || undefined,
      });
      setToast({ message: 'Student updated successfully', type: 'success' });
      setEditModalOpen(false);
      setSelectedStudent(null);
      await fetchStudents();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Failed to update student', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Delete student
  const handleDelete = async () => {
    if (!selectedStudent) return;
    setSubmitting(true);
    try {
      await deleteStudent(selectedStudent.id);
      setToast({ message: 'Student deleted successfully', type: 'success' });
      setDeleteModalOpen(false);
      setSelectedStudent(null);
      await fetchStudents();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to delete student';
      if (msg.toLowerCase().includes('enrolled')) {
        setDeleteError('Student is currently enrolled in a batch. Remove the student from the batch before deleting.');
        // keep modal open to show the error
      } else {
        setToast({ message: msg, type: 'error' });
        setDeleteModalOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const [downloading, setDownloading] = useState(false);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      const response = await downloadStudentTemplate();
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'student_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setToast({ message: 'Template downloaded successfully', type: 'success' });
    } catch (err) {
      setToast({ message: 'Unable to download the student template. Please try again.', type: 'error' });
    } finally {
      setDownloading(false);
    }
  };

  const clearFilters = () => { setSearchQuery(''); setStatusFilter('all'); setDepartmentFilter('all'); };
  const filtersActive = searchQuery || statusFilter !== 'all' || departmentFilter !== 'all';

  // Table columns
  const columns = [
    { key: 'student', header: 'Student' },
    { key: 'rollNumber', header: 'Roll Number' },
    { key: 'email', header: 'Email' },
    { key: 'academicBatch', header: 'Academic Batch' },
    { key: 'department', header: 'Department' },
    { key: 'section', header: 'Section' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions' },
  ];

  // Table rows
  const rows = paginatedStudents.map((student) => ({
    student: (
      <div className="admin-students__student">
        <Avatar name={student.name} size={36} />
        <div className="admin-students__student-info">
          <span className="admin-students__student-name">{student.name}</span>
          <span className="admin-students__student-id">{student.id?.slice(-6)}</span>
        </div>
      </div>
    ),
    rollNumber: student.rollNumber || '—',
    email: student.email,
    academicBatch: student.academicBatch?.startYear && student.academicBatch?.endYear ? `${student.academicBatch.startYear} – ${student.academicBatch.endYear}` : '—',
    department: student.department || '—',
    section: student.section || '—',
    status: (
      <Badge variant={student.status === 'ACTIVE' ? 'success' : 'warning'}>{student.status}</Badge>
    ),
    actions: (
      <TableActions
        actions={[
          { label: 'Edit', icon: Pencil, onClick: () => openEditModal(student) },
          { label: 'Delete', icon: Trash2, onClick: () => { setSelectedStudent(student); setDeleteModalOpen(true); }, variant: 'danger' },
        ]}
      />
    ),
  }));

  return (
    <div className="admin-students">
      {/* Page Header */}
      <div className="admin-students__header">
        <h1>Students</h1>
        <p>Manage students across the institution.</p>
        <div className="admin-students__actions">
          <Button variant="secondary" className="admin-students__download-btn" onClick={handleDownloadTemplate} loading={downloading}>
            {downloading ? 'Downloading...' : 'Download Template'}
          </Button>
          <Button className="admin-students__bulk-btn" onClick={() => setBulkModalOpen(true)}>Bulk Upload</Button>
          <Button onClick={() => setAddModalOpen(true)}>+ Add Student</Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="admin-students__kpi">
        <div className="admin-students__kpi-card">
          <div className="admin-students__kpi-label">Total Students</div>
          <div className="admin-students__kpi-value">{loading ? <Spinner size={20} /> : kpis.total}</div>
          <div className="admin-students__kpi-meta">All students</div>
        </div>
        <div className="admin-students__kpi-card">
          <div className="admin-students__kpi-label">Active</div>
          <div className="admin-students__kpi-value">{loading ? <Spinner size={20} /> : kpis.active}</div>
          <div className="admin-students__kpi-meta">Currently active</div>
        </div>
        <div className="admin-students__kpi-card">
          <div className="admin-students__kpi-label">Inactive</div>
          <div className="admin-students__kpi-value">{loading ? <Spinner size={20} /> : kpis.inactive}</div>
          <div className="admin-students__kpi-meta">Deactivated</div>
        </div>
        <div className="admin-students__kpi-card">
          <div className="admin-students__kpi-label">Departments</div>
          <div className="admin-students__kpi-value">{loading ? <Spinner size={20} /> : kpis.deptCount}</div>
          <div className="admin-students__kpi-meta">Unique departments</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="admin-students__toolbar">
        <div className="admin-students__toolbar-left">
          <input
            type="text"
            className="admin-students__search"
            placeholder="Search students..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search students"
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            {['all', 'active', 'inactive'].map((st) => (
              <button
                key={st}
                type="button"
                className={`admin-students__toggle-btn ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st === 'all' ? 'All Status' : st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>
          <select
            className="admin-students__filter"
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="all">All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        {filtersActive && (
          <button className="admin-students__clear-btn" onClick={clearFilters}>Clear Filters</button>
        )}
      </div>

      {/* Content */}
      {error && (
        <div className="admin-students__error" role="alert">
          <h3>Unable to load students</h3>
          <p>We couldn&apos;t retrieve the student list.</p>
          <Button onClick={fetchStudents}>Retry</Button>
        </div>
      )}

      {!error && !loading && filteredStudents.length === 0 && students.length === 0 && (
        <div className="admin-students__empty">
          <h3>No students yet</h3>
          <p>Create your first student or import students using a CSV template.</p>
          <div className="admin-students__empty-actions">
            <Button onClick={() => setAddModalOpen(true)}>+ Add Student</Button>
            <Button variant="secondary" onClick={() => setBulkModalOpen(true)}>Import Students</Button>
          </div>
        </div>
      )}

      {!error && !loading && filteredStudents.length === 0 && students.length > 0 && (
        <div className="admin-students__empty">
          <h3>No matching students</h3>
          <p>Try changing your search or filters.</p>
          <Button variant="secondary" onClick={clearFilters}>Clear Filters</Button>
        </div>
      )}

      {!error && !loading && filteredStudents.length > 0 && (
        <Card>
          <div className="admin-students__table">
            <DataTable
              columns={columns}
              data={rows}
              loading={false}
              error={null}
              emptyMessage="No students available."
              showSNo={true}
              currentPage={meta.page}
              pageSize={meta.limit}
            />
          </div>
          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-5)', padding: '0 var(--space-4) var(--space-4)' }}>
            <div>Page {meta.page} of {totalPages}</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => setMeta(prev => ({ ...prev, page: prev.page - 1 }))}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={meta.page >= totalPages} onClick={() => setMeta(prev => ({ ...prev, page: prev.page + 1 }))}>Next</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Add Student Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Student" className="admin-students__modal-glass">
        <form onSubmit={handleAddSubmit} className="admin-students__modal-content">
          <div className="admin-students__form-group">
            <label htmlFor="add-name">Student Name *</label>
            <input id="add-name" name="name" type="text" value={addForm.name} onChange={handleAddFormChange} required />
          </div>
          <div className="admin-students__form-group">
            <label htmlFor="add-email">Email *</label>
            <input id="add-email" name="email" type="email" value={addForm.email} onChange={handleAddFormChange} required />
          </div>
          <div className="admin-students__form-group">
            <label htmlFor="add-rollNumber">Roll Number *</label>
            <input id="add-rollNumber" name="rollNumber" type="text" value={addForm.rollNumber} onChange={handleAddFormChange} required />
          </div>
          <div className="admin-students__form-row">
            <div className="admin-students__form-group">
              <label htmlFor="add-startYear">Start Year *</label>
              <input id="add-startYear" name="startYear" type="number" min="2000" max="2099" value={addForm.startYear} onChange={handleAddFormChange} required />
            </div>
            <div className="admin-students__form-group">
              <label htmlFor="add-endYear">End Year *</label>
              <input id="add-endYear" name="endYear" type="number" min="2000" max="2099" value={addForm.endYear} onChange={handleAddFormChange} required />
            </div>
          </div>
          <div className="admin-students__form-row">
            <div className="admin-students__form-group">
              <label htmlFor="add-department">Department *</label>
              <select id="add-department" name="department" value={addForm.department} onChange={handleAddFormChange} required>
                <option value="">Select department</option>
                <option value="CSE">CSE</option>
                <option value="IT">IT</option>
                <option value="ECE">ECE</option>
                <option value="EEE">EEE</option>
                <option value="MECH">MECH</option>
                <option value="CIVIL">CIVIL</option>
              </select>
            </div>
            <div className="admin-students__form-group">
              <label htmlFor="add-section">Section (Optional)</label>
              <input id="add-section" name="section" type="text" value={addForm.section} onChange={handleAddFormChange} />
            </div>
          </div>
          <div className="admin-students__modal-actions">
            <Button type="button" variant="secondary" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>Create Student</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Student Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Student">
        <form onSubmit={handleEditSubmit}>
          <div className="admin-students__form-group">
            <label htmlFor="edit-name">Student Name *</label>
            <input id="edit-name" name="name" type="text" value={editForm.name} onChange={handleEditFormChange} required />
          </div>
          <div className="admin-students__form-group">
            <label htmlFor="edit-email">Email *</label>
            <input id="edit-email" name="email" type="email" value={editForm.email} onChange={handleEditFormChange} required />
          </div>
          <div className="admin-students__form-group">
            <label htmlFor="edit-rollNumber">Roll Number *</label>
            <input id="edit-rollNumber" name="rollNumber" type="text" value={editForm.rollNumber} onChange={handleEditFormChange} required />
          </div>
          <div className="admin-students__form-row">
            <div className="admin-students__form-group">
              <label htmlFor="edit-startYear">Start Year *</label>
              <input id="edit-startYear" name="startYear" type="number" min="2000" max="2099" value={editForm.startYear} onChange={handleEditFormChange} required />
            </div>
            <div className="admin-students__form-group">
              <label htmlFor="edit-endYear">End Year *</label>
              <input id="edit-endYear" name="endYear" type="number" min="2000" max="2099" value={editForm.endYear} onChange={handleEditFormChange} required />
            </div>
          </div>
          <div className="admin-students__form-row">
            <div className="admin-students__form-group">
              <label htmlFor="edit-department">Department *</label>
              <select id="edit-department" name="department" value={editForm.department} onChange={handleEditFormChange} required>
                <option value="">Select department</option>
                <option value="CSE">CSE</option>
                <option value="IT">IT</option>
                <option value="ECE">ECE</option>
                <option value="EEE">EEE</option>
                <option value="MECH">MECH</option>
                <option value="CIVIL">CIVIL</option>
              </select>
            </div>
            <div className="admin-students__form-group">
              <label htmlFor="edit-section">Section (Optional)</label>
              <input id="edit-section" name="section" type="text" value={editForm.section} onChange={handleEditFormChange} />
            </div>
          </div>
          <div className="admin-students__modal-actions">
            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>Update Student</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => { setDeleteModalOpen(false); setDeleteError(null); }} title="Delete Student?">
        {selectedStudent ? (
          <div>
            <div className="admin-students__student" style={{ marginBottom: 'var(--space-4)' }}>
              <Avatar name={selectedStudent.name} size={40} />
              <div className="admin-students__student-info">
                <span className="admin-students__student-name">{selectedStudent.name}</span>
                <span className="admin-students__student-id">{selectedStudent.rollNumber} • {selectedStudent.email}</span>
              </div>
            </div>
            {deleteError ? (
              <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--color-danger, #dc2626)', marginBottom: '16px', fontSize: '13px' }}>
                {deleteError}
              </div>
            ) : (
              <p style={{ color: 'var(--color-danger)', margin: '0 0 var(--space-4) 0' }}>
                This will permanently remove the student account.
              </p>
            )}
            <div className="admin-students__modal-actions">
              <Button variant="secondary" onClick={() => { setDeleteModalOpen(false); setDeleteError(null); }}>Cancel</Button>
              {!deleteError && (
                <Button variant="danger" loading={submitting} onClick={handleDelete}>Delete Student</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="admin-students__empty"><p>No student selected.</p></div>
        )}
      </Modal>

      <BulkUploadModal isOpen={bulkModalOpen} onClose={() => setBulkModalOpen(false)} onSuccess={fetchStudents} />
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
