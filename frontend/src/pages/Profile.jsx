import React from 'react';
import AppShell from '../layouts/AppShell';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';

export default function Profile() {
  const { user, logout } = useAuth();

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <AppShell>
      <PageHeader
        title="Profile"
        description="Your account information"
        actions={<Button onClick={logout}>Log out</Button>}
      />
      <Card elevation="card" style={{ padding: 'var(--space-6)' }}>
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Role:</strong> {user.role}</p>
        <p><strong>Email:</strong> {user.email || 'N/A'}</p>
      </Card>
    </AppShell>
  );
}
