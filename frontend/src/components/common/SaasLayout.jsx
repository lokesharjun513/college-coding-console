import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Header from '../../components/navigation/Header';
import Sidebar from '../../components/ui/sidebar/Sidebar';
import MobileNavigation from '../../components/navigation/MobileNavigation';
import MoreSheet from '../../components/navigation/MoreSheet';
import { SidebarProvider } from '../../components/ui/sidebar/SidebarProvider';
import '../../styles/SaasLayout.css';
import '../../styles/global.css';
import '../../styles/MobileHeader.css';

/**
 * SaasLayout – common layout for all authenticated areas.
 * Wraps content in SidebarProvider for centralized state management.
 */
export default function SaasLayout({ children }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="app-shell" data-layout={children.props?.className?.includes('free-console') ? 'fullscreen' : 'natural'}>
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
};
