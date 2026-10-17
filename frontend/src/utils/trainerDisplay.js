// Shared display helpers for the Trainer module.
//
// These are pure presentation utilities — they never invent values. Every
// formatter returns an explicit "unavailable" marker rather than a fabricated
// number when the source field is missing, so callers cannot accidentally
// render a phantom metric.

/** Marker rendered whenever a value is genuinely absent from the API payload. */
export const NOT_AVAILABLE = '—';

/**
 * Canonical backend status -> Badge variant.
 * Batch.status   : ACTIVE | INACTIVE | COMPLETED  (backend/src/models/Batch.js:27)
 * Student status : NO_PROBLEMS | NOT_STARTED | IN_PROGRESS | COMPLETED
 *                  (backend/src/routes/trainer/analytics.js:21-27)
 */
export function statusBadgeVariant(status) {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
    case 'COMPLETED':
    case 'SOLVED':
      return 'success';
    case 'IN_PROGRESS':
    case 'ATTEMPTED':
    case 'PENDING':
      return 'warning';
    case 'INACTIVE':
      return 'danger';
    case 'NOT_STARTED':
    case 'NO_PROBLEMS':
    default:
      return 'neutral';
  }
}

/**
 * Human label for a canonical backend status.
 * ACTIVE -> "Active", IN_PROGRESS -> "In Progress", NO_PROBLEMS -> "No Problems".
 * Falls back to the raw value when absent, never to a guess.
 */
export function statusLabel(status) {
  if (!status) return NOT_AVAILABLE;
  return String(status)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Finite number -> display string. Non-finite / absent -> NOT_AVAILABLE.
 * Guards against `0` being swallowed and against `NaN` / `Infinity` leaking.
 */
export function formatCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NOT_AVAILABLE;
  return new Intl.NumberFormat().format(value);
}

/**
 * Percentage (0-100) -> "66.67%" or "100%".
 * Renders at most 2 decimals and drops trailing zeros.
 */
export function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NOT_AVAILABLE;
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}%`;
}

/** ISO date -> locale date string. Absent -> NOT_AVAILABLE. */
export function formatDate(value) {
  if (!value) return NOT_AVAILABLE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE;
  return date.toLocaleDateString();
}

/** "3 / 7" pair. Either side absent -> NOT_AVAILABLE. */
export function formatRatio(numerator, denominator) {
  const hasNum = typeof numerator === 'number' && Number.isFinite(numerator);
  const hasDen = typeof denominator === 'number' && Number.isFinite(denominator);
  if (!hasNum || !hasDen) return NOT_AVAILABLE;
  return `${numerator} / ${denominator}`;
}