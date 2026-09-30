import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBatchStudents, updateStudentEnrollment } from '../../api/trainer';
import Spinner from '../../components/ui/Spinner';

export default function EnrollmentDetails() {
  const { batchId, studentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enrollment, setEnrollment] = useState(null);

  // Find enrollment
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getBatchStudents(batchId);
        const enrollments = res.data?.data || [];
        const found = enrollments.find(e => e.student?.id === studentId);
        setEnrollment(found);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to load enrollment');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [batchId, studentId]);

  if (loading) return <Spinner />;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!enrollment) return <p>Enrollment not found.</p>;

  const handleStatusUpdate = async () => {
    const newStatus = enrollment.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (!window.confirm(`Set enrollment status to ${newStatus}?`)) return;
    try {
      await updateStudentEnrollment(batchId, enrollment.id, newStatus);
      setEnrollment(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update enrollment');
    }
  };

  return (
    <div>
      <h2>Enrollment Details</h2>
      <p><strong>Student:</strong> {enrollment.student?.name}</p>
      <p><strong>Email:</strong> {enrollment.student?.email}</p>
      <p><strong>Status:</strong> {enrollment.status}</p>
      <p><strong>Enrolled At:</strong> {enrollment.enrolledAt ? new Date(enrollment.enrolledAt).toLocaleDateString() : 'N/A'}</p>
      <div style={{ marginTop: '1rem' }}>
        <button onClick={handleStatusUpdate}>
          Toggle Status to {enrollment.status === 'ACTIVE' ? 'Inactive' : 'Active'}
        </button>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <Link to={`/trainer/batches/${batchId}/students`}>Back to Students</Link>
      </div>
    </div>
  );
}
