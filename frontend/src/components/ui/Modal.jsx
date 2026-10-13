import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

export function ModalHeader({ children }) {
  return <div className="admin-modal__header"><h2 className="admin-modal__title">{children}</h2></div>;
}

export function ModalBody({ children, className = '' }) {
  return <div className={`admin-modal__body ${className}`}>{children}</div>;
}

export function ModalFooter({ children }) {
  return <div className="admin-modal__footer">{children}</div>;
}

ModalHeader.propTypes = { children: PropTypes.node };
ModalBody.propTypes = { children: PropTypes.node, className: PropTypes.string };
ModalFooter.propTypes = { children: PropTypes.node };

export default function Modal({ open, isOpen, onClose, title, children }) {
  const show = isOpen !== undefined ? isOpen : open;
  const [visible, setVisible] = React.useState(show);
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
      }
    };

    if (!visible) return;

    document.addEventListener('keydown', handleKey);
    previousFocus.current = document.activeElement;
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previousFocus.current) {
        previousFocus.current.focus();
      }
    };
  }, [visible]);

  useEffect(() => {
    if (show) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!visible) return null;

  const backdropStyle = {
    opacity: show ? 1 : 0,
    transition: 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  };

  const dialogStyle = {
    transform: show ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(10px)',
    opacity: show ? 1 : 0,
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
        {children}
      </div>
    </div>
  );
}

Modal.propTypes = {
  open: PropTypes.bool,
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node,
};
