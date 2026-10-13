// Tests for admin/BatchStudentsList.jsx — the enrollment selector must offer
// Admin-created students and enroll them under their linked User id.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminBatchStudentsList from './BatchStudentsList';
import { getBatch, getBatchStudents, getStudents, enrollStudent } from '../../api/admin';

vi.mock('../../api/admin', () => ({
  getBatch: vi.fn(),
  getBatchStudents: vi.fn(),
  getStudents: vi.fn(),
  enrollStudent: vi.fn(),
  deleteStudentEnrollment: vi.fn(),
  updateStudentEnrollment: vi.fn(),
}));

const BATCH_ID = 'batch-1';

// Mirrors the shape returned by GET /api/admin/students after the fix:
// _id is the Student profile document, userId is the linked User.
const newStudent = {
  _id: 'student-doc-1',
  studentId: 'student-doc-1',
  userId: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  rollNumber: 'R001',
  department: 'CSE',
  startYear: 2022,
  endYear: 2026,
  academicBatch: { label: '2022–2026' },
  currentAcademicYear: { label: '3rd Year' },
  status: 'ACTIVE',
};

const inactiveStudent = {
  ...newStudent,
  _id: 'student-doc-2', studentId: 'student-doc-2', userId: 'user-2',
  name: 'Grace Hopper', email: 'grace@example.com', rollNumber: 'R002', status: 'INACTIVE',
};

beforeEach(() => {
  vi.clearAllMocks();
  getBatch.mockResolvedValue({ data: { success: true, data: { id: BATCH_ID, name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE' } } });
  getBatchStudents.mockResolvedValue({ data: { success: true, data: [] } });
  getStudents.mockResolvedValue({ data: { success: true, data: [newStudent, inactiveStudent] } });
  enrollStudent.mockResolvedValue({ data: { success: true, data: { id: 'e1' } } });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/admin/batches/${BATCH_ID}/students`]}>
      <Routes>
        <Route path="/admin/batches/:batchId/students" element={<AdminBatchStudentsList />} />
      </Routes>
    </MemoryRouter>
  );
}

const openSelector = async () => {
  // Exact name: the empty state also renders an "Add Students Now" button.
  fireEvent.click(await screen.findByRole('button', { name: 'Add Students' }));
  await screen.findByText('Enroll Students');
  // Scope assertions to the selector modal: the enrolled table behind it can
  // render the same names.
  return within(document.querySelector('.admin-modal-overlay'));
};

test('an Admin-created student appears in the enrollment selector', async () => {
  renderPage();
  const selector = await openSelector();

  expect(selector.getByText('Ada Lovelace')).toBeInTheDocument();
});

test('the selector shows the academic batch and current year', async () => {
  renderPage();
  const selector = await openSelector();

  expect(selector.getByText('2022–2026 • 3rd Year')).toBeInTheDocument();
});

test('inactive students are not offered for enrollment', async () => {
  renderPage();
  const selector = await openSelector();

  expect(selector.getByText('Ada Lovelace')).toBeInTheDocument();
  expect(selector.queryByText('Grace Hopper')).not.toBeInTheDocument();
});

test('enrolling sends the linked User id, not the Student document id', async () => {
  renderPage();
  const selector = await openSelector();

  fireEvent.click(selector.getByText('Ada Lovelace'));
  fireEvent.click(screen.getByRole('button', { name: /Enroll Selected/i }));

  await waitFor(() => expect(enrollStudent).toHaveBeenCalledTimes(1));
  expect(enrollStudent).toHaveBeenCalledWith(BATCH_ID, 'user-1');
  expect(enrollStudent.mock.calls[0][2]).not.toBe('student-doc-1');
});

test('already-enrolled students are filtered out by their User id', async () => {
  getBatchStudents.mockResolvedValue({
    data: {
      success: true,
      data: [{ id: 'e1', student: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', status: 'ACTIVE' }, status: 'ACTIVE' }],
    },
  });
  renderPage();
  const selector = await openSelector();

  // Ada is enrolled under user-1, so she must not be re-offered in the selector.
  expect(selector.getByText(/No available students found/i)).toBeInTheDocument();
  expect(selector.queryByText('Ada Lovelace')).not.toBeInTheDocument();
});

test('selecting all available uses User ids', async () => {
  renderPage();
  const selector = await openSelector();

  fireEvent.click(selector.getByRole('button', { name: /Select All Available/i }));
  fireEvent.click(screen.getByRole('button', { name: /Enroll Selected/i }));

  await waitFor(() => expect(enrollStudent).toHaveBeenCalledWith(BATCH_ID, 'user-1'));
});

test('enrollment errors are surfaced', async () => {
  enrollStudent.mockRejectedValue({ response: { data: { message: 'Student already enrolled in this batch' } } });
  renderPage();
  const selector = await openSelector();

  fireEvent.click(selector.getByText('Ada Lovelace'));
  fireEvent.click(screen.getByRole('button', { name: /Enroll Selected/i }));

  expect(await selector.findByText('Student already enrolled in this batch')).toBeInTheDocument();
});