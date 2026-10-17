import React from 'react';
import PropTypes from 'prop-types';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import Icon from '../ui/Icon';

/**
 * TrainerStateCard — the loading / empty / error surfaces shared by Trainer
 * pages. Grouped in one module because they are the same shape with different
 * intent, and splitting them would recreate the duplication this module exists
 * to remove.
 *
 * Every state exposes a real `role` so tests and assistive technology can target
 * it: loading -> role="status", error -> role="alert".
 */

export function TrainerLoadingState({ label = 'Loading…' }) {
  return (
    <div className="trainer-loading-state" role="status">
      <Spinner size={22} />
      <p>{label}</p>
    </div>
  );
}

TrainerLoadingState.propTypes = { label: PropTypes.string };

/**
 * `role` is forwarded so an error-shaped empty state can announce itself with
 * role="alert" without duplicating this component.
 */
export function TrainerEmptyState({ title, description = '', icon = 'layers', role = undefined, children = null }) {
  return (
    <div className="trainer-empty-state" role={role}>
      <span className="trainer-state__icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  );
}

TrainerEmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  icon: PropTypes.string,
  role: PropTypes.string,
  children: PropTypes.node,
};


export function TrainerErrorState({ title, message = '', onRetry = undefined, retryLabel = 'Retry' }) {
  return (
    <div className="trainer-error-state" role="alert">
      <span className="trainer-state__icon">
        <Icon name="alertTriangle" size={22} />
      </span>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          <Icon name="refreshCw" size={14} />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

TrainerErrorState.propTypes = {
  title: PropTypes.string.isRequired,
  message: PropTypes.string,
  onRetry: PropTypes.func,
  retryLabel: PropTypes.string,
};
