import React from 'react';
import { Outlet } from 'react-router-dom';
import AppShell from '../../layouts/AppShell';

/**
 * TrainerLayout – wraps trainer routes with the shared AppShell.
 */
export default function TrainerLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
