import React from 'react';
import SaasLayout from '../../components/common/SaasLayout';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';

export default function TrainerProfile() {
  const { user, logout } = useAuth();

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <SaasLayout>
      <PageHeader
        title="Trainer Profile"
        description="Your account and trainer profile information"
        actions={<Button onClick={logout}>Log out</Button>}
      />
      <Card elevation="card" style={{ padding: 'var(--space-6)' }}>
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email || 'N/A'}</p>
        <p><strong>Role:</strong> {user.role}</p>
        <p><strong>Status:</strong> {user.status}</p>
      </Card>
    </SaasLayout>
  );
}
