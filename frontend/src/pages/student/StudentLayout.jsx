import React from 'react';
import { Outlet } from 'react-router-dom';
import AppShell from '../../layouts/AppShell';

/**
 * StudentLayout – wraps student routes with the shared AppShell.
 */
export default function StudentLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
