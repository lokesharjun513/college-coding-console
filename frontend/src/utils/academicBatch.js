// frontend/src/utils/academicBatch.js
//
// Display helpers for academic batch and current-year classification.
//
// The backend is authoritative: GET /api/admin/students already returns
// `academicBatch.label` and `currentAcademicYear`. These helpers exist so the
// create form, the edit form, the students table and the batch-enrollment view
// all derive the exact same strings, and so legacy records that arrive without
// computed fields (e.g. an older cached payload) still render correctly.

const ORDINAL_SUFFIX = { 1: 'st', 2: 'nd', 3: 'rd' };

/** Coerce to a finite integer year, or null. */
export function toYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(year) ? year : null;
}

/** Pull start/end years out of whichever shape the API handed us. */
export function readYears(student) {
  if (!student) return { startYear: null, endYear: null };
  const startYear = toYear(student.startYear) ?? toYear(student.academicBatch?.startYear);
  const endYear = toYear(student.endYear) ?? toYear(student.academicBatch?.endYear);
  return { startYear, endYear };
}

/** e.g. 2022–2026, or null when the years are missing/invalid. */
export function formatAcademicBatch(startYear, endYear) {
  const start = toYear(startYear);
  const end = toYear(endYear);
  if (start === null || end === null) return null;
  return `${start}–${end}`;
}

/**
 * Classify a student against the current calendar year.
 * Mirrors backend/src/utils/academicBatch.js exactly.
 */
export function calculateCurrentAcademicYear(startYear, endYear, currentYear = new Date().getFullYear()) {
  const start = toYear(startYear);
  const end = toYear(endYear);
  if (start === null || end === null) return null;

  const now = Number.isInteger(currentYear) ? currentYear : new Date().getFullYear();
  const totalYears = end - start + 1;

  if (now < start) return { label: 'Not Started', yearOfStudy: null, status: 'NOT_STARTED', totalYears };
  if (now > end) return { label: 'Completed', yearOfStudy: null, status: 'COMPLETED', totalYears };

  const yearOfStudy = now - start + 1;
  if (yearOfStudy >= totalYears) {
    return { label: 'Final Year', yearOfStudy, status: 'FINAL_YEAR', totalYears };
  }
  const suffix = ORDINAL_SUFFIX[yearOfStudy] || 'th';
  return { label: `${yearOfStudy}${suffix} Year`, yearOfStudy, status: 'IN_PROGRESS', totalYears };
}

/** Academic batch label, preferring the server-computed value. */
export function academicBatchLabel(student) {
  if (!student) return '—';
  return student.academicBatch?.label || formatAcademicBatch(readYears(student).startYear, readYears(student).endYear) || '—';
}

/** Current-year label, preferring the server-computed value. */
export function currentYearLabel(student, currentYear = new Date().getFullYear()) {
  if (!student) return '—';
  if (student.currentAcademicYear?.label) return student.currentAcademicYear.label;
  const { startYear, endYear } = readYears(student);
  return calculateCurrentAcademicYear(startYear, endYear, currentYear)?.label || '—';
}

/** The identifier to send when enrolling a student into a batch. */
export function enrollmentId(student) {
  if (!student) return null;
  return student.userId || student.studentId || student._id || student.id || null;
}