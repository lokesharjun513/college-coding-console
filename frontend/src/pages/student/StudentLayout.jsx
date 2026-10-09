import React from 'react';
import PropTypes from 'prop-types';
import { Outlet } from 'react-router-dom';
import SaasLayout from '../../components/common/SaasLayout';

/**
 * StudentLayout – wraps student routes with the shared SaasLayout.
 */
export default function StudentLayout({ layoutMode = 'natural' }) {
  return (
    <SaasLayout layoutMode={layoutMode}>
      <Outlet />
    </SaasLayout>
  );
}

StudentLayout.propTypes = {
  layoutMode: PropTypes.oneOf(['natural', 'fullscreen']),
};
