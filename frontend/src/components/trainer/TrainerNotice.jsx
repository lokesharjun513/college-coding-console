// frontend/src/components/trainer/TrainerNotice.jsx
//
// The inline result banner Trainer pages show after a mutation: success,
// failure, or the "we archived instead of deleting" outcomes the Training/Day
// endpoints return.
//
// Separate from TrainerStateCard because those are full-page states; this is a
// single line that sits above content that still renders. It never swallows an
// error into a neutral message — `message` is whatever the caller could read
// from the response, and `onRetry` is opt-in so a failure that should be
// retryable is.
import React from 'react';
import PropTypes from 'prop-types';
import Icon from '../ui/Icon';
import Button from '../ui/Button';

/**
 * @param {'success'|'error'|'info'} tone
 */
export default function TrainerNotice({
  tone = 'success',
  message,
  onRetry,
  retryLabel = 'Retry',
  onDismiss,
  role,
}) {
  if (!message) return null;

  const variant = tone === 'error' ? 'error' : 'success';
  const iconName = tone === 'error' ? 'alertTriangle' : tone === 'info' ? 'info' : 'checkCircle2';

  return (
    <div
      className={`trainer-notice trainer-notice--${variant}`}
      role={role || (tone === 'error' ? 'alert' : 'status')}
    >
      <Icon name={iconName} size={16} />
      <span>{message}</span>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <Icon name="refreshCw" size={14} />
          {retryLabel}
        </Button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="trainer-notice__close"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}

TrainerNotice.propTypes = {
  tone: PropTypes.oneOf(['success', 'error', 'info']),
  message: PropTypes.string,
  onRetry: PropTypes.func,
  retryLabel: PropTypes.string,
  onDismiss: PropTypes.func,
  role: PropTypes.string,
};

export function apiErrorMessage(err, fallback) {
  if (!err) return fallback;
  return err?.response?.data?.message || err?.message || fallback;
}