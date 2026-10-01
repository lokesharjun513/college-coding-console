import React from 'react';
import { Outlet } from 'react-router-dom';
import SaasLayout from '../../components/common/SaasLayout';

/**
 * AdminLayout – wraps admin routes with the shared SaasLayout.
 */
export default function AdminLayout() {
  return (
    <SaasLayout>
      <Outlet />
    </SaasLayout>
  );
}
