import React from 'react';
import PropTypes from 'prop-types';
import SaasLayout from '../components/common/SaasLayout';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import PageHeader from '../components/ui/PageHeader';
import Avatar from '../components/ui/Avatar';
import StatusBadge from '../components/trainer/StatusBadge';
import { TrainerSectionCard } from '../components/trainer';
import { NOT_AVAILABLE } from '../utils/trainerDisplay';
import '../styles/trainer.css';
import '../styles/pages/admin.css';

/**
 * Profile — one implementation shared by /trainer/profile and /profile.
 *
 * A trainer cannot edit their own account: there is no self-service update
 * endpoint, and profile changes are admin-only. This page is therefore
 * read-only apart from sign-out.
 */
export default function Profile({ showStatus = false }) {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <SaasLayout>
        <div className="trainer-page">
          <p className="trainer-table__muted">Loading…</p>
        </div>
      </SaasLayout>
    );
  }

  return (
    <SaasLayout>
      <div className="trainer-page">
        <PageHeader
          title="Profile"
          description="Your account information"
          breadcrumb={<span className="admin-breadcrumb__current">Profile</span>}
          actions={
            <div className="trainer-page__actions">
              <Button onClick={logout}>
                <Icon name="logOut" size={14} />
                Log out
              </Button>
            </div>
          }
        />

        <TrainerSectionCard title="Account" headingId="profile-account-heading">
          <div className="trainer-section-card__body--padded">
            <div className="trainer-profile-head">
              <Avatar name={user.name || ''} size={56} />
              <div>
                <p className="trainer-profile-head__name">{user.name || NOT_AVAILABLE}</p>
                <p className="trainer-table__muted">{user.email || NOT_AVAILABLE}</p>
              </div>
              {showStatus ? <StatusBadge status={user.status} /> : null}
            </div>

            <div className="trainer-metric-grid">
              <div className="trainer-metric-tile">
                <p className="trainer-metric-tile__label">Role</p>
                <p className="trainer-metric-tile__value">{user.role || NOT_AVAILABLE}</p>
              </div>
              <div className="trainer-metric-tile">
                <p className="trainer-metric-tile__label">Email</p>
                <p className="trainer-metric-tile__value">{user.email || NOT_AVAILABLE}</p>
              </div>
              {showStatus ? (
                <div className="trainer-metric-tile">
                  <p className="trainer-metric-tile__label">Status</p>
                  <p className="trainer-metric-tile__value">{user.status || NOT_AVAILABLE}</p>
                </div>
              ) : null}
            </div>
          </div>
        </TrainerSectionCard>
      </div>
    </SaasLayout>
  );
}

Profile.propTypes = {
  showStatus: PropTypes.bool,
};

Profile.defaultProps = { showStatus: false };