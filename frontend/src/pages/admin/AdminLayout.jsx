import React from 'react';
import { Outlet } from 'react-router-dom';
import AppShell from '../../layouts/AppShell';

/**
 * AdminLayout – wraps admin routes with the shared AppShell.
 */
export default function AdminLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
