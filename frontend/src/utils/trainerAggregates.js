// Pure aggregations for Trainer-wide dashboard metrics.
//
// Every function here is total: it reads only fields that the backend actually
// returns, and returns an explicit empty/unavailable result rather than a
// guessed number. Nothing in this module invents thresholds or metrics.
//
// Field sources:
//   GET /api/trainer/students   -> rows shaped
//     { id, student:{id,name,email,role,status}, batch:{id,name,code},
//       status, enrolledAt, createdAt, updatedAt }
//     backend/src/routes/trainer/students.js:35-53
//   GET /api/trainer/batches/:batchId/assignments -> rows shaped
//     { id, problem:{id,title,difficulty,scope,status}|null, batch, title,
//       availableFrom, status, deleted, createdAt, updatedAt,
//       monitoring:{ enrolledStudents, completed, pending } }
//     backend/src/routes/trainer/assignments.js:51-62, 250-259

/** Canonical assignment lifecycle values (assignments.js:35). */
export const ASSIGNMENT_STATUS = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

/**
 * Unique students across the trainer's batches.
 *
 * De-duplicates on `student.id`, so a student enrolled in several batches is
 * counted exactly once. Summing each batch's `studentCount` would double count.
 */
export function uniqueStudents(enrollmentRows = []) {
  const ids = new Set();
  for (const row of enrollmentRows) {
    const id = row?.student?.id;
    if (id !== undefined && id !== null) ids.add(String(id));
  }
  return ids.size;
}

/**
 * Unique students holding an ACTIVE enrollment, per batch.
 * Returns { [batchId]: count }.
 */
export function activeStudentsByBatch(enrollmentRows = []) {
  const idsByBatch = new Map();
  for (const row of enrollmentRows) {
    const batchId = row?.batch?.id;
    const studentId = row?.student?.id;
    if (batchId === undefined || batchId === null) continue;
    if (studentId === undefined || studentId === null) continue;
    if (String(row.status || '').toUpperCase() !== 'ACTIVE') continue;
    const key = String(batchId);
    if (!idsByBatch.has(key)) idsByBatch.set(key, new Set());
    idsByBatch.get(key).add(String(studentId));
  }
  const out = {};
  idsByBatch.forEach((set, key) => {
    out[key] = set.size;
  });
  return out;
}

/**
 * Flatten per-batch assignment responses into one trainer-wide list, tagged
 * with the batch it came from. Soft-deleted rows are excluded (the API already
 * filters them unless includeDeleted=true, but the list endpoint is
 * re-checked here so the dashboard can never count a removed assignment).
 */
export function flattenAssignments(batches = [], assignmentsByBatch = {}) {
  const nameById = new Map(batches.map((b) => [String(b.id), b.name]));
  const out = [];
  for (const batch of batches) {
    const rows = assignmentsByBatch[String(batch.id)] || [];
    for (const row of rows) {
      if (!row) continue;
      if (row.deleted) continue;
      out.push({ ...row, batchId: batch.id, batchName: nameById.get(String(batch.id)) || null });
    }
  }
  return out;
}

/** Assignments currently ACTIVE across every batch. */
export function countActiveAssignments(flatAssignments = []) {
  return flatAssignments.filter(
    (a) => String(a?.status || '').toUpperCase() === ASSIGNMENT_STATUS.ACTIVE
  ).length;
}

/** Assignments per batch id, for the batch table's assignment column. */
export function assignmentCountByBatch(flatAssignments = []) {
  const counts = {};
  for (const a of flatAssignments) {
    const key = String(a.batchId);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/** Most recent assignments first; falls back to availableFrom, then id order. */
export function sortByRecency(flatAssignments = []) {
  const timeOf = (a) => {
    const raw = a?.createdAt || a?.availableFrom || null;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  return [...flatAssignments].sort((a, b) => {
    const diff = timeOf(b) - timeOf(a);
    if (diff !== 0) return diff;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

/** Display title for an assignment row, always falling back through real fields. */
export function assignmentTitle(assignment) {
  return assignment?.title || assignment?.problem?.title || 'Untitled assignment';
}

/**
 * Build the "Needs attention" list.
 *
 * Every entry is a factual statement derived from an API field. No invented
 * thresholds, no performance judgements about individual students:
 *   1. A batch with zero ACTIVE enrollments.
 *   2. An assignment with enrolled students but zero completions.
 *   3. Students whose API status is explicitly NOT_STARTED in the selected batch.
 */
export function buildAttentionItems({ batches = [], activeByBatch = {}, flatAssignments = [], leaderboard = [] }) {
  const items = [];

  for (const batch of batches) {
    const active = activeByBatch[String(batch.id)] || 0;
    if (active === 0) {
      items.push({
        key: `batch-no-students-${batch.id}`,
        title: `${batch.name} has no active students`,
        meta: 'No active enrollments in this batch.',
        to: `/trainer/batches/${batch.id}/students`,
        linkLabel: 'Manage students',
      });
    }
  }

  for (const assignment of flatAssignments) {
    const monitoring = assignment?.monitoring;
    const enrolled = monitoring?.enrolledStudents;
    const completed = monitoring?.completed;
    if (typeof enrolled !== 'number' || typeof completed !== 'number') continue;
    if (enrolled > 0 && completed === 0) {
      items.push({
        key: `assignment-no-completion-${assignment.id}`,
        title: `${assignmentTitle(assignment)} has no completions`,
        meta: `${assignment.batchName || 'This batch'} · ${enrolled} enrolled`,
        to: `/trainer/batches/${assignment.batchId}/assignments`,
        linkLabel: 'Open assignments',
      });
    }
  }

  const notStarted = leaderboard.filter(
    (row) => String(row?.status || '').toUpperCase() === 'NOT_STARTED'
  );
  if (notStarted.length > 0) {
    const names = notStarted.slice(0, 3).map((row) => row.name).filter(Boolean);
    const suffix = notStarted.length > names.length ? ` +${notStarted.length - names.length} more` : '';
    items.push({
      key: 'students-not-started',
      title: `${notStarted.length} student${notStarted.length === 1 ? '' : 's'} not started`,
      meta: `${names.join(', ')}${suffix}`,
      to: '/trainer/monitoring',
      linkLabel: 'View monitoring',
    });
  }

  return items;
}