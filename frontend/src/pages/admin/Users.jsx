import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import TableActions from '../../components/ui/table/TableActions';
import { Users as UsersIcon, UserCheck, UserRound, GraduationCap, Pencil, Trash2, LockKeyhole, ChevronRight, UserPlus, Search } from 'lucide-react';
import '../../styles/pages/admin.css';
import '../../styles/pages/admin-users.css';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { getUsers, createUser, updateUser, deleteUser } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';

export default function Users() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
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
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
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
      setMeta(res.data?.meta || { page: 1, limit: 20, total: 0, totalPages: 0 });
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
    // Prevent editing of admin accounts and own account
    if (user.role === 'ADMIN' || (currentUser && user.id === currentUser.id)) {
      setToast({ message: 'This account is protected.', type: 'error' });
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
      setToast({ message: 'User deleted successfully', type: 'success' });
      await fetchUsers();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || 'Delete failed', type: 'error' });
    } finally {
      setDeleteModalOpen(false);
      setDeleteId(null);
      setDeleteName('');
    }
  };

  const getInitials = (name) => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Helper to generate rows for a given user list
  const generateRows = (list) =>
    list.map((u, idx) => {
      const isProtected = u.role === 'ADMIN' || (currentUser && u.id === currentUser.id);
      return {
        id: u.id,
        no: (meta.page - 1) * meta.limit + idx + 1,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        actions: (
          isProtected ? (
            <TableActions
              actions={[
                {
                  label: 'Account is protected',
                  icon: LockKeyhole,
                  onClick: () => {},
                  disabled: true,
                },
              ]}
            />
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

  if (loading) {
    return (
      <div className="admin-users">
        <div className="admin-users__skeleton-card" />
        <div className="admin-users__skeleton-card" />
        <div className="admin-users__skeleton-card" />
        <div className="admin-users__skeleton-card" />
        <div className="admin-users__skeleton-row" />
        <div className="admin-users__skeleton-row" />
        <div className="admin-users__skeleton-row" />
        <div className="admin-users__skeleton-row" />
        <div className="admin-users__skeleton-row" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-users__error-state">
        <div>{error}</div>
        <Button variant="secondary" size="sm" onClick={fetchUsers}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="admin-users">
      {/* Page Header */}
      <div className="admin-users__page-header">
        <nav className="admin-breadcrumb" aria-label="Breadcrumb">
          <Link to="/admin" className="admin-breadcrumb__item">Home</Link>
          <span className="admin-breadcrumb__separator">/</span>
          <span className="admin-breadcrumb__current" aria-current="page">Users</span>
        </nav>
        <div className="admin-users__header">
          <div className="admin-users__header-left">
            <h1 className="admin-trainers__title">Users</h1>
            <p className="admin-users__header-description">
              Manage platform users, roles, and account status.
            </p>
          </div>
          <div className="admin-users__header-actions">
            <Button onClick={openCreate} className="admin-users__add-btn">
              <UserPlus size={16} />
              Add User
            </Button>
          </div>
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="admin-dashboard__kpi-grid">
        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Total Users</span>
            <div className="admin-dashboard__stat-icon"><UsersIcon size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{totalUsers}</div>
          <div className="admin-dashboard__stat-meta">All registered users</div>
        </div>

        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Active Users</span>
            <div className="admin-dashboard__stat-icon"><UserCheck size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{activeUsers}</div>
          <div className="admin-dashboard__stat-meta">Currently active accounts</div>
        </div>

        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Trainers</span>
            <div className="admin-dashboard__stat-icon"><GraduationCap size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{trainerCount}</div>
          <div className="admin-dashboard__stat-meta">Registered trainers</div>
        </div>

        <div className="admin-dashboard__stat-card">
          <div className="admin-dashboard__stat-header">
            <span className="admin-dashboard__stat-label">Students</span>
            <div className="admin-dashboard__stat-icon"><UserRound size={18} /></div>
          </div>
          <div className="admin-dashboard__stat-value">{studentCount}</div>
          <div className="admin-dashboard__stat-meta">Registered students</div>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="admin-users__toolbar">
        <div className="admin-users__search-wrapper">
          <Search className="admin-users__search-icon" size={16} />
          <input
            type="text"
            placeholder="Search users by name, email, or role..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="admin-users__search"
            aria-label="Search users"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="admin-users__filter"
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
          className="admin-users__filter"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {(searchTerm || roleFilter || statusFilter) && (
          <Button variant="secondary" size="sm" onClick={() => {
            setSearchTerm("");
            setRoleFilter("");
            setStatusFilter("");
          }}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* User Sections */}
      <div className="admin-users__section-wrapper">
        {/* ADMIN USERS */}
        <section className="admin-users__section-card">
          <div className="admin-users__section-header">
            <div className="admin-users__section-heading">
              <div className="admin-users__section-icon admin-users__section-icon--admin">
                <UsersIcon size={16} />
              </div>
              <div>
                <h2 className="admin-users__section-title">Admin Users</h2>
              </div>
            </div>
            <div className="admin-users__section-count">
              {adminUsers.length} Admins
              <ChevronRight size={14} />
            </div>
          </div>

           {adminUsers.length === 0 ? (
             <EmptyState
               message="No admin users found"
               actionLabel="Add User"
               onAction={openCreate}
             />
           ) : (
             <div className="admin-users__table-wrapper">
               <table className="admin-table">
                 <thead>
                   <tr>
                     <th>S.No.</th>
                     <th>NAME</th>
                     <th>ROLE</th>
                     <th>STATUS</th>
                     <th>CREATED</th>
                     <th className="admin-users__actions-header">ACTIONS</th>
                   </tr>
                 </thead>
                 <tbody>
                   {adminRows.map((row) => (
                     <tr key={row.id}>
                       <td>{row.no}</td>
                       <td className="admin-users__user-cell">
                         <div className="admin-users__avatar admin-users__avatar--admin">
                           {getInitials(row.name)}
                         </div>
                         <div>
                           <div className="admin-users__user-name">{row.name}</div>
                           <div className="admin-users__user-email">{row.email}</div>
                         </div>
                       </td>
                       <td>
                         <span className="admin-users__role-badge admin-users__role-badge--admin">
                           {row.role}
                         </span>
                       </td>
                       <td>
                         <span className={`admin-badge admin-badge--${row.status.toLowerCase()}`}>
                           {row.status}
                         </span>
                       </td>
                       <td className="admin-users__date">
                         {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
                       </td>
                       <td className="batch-actions-cell">{row.actions}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           )}
        </section>

        {/* TRAINERS */}
        <section className="admin-users__section-card">
          <div className="admin-users__section-header">
            <div className="admin-users__section-heading">
              <div className="admin-users__section-icon admin-users__section-icon--trainer">
                <GraduationCap size={16} />
              </div>
              <div>
                <h2 className="admin-users__section-title">Trainers</h2>
              </div>
            </div>
            <div className="admin-users__section-count">
              {trainerUsers.length} Trainers
              <ChevronRight size={14} />
            </div>
          </div>

           {trainerUsers.length === 0 ? (
             <EmptyState
               message="No trainers found"
               actionLabel="Add User"
               onAction={openCreate}
             />
           ) : (
             <div className="admin-users__table-wrapper">
               <table className="admin-table">
                 <thead>
                   <tr>
                     <th>S.No.</th>
                     <th>NAME</th>
                     <th>ROLE</th>
                     <th>STATUS</th>
                     <th>CREATED</th>
                     <th className="admin-users__actions-header">ACTIONS</th>
                   </tr>
                 </thead>
                 <tbody>
                   {trainerRows.map((row) => (
                     <tr key={row.id}>
                       <td>{row.no}</td>
                       <td className="admin-users__user-cell">
                         <div className="admin-users__avatar admin-users__avatar--trainer">
                           {getInitials(row.name)}
                         </div>
                         <div>
                           <div className="admin-users__user-name">{row.name}</div>
                           <div className="admin-users__user-email">{row.email}</div>
                         </div>
                       </td>
                       <td>
                         <span className="admin-users__role-badge admin-users__role-badge--trainer">
                           {row.role}
                         </span>
                       </td>
                       <td>
                         <span className={`admin-badge admin-badge--${row.status.toLowerCase()}`}>
                           {row.status}
                         </span>
                       </td>
                       <td className="admin-users__date">
                         {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
                       </td>
                       <td className="batch-actions-cell">{row.actions}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           )}
        </section>

        {/* STUDENTS */}
        <section className="admin-users__section-card">
          <div className="admin-users__section-header">
            <div className="admin-users__section-heading">
              <div className="admin-users__section-icon admin-users__section-icon--student">
                <UserRound size={16} />
              </div>
              <div>
                <h2 className="admin-users__section-title">Students</h2>
              </div>
            </div>
            <div className="admin-users__section-count">
              {studentUsers.length} Students
              <ChevronRight size={14} />
            </div>
          </div>

           {studentUsers.length === 0 ? (
             <EmptyState
               message="No students found"
               actionLabel="Add User"
               onAction={openCreate}
             />
           ) : (
             <>
               <div className="admin-users__table-wrapper">
                 <table className="admin-table">
                   <thead>
                     <tr>
                       <th>S.No.</th>
                       <th>NAME</th>
                       <th>ROLE</th>
                       <th>STATUS</th>
                       <th>CREATED</th>
                       <th className="admin-users__actions-header">ACTIONS</th>
                     </tr>
                   </thead>
                   <tbody>
                     {studentRows.map((row) => (
                       <tr key={row.id}>
                         <td>{row.no}</td>
                         <td className="admin-users__student-name-cell">
                           <div className="admin-users__student-user">
                             <div className="admin-users__student-avatar">
                               {getInitials(row.name)}
                             </div>
                             <div className="admin-users__student-info">
                               <div className="admin-users__student-name">{row.name}</div>
                               <div className="admin-users__student-email">{row.email}</div>
                             </div>
                           </div>
                         </td>
                         <td>
                           <span className="admin-users__role-badge admin-users__role-badge--student">
                             {row.role}
                           </span>
                         </td>
                         <td>
                           <span className={`admin-badge admin-badge--${row.status.toLowerCase()}`}>
                             {row.status}
                           </span>
                         </td>
                         <td className="admin-users__date">
                           {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
                         </td>
                         <td className="batch-actions-cell">{row.actions}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
               <div className="admin-users__pagination">
                 <div className="admin-users__pagination-info">
                   Showing {studentUsers.length > 0 ? (meta.page - 1) * meta.limit + 1 : 0} to {
                     (meta.page - 1) * meta.limit + studentUsers.length
                   } of {roleFilter === 'STUDENT' ? meta.total : studentUsers.length} Students
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
        </section>
      </div>

      {/* Delete Confirmation Modal */}
<Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete User">
         <div className="admin-modal__body">
           Are you sure you want to delete <strong>{deleteName}</strong>? This action cannot be undone.
         </div>
         <div className="admin-modal__footer">
           <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
             Cancel
           </Button>
           <Button variant="danger" onClick={handleDelete}>
             Delete
           </Button>
         </div>
       </Modal>

      {/* Create / Edit Modal */}
<Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Create User'}>
         <div className="admin-modal__body">
           <form onSubmit={handleSubmit}>
             <div className="admin-users__form-field">
               <label className="admin-users__form-label">Name</label>
               <input
                 id="name"
                 name="name"
                 type="text"
                 value={form.name}
                 onChange={handleChange}
                 required
                 className="admin-users__form-input"
               />
             </div>
             <div className="admin-users__form-field">
               <label className="admin-users__form-label">Email</label>
               <input
                 id="email"
                 name="email"
                 type="email"
                 value={form.email}
                 onChange={handleChange}
                 required
                 className="admin-users__form-input"
               />
             </div>
             {/* Password only on create */}
             {!editing && (
               <div className="admin-users__form-field">
                 <label className="admin-users__form-label">Password</label>
                 <input
                   id="password"
                   name="password"
                   type="password"
                   value={form.password}
                   onChange={handleChange}
                   required
                   minLength={8}
                   className="admin-users__form-input"
                 />
               </div>
             )}
             <div className="admin-users__form-field">
               <label className="admin-users__form-label">Role</label>
               <select
                 id="role"
                 name="role"
                 value={form.role}
                 onChange={handleChange}
                 required
                 className="admin-users__form-select"
               >
                 <option value="TRAINER">Trainer</option>
                 <option value="STUDENT">Student</option>
               </select>
             </div>
             <div className="admin-users__form-field">
               <label className="admin-users__form-label">Status</label>
               <select
                 id="status"
                 name="status"
                 value={form.status}
                 onChange={handleChange}
                 required
                 className="admin-users__form-select"
               >
                 <option value="ACTIVE">Active</option>
                 <option value="INACTIVE">Inactive</option>
               </select>
             </div>
             <div className="admin-modal__footer">
               <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                 Cancel
               </Button>
               <Button type="submit" disabled={submitting}>
                 {submitting ? 'Saving…' : 'Save'}
               </Button>
             </div>
           </form>
         </div>
       </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}