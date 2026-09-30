import React, { useEffect, useState, useCallback } from 'react';
import DataTable from '../../components/ui/DataTable';
import TableActions from '../../components/ui/table/TableActions';
import { Pencil, Trash2, Lock } from 'lucide-react';
import '../../styles/pages/admin-users.css';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { getUsers, createUser, updateUser, deleteUser } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'TRAINER', status: 'ACTIVE' });
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [deleteId, setDeleteId] = useState(null);
  const [deleteName, setDeleteName] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: meta.page,
        limit: meta.limit,
      };
      if (searchTerm) params.search = searchTerm;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await getUsers(params);
      setUsers(res.data?.data || []);
      setMeta(res.data?.meta || { page: 1, limit: 10, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, roleFilter, statusFilter, meta.page, meta.limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => {
    setForm({ name: '', email: '', password: '', role: 'TRAINER', status: 'ACTIVE' });
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (user) => {
    if (user.role === 'ADMIN') {
      setToast({ message: 'Administrator accounts are protected.', type: 'error' });
      return;
    }
    setForm({ name: user.name, email: user.email, password: '', role: user.role, status: user.status });
    setEditing(user);
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        const payload = {
          name: form.name,
          email: form.email,
          status: form.status,
        };
        if (['TRAINER', 'STUDENT'].includes(form.role)) {
          payload.role = form.role;
        }
        await updateUser(editing.id, payload);
        setToast({ message: 'User updated successfully', type: 'success' });
      } else {
        await createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          status: form.status,
        });
        setToast({ message: 'User created successfully', type: 'success' });
      }
      setModalOpen(false);
      await fetchUsers();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Operation failed', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (id, name) => {
    setDeleteId(id);
    setDeleteName(name);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteUser(deleteId);
      setToast({ message: 'User deleted', type: 'success' });
      await fetchUsers();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Delete failed', type: 'error' });
    } finally {
      setDeleteModalOpen(false);
      setDeleteId(null);
      setDeleteName('');
    }
  };

  const columns = [
    { key: 'no', header: 'S.No.' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'status', header: 'Status' },
    {
      key: 'createdAt',
      header: 'Created',
      formatter: (value) => (value ? new Date(value).toLocaleDateString() : ''),
    },
    { key: 'actions', header: 'Actions' },
  ];

  // Helper to generate rows for a given user list
  const generateRows = (list) =>
    list.map((u, idx) => {
      const isCurrent = currentUser && u.id === currentUser.id;
      return {
        id: u.id,
        no: idx + 1,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        actions: (
          u.role === 'ADMIN' ? (
            <div title="Administrator accounts are protected." style={{ display: 'flex', alignItems: 'center' }}>
              <Lock size={16} style={{ color: 'var(--color-muted)' }} />
              <span style={{ marginLeft: 'var(--space-2)' }}>Protected</span>
            </div>
          ) : isCurrent ? (
            <div title="Current user cannot modify own account." style={{ display: 'flex', alignItems: 'center' }}>
              <Lock size={16} style={{ color: 'var(--color-muted)' }} />
              <span style={{ marginLeft: 'var(--space-2)' }}>Current User</span>
            </div>
          ) : (
            <TableActions
              actions={[
                {
                  label: `Edit ${u.name}`,
                  icon: Pencil,
                  onClick: () => openEdit(u),
                },
                {
                  label: `Delete ${u.name}`,
                  icon: Trash2,
                  onClick: () => confirmDelete(u.id, u.name),
                  variant: 'danger',
                },
              ]}
            />
          )
        ),
      };
    });

  const adminUsers = users.filter(u => u.role === 'ADMIN');
  const trainerUsers = users.filter(u => u.role === 'TRAINER');
  const studentUsers = users.filter(u => u.role === 'STUDENT');

  const adminRows = generateRows(adminUsers);
  const trainerRows = generateRows(trainerUsers);
  const studentRows = generateRows(studentUsers);

  // Summary metrics derived from current data
  const totalUsers = meta.total;
  const activeUsers = users.filter(u => u.status === 'ACTIVE').length;
  const trainerCount = trainerUsers.length;
  const studentCount = studentUsers.length;

  return (
    <div className="admin-users">
      <PageHeader
        className="admin-users__header"
        title="Users"
        description="Manage platform users, roles, and account status."
        actions={<Button onClick={openCreate}>+ Add User</Button>}
      />
      {/* Summary KPI cards */}
      <div className="admin-users__summary">
        <Card className="admin-users__summary-card">
          <h3>Total Users</h3>
          <p>{totalUsers}</p>
        </Card>
        <Card className="admin-users__summary-card">
          <h3>Active Users</h3>
          <p>{activeUsers}</p>
        </Card>
        <Card className="admin-users__summary-card">
          <h3>Trainers</h3>
          <p>{trainerCount}</p>
        </Card>
        <Card className="admin-users__summary-card">
          <h3>Students</h3>
          <p>{studentCount}</p>
        </Card>
      </div>
      {/* Toolbar */}
      <div className="admin-users__toolbar">
        <input
          type="text"
          placeholder="Search users..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="admin-users__search"
          aria-label="Search users"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="admin-users__select"
          aria-label="Filter by role"
        >
          <option value="">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="TRAINER">Trainer</option>
          <option value="STUDENT">Student</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="admin-users__select"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {(searchTerm || roleFilter || statusFilter) && (
          <Button variant="secondary" size="sm" onClick={() => { setSearchTerm(''); setRoleFilter(''); setStatusFilter(''); }}>
            Clear Filters
          </Button>
        )}
      </div>

      {loading && <Skeleton width="100%" height="var(--space-8)" className="admin-users__skeleton" />}
      {error && (
        <div className="admin-users__error" role="alert">
          {error}
          <Button variant="secondary" size="sm" onClick={fetchUsers} className="admin-users__retry">
            Retry
          </Button>
        </div>
      )}
      {!loading && !error && (
        <>
          {/* ADMIN USERS */}
          <section className="admin-users__section">
            <h2 className="admin-users__section-title">ADMIN USERS</h2>
            <p className="admin-users__section-description">Administrator accounts are protected and cannot be modified or deleted.</p>
            <Card elevation="card" className="admin-users__card">
              {adminRows.length === 0 ? (
                <EmptyState
                  message="No admin users found"
                  actionLabel="Add User"
                  onAction={openCreate}
                />
              ) : (
                <DataTable
                  columns={columns}
                  data={adminRows}
                  loading={false}
                  error={null}
                  emptyMessage="No admin users available."
                  showSNo={true}
                  className="admin-users__table"
                />
              )}
            </Card>
          </section>

          {/* TRAINERS */}
          <section className="admin-users__section">
            <h2 className="admin-users__section-title">TRAINERS</h2>
            <Card elevation="card" className="admin-users__card">
              {trainerRows.length === 0 ? (
                <EmptyState
                  message="No trainers found"
                  actionLabel="Add User"
                  onAction={openCreate}
                />
              ) : (
                <DataTable
                  columns={columns}
                  data={trainerRows}
                  loading={false}
                  error={null}
                  emptyMessage="No trainers available."
                  showSNo={true}
                  className="admin-users__table"
                />
              )}
            </Card>
          </section>

          {/* STUDENTS */}
          <section className="admin-users__section">
            <h2 className="admin-users__section-title">STUDENTS</h2>
            <Card elevation="card" className="admin-users__card">
              {studentRows.length === 0 ? (
                <EmptyState
                  message="No students found"
                  actionLabel="Add User"
                  onAction={openCreate}
                />
              ) : (
                <DataTable
                  columns={columns}
                  data={studentRows}
                  loading={false}
                  error={null}
                  emptyMessage="No students available."
                  showSNo={true}
                  className="admin-users__table"
                />
              )}
            </Card>
          </section>

          {/* Pagination */}
          <div className="admin-users__pagination">
            <div>
              Page {meta.page} of {meta.totalPages || 1}
            </div>
            <div className="admin-users__pagination-controls">
              <Button
                variant="secondary"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setMeta(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setMeta(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete User" className="admin-users__modal">
        <p>Are you sure you want to delete <strong>{deleteName}</strong>? This action cannot be undone.</p>
        <div className="admin-users__modal-actions">
          <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>

      {/* Create / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Create User'} className="admin-users__modal">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="name" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 'var(--font-weight-medium)' }}>Name</label>
            <input id="name" name="name" type="text" value={form.name} onChange={handleChange} required style={{ width: '100%', padding: 'var(--space-2)', border: `1px solid var(--color-border)`, borderRadius: 'var(--radius-sm)' }} />
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="email" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 'var(--font-weight-medium)' }}>Email</label>
            <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required style={{ width: '100%', padding: 'var(--space-2)', border: `1px solid var(--color-border)`, borderRadius: 'var(--radius-sm)' }} />
          </div>
          {/* Password only on create */}
          {!editing && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label htmlFor="password" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 'var(--font-weight-medium)' }}>Password</label>
              <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required minLength={8} style={{ width: '100%', padding: 'var(--space-2)', border: `1px solid var(--color-border)`, borderRadius: 'var(--radius-sm)' }} />
            </div>
          )}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="role" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 'var(--font-weight-medium)' }}>Role</label>
            <select id="role" name="role" value={form.role} onChange={handleChange} required style={{ width: '100%', padding: 'var(--space-2)', border: `1px solid var(--color-border)`, borderRadius: 'var(--radius-sm)' }}>
              <option value="TRAINER">Trainer</option>
              <option value="STUDENT">Student</option>
            </select>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="status" style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 'var(--font-weight-medium)' }}>Status</label>
            <select id="status" name="status" value={form.status} onChange={handleChange} required style={{ width: '100%', padding: 'var(--space-2)', border: `1px solid var(--color-border)`, borderRadius: 'var(--radius-sm)' }}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
