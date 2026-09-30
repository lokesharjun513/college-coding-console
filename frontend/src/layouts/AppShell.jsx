import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Header from '../components/navigation/Header';
import Sidebar from '../components/ui/sidebar/Sidebar';
import MobileNavigation from '../components/navigation/MobileNavigation';
import { SidebarProvider } from '../components/ui/sidebar/SidebarProvider';
import '../styles/AppShell.css';
import '../styles/global.css';

/**
 * AppShell – common layout for all authenticated areas.
 * Wraps content in SidebarProvider for centralized state management.
 */
export default function AppShell({ children }) {
  // Mobile detection
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <SidebarProvider>
      <div className="app-shell">
        {!isMobile && <Sidebar />}
        <div className="app-shell__content">
          {!isMobile && <Header />}
          <main
            className="app-shell__main"
            style={{
              padding: isMobile
                ? 'var(--space-4)'
                : 'var(--space-6) var(--space-8)',
            }}
          >
            {children}
          </main>
        </div>
        {isMobile && <MobileNavigation />}
      </div>
    </SidebarProvider>
  );
}

AppShell.propTypes = {
  children: PropTypes.node.isRequired,
};
