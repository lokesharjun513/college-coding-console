import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBatchStudents, updateStudentEnrollment } from '../../api/trainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Icon from '../../components/ui/Icon';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import StatusBadge from '../../components/trainer/StatusBadge';
import {
  TrainerErrorState,
  TrainerLoadingState,
  TrainerSectionCard,
} from '../../components/trainer';
import { NOT_AVAILABLE, formatDate } from '../../utils/trainerDisplay';
import '../../styles/pages/trainer-students.css';

/**
 * Enrollment detail — /trainer/batches/:batchId/students/:studentId
 *
 * The API exposes no single-enrollment endpoint, so the roster is fetched and
 * the matching row selected. Only enrollment status can be changed here; the
 * student's own account is read-only for a trainer.
 */
export default function EnrollmentDetails() {
  const { batchId, studentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getBatchStudents(batchId);
      const rows = res?.data?.data || [];
      const found = rows.find((row) => String(row.student?.id) === String(studentId));
      setEnrollment(found || null);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load enrollment');
    } finally {
      setLoading(false);
    }
  }, [batchId, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const applyStatus = async () => {
    if (!enrollment) return;
    const next = String(enrollment.status).toUpperCase() === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setSaving(true);
    try {
      await updateStudentEnrollment(batchId, enrollment.id, next);
      setEnrollment((prev) => ({ ...prev, status: next }));
      setConfirmOpen(false);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update enrollment');
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="trainer-page">
        <TrainerLoadingState label="Loading enrollment…" />
      </div>
    );
  }

  if (error && !enrollment) {
    return (
      <div className="trainer-page">
        <TrainerErrorState title="Couldn’t load enrollment" message={error} onRetry={load} />
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="trainer-page">
        <TrainerErrorState
          title="Enrollment not found"
          message="This student is not enrolled in the selected batch."
          retryLabel="Back to students"
          onRetry={() => navigate(`/trainer/batches/${batchId}/students`)}
        />
      </div>
    );
  }

  const isActive = String(enrollment.status).toUpperCase() === 'ACTIVE';
  const nextStatus = isActive ? 'INACTIVE' : 'ACTIVE';

  return (
    <div className="trainer-page">
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Batches', to: '/trainer/batches' },
          { label: 'Students', to: `/trainer/batches/${batchId}/students` },
          { label: enrollment.student?.name || 'Student' },
        ]}
      />

      <PageHeader
        title={enrollment.student?.name || NOT_AVAILABLE}
        description="Enrollment details for this batch"
        actions={
          <div className="trainer-page__actions">
            <StatusBadge status={enrollment.status} />
            <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
              Set to {nextStatus === 'ACTIVE' ? 'Active' : 'Inactive'}
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="trainer-notice trainer-notice--error" role="alert">
          <Icon name="alertTriangle" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <TrainerSectionCard title="Student" headingId="trainer-enrollment-student-heading">
        <div className="trainer-metric-grid trainer-section-card__body--padded">
          <Field label="Name" value={enrollment.student?.name} />
          <Field label="Email" value={enrollment.student?.email} />
          <Field label="Student ID" value={enrollment.student?.id} />
          <Field label="Enrollment Status" value={enrollment.status} />
          <Field label="Enrolled At" value={formatDate(enrollment.enrolledAt)} />
        </div>
      </TrainerSectionCard>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Change Enrollment Status">
        <p>
          Set <strong>{enrollment.student?.name}</strong> to{' '}
          <strong>{nextStatus === 'ACTIVE' ? 'Active' : 'Inactive'}</strong> in this batch?
          This changes the enrollment only — the student account is unaffected.
        </p>
        <div className="trainer-form__actions trainer-form__actions--modal">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={applyStatus} loading={saving}>
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="trainer-metric-tile">
      <p className="trainer-metric-tile__label">{label}</p>
      <p className="trainer-metric-tile__value">{value || NOT_AVAILABLE}</p>
    </div>
  );
}