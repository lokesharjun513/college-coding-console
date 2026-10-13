// Tests for frontend/src/utils/academicBatch.js — must stay in lockstep with
// backend/src/utils/academicBatch.js.
import { describe, test, expect } from 'vitest';
import {
  academicBatchLabel,
  calculateCurrentAcademicYear,
  currentYearLabel,
  enrollmentId,
  formatAcademicBatch,
  readYears,
  toYear,
} from './academicBatch';

describe('toYear', () => {
  test('accepts integers and numeric strings', () => {
    expect(toYear(2022)).toBe(2022);
    expect(toYear('2022')).toBe(2022);
  });

  test('rejects empty, null and non-integer values', () => {
    expect(toYear(null)).toBeNull();
    expect(toYear(undefined)).toBeNull();
    expect(toYear('')).toBeNull();
    expect(toYear('abc')).toBeNull();
    expect(toYear(2022.5)).toBeNull();
  });
});

describe('formatAcademicBatch', () => {
  test('formats start–end', () => {
    expect(formatAcademicBatch(2022, 2026)).toBe('2022–2026');
  });

  test('returns null when a year is missing', () => {
    expect(formatAcademicBatch(2022, null)).toBeNull();
    expect(formatAcademicBatch(undefined, 2026)).toBeNull();
  });
});

describe('calculateCurrentAcademicYear', () => {
  test('classifies every year of a 2022–2026 batch', () => {
    expect(calculateCurrentAcademicYear(2022, 2026, 2022).label).toBe('1st Year');
    expect(calculateCurrentAcademicYear(2022, 2026, 2023).label).toBe('2nd Year');
    expect(calculateCurrentAcademicYear(2022, 2026, 2024).label).toBe('3rd Year');
    expect(calculateCurrentAcademicYear(2022, 2026, 2025).label).toBe('4th Year');
    expect(calculateCurrentAcademicYear(2022, 2026, 2026).label).toBe('Final Year');
  });

  test('classifies before-start and after-end', () => {
    expect(calculateCurrentAcademicYear(2022, 2026, 2021).label).toBe('Not Started');
    expect(calculateCurrentAcademicYear(2022, 2026, 2027).label).toBe('Completed');
  });

  test('uses the real current year by default', () => {
    const now = new Date().getFullYear();
    const result = calculateCurrentAcademicYear(now, now + 2);
    expect(result.label).toBe('1st Year');
  });

  test('returns null for legacy records without years', () => {
    expect(calculateCurrentAcademicYear(null, null)).toBeNull();
  });
});

describe('payload readers', () => {
  test('readYears prefers top-level fields then academicBatch', () => {
    expect(readYears({ startYear: 2022, endYear: 2026 })).toEqual({ startYear: 2022, endYear: 2026 });
    expect(readYears({ academicBatch: { startYear: 2020, endYear: 2024 } })).toEqual({ startYear: 2020, endYear: 2024 });
    expect(readYears({ startYear: 2022, academicBatch: { startYear: 2020, endYear: 2024 } }).startYear).toBe(2022);
    expect(readYears(null)).toEqual({ startYear: null, endYear: null });
  });

  test('academicBatchLabel prefers the server-computed label', () => {
    expect(academicBatchLabel({ academicBatch: { label: '2022–2026' } })).toBe('2022–2026');
    expect(academicBatchLabel({ startYear: 2022, endYear: 2026 })).toBe('2022–2026');
    expect(academicBatchLabel({})).toBe('—');
    expect(academicBatchLabel(null)).toBe('—');
  });

  test('currentYearLabel prefers the server-computed value', () => {
    expect(currentYearLabel({ currentAcademicYear: { label: '3rd Year' } })).toBe('3rd Year');
    expect(currentYearLabel({ startYear: 2022, endYear: 2026 }, 2024)).toBe('3rd Year');
    expect(currentYearLabel({})).toBe('—');
  });
});

describe('enrollmentId', () => {
  test('prefers the linked User id over the Student document id', () => {
    expect(enrollmentId({ _id: 'student-doc-id', userId: 'user-id' })).toBe('user-id');
  });

  test('falls back through studentId, _id and id', () => {
    expect(enrollmentId({ _id: 'student-doc-id', studentId: 'student-doc-id' })).toBe('student-doc-id');
    expect(enrollmentId({ _id: 'student-doc-id' })).toBe('student-doc-id');
    expect(enrollmentId({ id: 'legacy-id' })).toBe('legacy-id');
    expect(enrollmentId(null)).toBeNull();
  });
});