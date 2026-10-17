// frontend/src/components/trainer/TrainerConfirmDialog.jsx
//
// One confirmation surface for every destructive or irreversible Trainer action
// (archiving, unarchiving, removing a Training/Day, archiving a problem).
//
// It exists because those actions were being spelled out by hand on each page,
// which is how the same dialog ends up with three different markup shapes and
// two different "are you sure?" wordings. Keeping it here means the wording is
// consistent and the confirm button is the keyboard default only when the
// action is safe to trigger accidentally.
import React from 'react';
import PropTypes from 'prop-types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

/**
 * @param {boolean} isOpen
 * @param {string} title
 * @param {React.ReactNode} children  The consequence the trainer must read.
 * @param {string} confirmLabel
 * @param {'danger'|'primary'} tone    danger for anything that hides content.
 * @param {boolean} loading           In-flight request; blocks double submit.
 * @param {Function} onConfirm
 * @param {Function} onClose
 */
export default function TrainerConfirmDialog({
  isOpen,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}) {
  const close = () => {
    if (!loading && onClose) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={title}>
      <div className="trainer-confirm">
        <div className="trainer-confirm__body">{children}</div>
        <div className="trainer-form__actions">
          <Button variant="secondary" onClick={close} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

TrainerConfirmDialog.propTypes = {
  isOpen: PropTypes.bool,
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  tone: PropTypes.oneOf(['danger', 'primary']),
  loading: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};