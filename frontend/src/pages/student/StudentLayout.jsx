import React from 'react';
import PropTypes from 'prop-types';
import { Outlet } from 'react-router-dom';
import SaasLayout from '../../components/common/SaasLayout';
import RouteErrorBoundary from '../../components/common/RouteErrorBoundary';

/**
 * StudentLayout – wraps student routes with the shared SaasLayout.
 *
 * The outlet is wrapped in a route-level error boundary. A render exception
 * inside any Student page unmounts the entire React tree by default, which
 * presents to the user as a blank screen with no way back — the navigation that
 * would get them out is unmounted too. The boundary sits INSIDE SaasLayout so
 * the shell and navigation survive, and it logs the real error rather than
 * swallowing it.
 */
export default function StudentLayout({ layoutMode = 'natural' }) {
  return (
    <SaasLayout layoutMode={layoutMode}>
      <RouteErrorBoundary>
        <Outlet />
      </RouteErrorBoundary>
    </SaasLayout>
  );
}

StudentLayout.propTypes = {
  layoutMode: PropTypes.oneOf(['natural', 'fullscreen']),
};