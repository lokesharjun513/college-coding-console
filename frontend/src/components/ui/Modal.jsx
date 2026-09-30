import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * Modal – basic portal‑style modal.
 * Renders children inside a centered dialog with backdrop.
 */
export default function Modal({ isOpen, onClose, title, children }) {
  const [show, setShow] = React.useState(isOpen);

  // Handle escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (show) {
      document.addEventListener('keydown', handleKey);
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [show, onClose]);

  // Trigger animation on open/close
  useEffect(() => {
    if (isOpen) {
      setShow(true);
    } else {
      // wait for animation before removing
      const timer = setTimeout(() => setShow(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!show) return null;

  const backdropStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    opacity: isOpen ? 1 : 0,
    transition: 'opacity var(--duration-fast) var(--ease-out)',
  };

  const dialogStyle = {
    backgroundColor: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-modal)',
    maxWidth: '90%',
    width: '400px',
    padding: 'var(--space-5)',
    transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(6px)',
    opacity: isOpen ? 1 : 0,
    transition: 'transform var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out)',
  };

  return (
    <div style={backdropStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={dialogStyle} onClick={e => e.stopPropagation()}>
        {title && <h2 style={{ marginTop: 0 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node.isRequired,
};
