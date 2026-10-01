import React from 'react';
import { Outlet } from 'react-router-dom';
import SaasLayout from '../../components/common/SaasLayout';

/**
 * StudentLayout – wraps student routes with the shared SaasLayout.
 */
export default function StudentLayout() {
  return (
    <SaasLayout>
      <Outlet />
    </SaasLayout>
  );
}
