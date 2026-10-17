import React from 'react';
import { Outlet } from 'react-router-dom';
import SaasLayout from '../../components/common/SaasLayout';
// Shared UI primitives (PageHeader, Modal, DataTable) render `admin-*` class names
// that are defined only in this stylesheet. It is imported here — once for the
// whole Trainer shell — rather than copied or duplicated. It is self-contained:
// every selector is `.admin-*`-scoped and every token it declares is `--admin-*`
// prefixed, so loading it introduces no global selector or token collisions.
import '../../styles/pages/admin.css';
// Centralized Trainer design system: tokens + every shared component style.
// Loaded here, above all /trainer/* routes, so pages never import it directly.
import '../../styles/trainer.css';

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