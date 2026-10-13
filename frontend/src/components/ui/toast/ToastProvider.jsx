import React, { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';
import Toast from '../Toast';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = (message, type = 'info', duration = 3000) => {
    setToast({ message, type, duration });
  };

  const success = (message, duration) => show(message, 'success', duration);
  const error = (message, duration) => show(message, 'error', duration);
  const warning = (message, duration) => show(message, 'warning', duration);
  const info = (message, duration) => show(message, 'info', duration);

  return (
    <ToastContext.Provider value={{ success, error, warning, info }}>
      {children}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </ToastContext.Provider>
  );
}

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
