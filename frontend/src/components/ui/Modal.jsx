import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * Modal – basic portal‑style modal.
 * Renders children inside a centered dialog with backdrop.
 */
export default function Modal({ isOpen, onClose, title, children }) {
  const [show, setShow] = React.useState(isOpen);

  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Handle escape key and focus management
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
      }
    };

    if (!show) return;

    document.addEventListener('keydown', handleKey);

    // Save current focus and focus modal
    previousFocus.current = document.activeElement;
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKey);

      // Restore focus
      if (previousFocus.current) {
        previousFocus.current.focus();
      }
    };
  }, [show]);

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
    opacity: isOpen ? 1 : 0,
    transition: 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  };

  const dialogStyle = {
    transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(10px)',
    opacity: isOpen ? 1 : 0,
    transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  };

  return (
    <div className="admin-modal-overlay" style={backdropStyle} onClick={onClose} role="presentation">
      <div className="admin-modal" style={dialogStyle} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title || undefined} ref={dialogRef} tabIndex="-1">
        {title && (
          <div className="admin-modal__header">
            <h2 className="admin-modal__title">{title}</h2>
            <button className="admin-modal__close" onClick={onClose} aria-label="Close modal">&times;</button>
          </div>
        )}
        <div className="admin-modal__body">
          {children}
        </div>
      </div>
    </div>
  );
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node,
};
