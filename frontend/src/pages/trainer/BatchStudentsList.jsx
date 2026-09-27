import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBatchStudents, enrollStudent, updateStudentEnrollment, deleteStudentEnrollment } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function BatchStudentsList() {
  const { batchId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [newStudentId, setNewStudentId] = useState('');
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getBatchStudents(batchId);
        setStudents(res.data?.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load students');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [batchId]);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div>
      <h2>Batch Students</h2>
      {/* Enrollment form */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newStudentId) return;
          setEnrollLoading(true);
          setEnrollError(null);
          try {
            await enrollStudent(batchId, newStudentId);
            // Refresh list
            const res = await getBatchStudents(batchId);
            setStudents(res.data?.data || []);
            setNewStudentId('');
          } catch (err) {
            setEnrollError(err?.response?.data?.message || 'Failed to enroll student');
          } finally {
            setEnrollLoading(false);
          }
        }}
        style={{ marginBottom: '1rem' }}
      >
        <input
          type="text"
          placeholder="Student ID"
          value={newStudentId}
          onChange={(e) => setNewStudentId(e.target.value)}
          disabled={enrollLoading}
          style={{ marginRight: '0.5rem' }}
        />
        <button type="submit" disabled={enrollLoading}>
          {enrollLoading ? 'Enrolling…' : 'Enroll Student'}
        </button>
        {enrollError && <div style={{ color: 'red' }}>{enrollError}</div>}
      </form>
      {students.length === 0 ? (
        <p>No students enrolled.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Email</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Status</th>
              <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((enrollment) => (
              <tr key={enrollment.id}>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{enrollment.student.name}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{enrollment.student.email}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                  <Link to={`/trainer/batches/${batchId}/students/${enrollment.student.id}/performance`}>View Performance</Link>
                </td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{enrollment.status}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
                  <button
                    onClick={async () => {
                      const newStatus = enrollment.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
                      try {
                        await updateStudentEnrollment(batchId, enrollment.id, newStatus);
                        // Refresh list
                        const res = await getBatchStudents(batchId);
                        setStudents(res.data?.data || []);
                      } catch (err) {}
                    }}
                    style={{ marginRight: '0.5rem' }}
                  >
                    Set {enrollment.status === 'ACTIVE' ? 'Inactive' : 'Active'}
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Remove this student?')) return;
                      try {
                        await deleteStudentEnrollment(batchId, enrollment.id);
                        const res = await getBatchStudents(batchId);
                        setStudents(res.data?.data || []);
                      } catch (err) {}
                    }}
                    style={{ color: 'red' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
