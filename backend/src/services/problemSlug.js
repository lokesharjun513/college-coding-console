// Problem slug uniqueness policy — single source of truth for every route that
// creates or renames a Problem (trainer + admin, single create/update and the
// bulk import/preview endpoints).
//
// A slug must be unique inside its *uniqueness scope*, and the scope of a
// problem is its batch:
//   - scope BATCH  -> unique within that batch. Two different batches may each
//                     own a problem with the same slug.
//   - scope GLOBAL -> unique across every problem that carries no batch.
//                     All GLOBAL problems share the `batch: null` scope.
//
// This mirrors the unique index declared on the Problem model
// (`{ slug: 1, batch: 1 }`, unique), where GLOBAL problems are indexed under the
// null batch key. Bulk routes keep their existing "reuse the existing problem"
// behaviour for a slug that already exists in the same scope, so re-importing
// never creates a duplicate and never errors.

/** Derive a slug from a problem title. */
function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The uniqueness scope key of a problem: its batch id, or null for GLOBAL
 * problems (and for BATCH problems saved without a batch).
 */
function scopeKey({ scope, batch } = {}) {
  if (scope === 'GLOBAL') return null;
  if (!batch) return null;
  const raw = batch._id || batch;
  return raw.toString();
}

/**
 * Mongo filter selecting only problems inside the same uniqueness scope.
 * Equality against null also matches documents where batch is missing.
 */
function scopeFilter(options) {
  const key = scopeKey(options);
  return { batch: key || null };
}

/** The uniqueness scope key of an already-loaded problem (populated or not). */
function docScopeKey(problem) {
  if (!problem || !problem.batch) return null;
  return (problem.batch._id || problem.batch).toString();
}

/**
 * Find the problem that already owns `slug` inside the same uniqueness scope.
 * `excludeId` keeps a problem from conflicting with itself when it is renamed.
 * `session` runs the lookup inside a caller-supplied transaction.
 */
async function findSlugConflict(Problem, { slug, scope, batch, excludeId, select, session } = {}) {
  const query = { slug, ...scopeFilter({ scope, batch }) };
  if (excludeId) query._id = { $ne: excludeId };
  return Problem.findOne(query, null, session ? { session } : undefined)
    .select(select || '_id slug batch scope');
}

/**
 * Bulk variant: every existing problem that owns one of `slugs` inside the same
 * uniqueness scope.
 */
async function findSlugConflicts(Problem, { slugs, scope, batch, select } = {}) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  return Problem.find({ slug: { $in: slugs }, ...scopeFilter({ scope, batch }) })
    .select(select || '_id slug batch scope');
}

/**
 * Pick the conflicting problem out of a `slug -> problems` index that spans
 * several scopes (used by bulk routes where each row may target a different
 * scope, so one query has to serve every row).
 */
function pickScopeConflict(bySlug, slug, options) {
  const key = scopeKey(options);
  const candidates = bySlug.get(slug) || [];
  return candidates.find(p => docScopeKey(p) === key) || null;
}

module.exports = {
  slugify,
  scopeKey,
  scopeFilter,
  docScopeKey,
  findSlugConflict,
  findSlugConflicts,
  pickScopeConflict,
};