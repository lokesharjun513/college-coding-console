import React from 'react';
import Profile from '../Profile';
import TrainerBreadcrumb from '../../components/trainer/TrainerBreadcrumb';
import PageHeader from '../../components/ui/PageHeader';

/**
 * TrainerProfile — /trainer/profile
 * Uses the shared Profile component but adds a Trainer‑specific breadcrumb
 * and page header to match the rest of the Trainer UI.
 */
export default function TrainerProfile() {
  return (
    <div className="trainer-page">
      {/* Breadcrumb navigation */}
      <TrainerBreadcrumb
        items={[
          { label: 'Trainer', to: '/trainer' },
          { label: 'Profile' },
        ]}
      />
      {/* Page header */}
      <PageHeader
        title="My Profile"
        description="Manage your personal information and account details."
        breadcrumb={<span className="admin-breadcrumb__current">Profile</span>}
      />
      {/* Profile content – read‑only view */}
      <Profile showStatus />
    </div>
  );
}
