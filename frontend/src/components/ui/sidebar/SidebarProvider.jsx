import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

const SidebarContext = createContext(null);

const STORAGE_KEY = 'sidebar_collapsed';

/**
 * SidebarProvider – manages sidebar expanded/collapsed state.
 *
 * Provides:
 *   collapsed  – boolean; true = collapsed (72px), false = expanded (260px)
 *   toggle      – toggle between states
 *   setCollapsed(v)
 *
 * State persists to localStorage. Keyboard shortcut Ctrl+B / Cmd+B toggles.
 */
export function SidebarProvider({ children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === 'true';
      // eslint-disable-next-line no-empty
    } catch {}
    return defaultCollapsed;
  });

  // Sync to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
      // eslint-disable-next-line no-empty
    } catch {}
  }, [collapsed]);

  // Keyboard shortcut Ctrl+B / Cmd+B
  useEffect(() => {
    const handler = (e) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === 'b') {
        e.preventDefault();
        setCollapsed(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const toggle = useCallback(() => setCollapsed(prev => !prev), []);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider');
  return context;
}

SidebarProvider.propTypes = {
  children: PropTypes.node.isRequired,
  defaultCollapsed: PropTypes.bool,
};
