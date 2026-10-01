import React from 'react';
import { Outlet } from 'react-router-dom';
import SaasLayout from '../../components/common/SaasLayout';

/**
 * TrainerLayout – wraps trainer routes with the shared SaasLayout.
 */
export default function TrainerLayout() {
  return (
    <SaasLayout>
      <Outlet />
    </SaasLayout>
  );
}
