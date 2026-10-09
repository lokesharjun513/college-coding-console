import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Header from '../navigation/Header';
import Sidebar from '../ui/sidebar/Sidebar';
import MobileNavigation from '../navigation/MobileNavigation';
import MoreSheet from '../navigation/MoreSheet';
import { SidebarProvider } from '../ui/sidebar/SidebarProvider';
import '../../styles/SaasLayout.css';
import '../../styles/global.css';
import '../../styles/MobileHeader.css';

/**
 * SaasLayout – common layout for all authenticated areas.
 * Wraps content in SidebarProvider for centralized state management.
 *
 * layoutMode:
 *  - "natural" (default): normal page flow inside app-content.
 *  - "fullscreen": shell remains present; app-content fills the viewport
 *    and the workspace controls its own padding/scroll.
 */
export default function SaasLayout({ children, layoutMode = 'natural' }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="app-shell" data-layout={layoutMode}>
        <div className="app-shell__ambient" />

        <Sidebar />

        <div className="app-shell__main">
          <Header />
          <main className="app-content">
            {children}
          </main>
        </div>

        <MobileNavigation onMoreClick={() => setIsMoreOpen(true)} isMoreOpen={isMoreOpen} />
        <MoreSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
      </div>
    </SidebarProvider>
  );
}

SaasLayout.propTypes = {
  children: PropTypes.node.isRequired,
  layoutMode: PropTypes.oneOf(['natural', 'fullscreen']),
};
