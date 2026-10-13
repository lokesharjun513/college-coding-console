// backend/src/utils/academicBatch.js
//
// Single source of truth for academic-batch maths so that create, edit, the
// admin student table and batch-enrollment views can never disagree.
//
// Rules (driven by the ACTUAL current year, never a hardcoded one):
//   currentYear < startYear            -> 'Not Started'
//   currentYear > endYear              -> 'Completed'
//   otherwise                          -> '1st Year' .. '3rd Year' .. 'Final Year'
//
// Legacy students with missing or invalid years are handled gracefully: the
// helpers return null rather than throwing, and callers render an em dash.

const ORDINAL_SUFFIX = { 1: 'st', 2: 'nd', 3: 'rd' };

/** Coerce to a finite integer year, or null. */
function toYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(year) ? year : null;
}

/**
 * Human-readable academic batch, e.g. 2022–2026.
 * Uses an en dash between the years, matching the existing UI.
 * Returns null when either year is missing/invalid.
 */
function formatAcademicBatch(startYear, endYear) {
  const start = toYear(startYear);
  const end = toYear(endYear);
  if (start === null || end === null) return null;
  return `${start}–${end}`;
}

/**
 * Classify a student against the current calendar year.
 *
 * @param {number|string} startYear
 * @param {number|string} endYear
 * @param {number} [currentYear] Injectable for tests; defaults to the real year.
 * @returns {{label: string, yearOfStudy: (number|null), status: string,
 *            totalYears: (number|null)} | null} null when years are unusable.
 */
function calculateCurrentAcademicYear(startYear, endYear, currentYear = new Date().getFullYear()) {
  const start = toYear(startYear);
  const end = toYear(endYear);

  if (start === null || end === null) return null;

  const now = Number.isInteger(currentYear) ? currentYear : new Date().getFullYear();
  const totalYears = end - start + 1;

  if (now < start) {
    return { label: 'Not Started', yearOfStudy: null, status: 'NOT_STARTED', totalYears };
  }
  if (now > end) {
    return { label: 'Completed', yearOfStudy: null, status: 'COMPLETED', totalYears };
  }

  const yearOfStudy = now - start + 1;

  if (yearOfStudy >= totalYears) {
    return { label: 'Final Year', yearOfStudy, status: 'FINAL_YEAR', totalYears };
  }

  const suffix = ORDINAL_SUFFIX[yearOfStudy] || 'th';
  return {
    label: `${yearOfStudy}${suffix} Year`,
    yearOfStudy,
    status: 'IN_PROGRESS',
    totalYears,
  };
}

/**
 * True when the supplied years form a usable, ordered academic batch.
 * Requires both years and startYear < endYear (a single-year batch is invalid).
 */
function isValidAcademicBatch(startYear, endYear) {
  const start = toYear(startYear);
  const end = toYear(endYear);
  if (start === null || end === null) return false;
  return start < end;
}

/**
 * Build the shared student payload shape used by every admin student response.
 *
 * `status` is taken from the linked User document: authentication
 * (requireAuth) and batch enrollment both key off User.status, so User remains
 * the single source of truth and no duplicate status field is introduced on the
 * Student model.
 *
 * @param {object} student  Student document
 * @param {object} [user]   Linked User document, when loaded
 * @param {number} [currentYear]
 */
function buildStudentPayload(student, user, currentYear = new Date().getFullYear()) {
  const startYear = toYear(student.startYear) ?? toYear(user?.academicBatch?.startYear);
  const endYear = toYear(student.endYear) ?? toYear(user?.academicBatch?.endYear);

  return {
    // Student document id — kept as `_id` so existing edit/delete callers work.
    _id: student._id,
    studentId: student._id,
    // The linked User id. Batch enrollment, submissions and auth all use this.
    userId: user?._id ?? student.userId ?? null,
    name: student.name,
    email: student.email,
    rollNumber: student.rollNumber,
    department: student.department,
    section: student.section || null,
    startYear,
    endYear,
    academicBatch: {
      startYear,
      endYear,
      label: formatAcademicBatch(startYear, endYear),
    },
    currentAcademicYear: calculateCurrentAcademicYear(startYear, endYear, currentYear),
    status: user?.status || 'ACTIVE',
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

module.exports = {
  buildStudentPayload,
  calculateCurrentAcademicYear,
  formatAcademicBatch,
  isValidAcademicBatch,
  toYear,
};