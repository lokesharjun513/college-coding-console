import React from 'react';
import PropTypes from 'prop-types';
import { NOT_AVAILABLE, statusBadgeVariant, statusLabel } from '../../utils/trainerDisplay';

/**
 * StatusBadge — a status pill for the Trainer module.
 *
 * Every badge renders the status as text, so meaning is never conveyed by
 * colour alone. The tone comes from the canonical backend value; unknown values
 * fall back to the neutral tone rather than guessing a semantic.
 */
export default function StatusBadge({ status = '', tone = undefined, children = null }) {
  const text = children || (status ? statusLabel(status) : NOT_AVAILABLE);
  const resolved = tone || statusBadgeVariant(status) || 'neutral';
  return <span className={`trainer-status-badge trainer-status-badge--${resolved}`}>{text}</span>;
}

StatusBadge.propTypes = {
  status: PropTypes.string,
  tone: PropTypes.oneOf(['success', 'warning', 'danger', 'neutral']),
  children: PropTypes.node,
};
