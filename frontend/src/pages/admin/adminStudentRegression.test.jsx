// Scenario verification for the Admin Students table and the batch enrollment
// selector, driven by the exact payload shapes the backend now returns.
//
//   3  the Students table displays the correct academic batch, year and status
//   9  an enrolled student is excluded from that batch's available-students
//      selector, while other eligible students remain
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Students from './Students';
import AdminBatchStudentsList from './BatchStudentsList';
import { getStudents, updateStudent, getBatch, getBatchStudents, enrollStudent } from '../../api/admin';

vi.mock('../../api/admin', () => ({
  getStudents: vi.fn(),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  deleteStudent: vi.fn(),
  downloadStudentTemplate: vi.fn(),
  getBatch: vi.fn(),
  getBatchStudents: vi.fn(),
  enrollStudent: vi.fn(),
  deleteStudentEnrollment: vi.fn(),
  updateStudentEnrollment: vi.fn(),
}));

// Exactly what POST /api/admin/students returns for Start 2022 / End 2026.
const ADA = {
  _id: 'ada-student-doc',
  studentId: 'ada-student-doc',
  userId: 'ada-user-id',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  rollNumber: 'R001',
  department: 'CSE',
  section: 'A',
  startYear: 2022,
  endYear: 2026,
  academicBatch: { startYear: 2022, endYear: 2026, label: '2022–2026' },
  currentAcademicYear: { label: 'Final Year', yearOfStudy: 5, status: 'FINAL_YEAR', totalYears: 5 },
  status: 'ACTIVE',
};
const GRACE = {
  ...ADA,
  _id: 'grace-student-doc', studentId: 'grace-student-doc', userId: 'grace-user-id',
  name: 'Grace Hopper', email: 'grace@example.com', rollNumber: 'R002',
  status: 'ACTIVE',
};

beforeEach(() => {
  vi.clearAllMocks();
  getStudents.mockResolvedValue({ data: { success: true, data: [ADA, GRACE] } });
  updateStudent.mockResolvedValue({ data: { success: true, data: { ...ADA, status: 'INACTIVE' } } });
  getBatch.mockResolvedValue({ data: { success: true, data: { id: 'batch-1', name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE' } } });
  getBatchStudents.mockResolvedValue({ data: { success: true, data: [] } });
  enrollStudent.mockResolvedValue({ data: { success: true, data: { id: 'e1' } } });
});

// --------------------------------------------------------- scenario 3
test('Scenario 3: the Students table shows academic batch, current year and status', async () => {
  render(<MemoryRouter><Students /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  const table = within(screen.getByRole('table'));

  // Academic batch, computed from start/end years.
  const adaRow = table.getByText('Ada Lovelace').closest('tr');
  expect(within(adaRow).getByText('2022–2026')).toBeInTheDocument();
  // Current year classification.
  expect(within(adaRow).getByText('Final Year')).toBeInTheDocument();
  // Readable status badge, not the raw enum.
  expect(within(adaRow).getByText('Active')).toBeInTheDocument();
  expect(within(adaRow).queryByText('ACTIVE')).not.toBeInTheDocument();

  // Both rows render.
  const graceRow = table.getByText('Grace Hopper').closest('tr');
  expect(within(graceRow).getByText('2022–2026')).toBeInTheDocument();
  expect(within(graceRow).getByText('Final Year')).toBeInTheDocument();
});

test('Scenario 3b: the table reflects a status change without a full refetch', async () => {
  render(<MemoryRouter><Students /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  const table = within(screen.getByRole('table'));
  fireEvent.click(table.getByRole('button', { name: 'Deactivate Ada Lovelace' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Yes, Deactivate/i }));

  await waitFor(() => expect(table.getByText('Inactive')).toBeInTheDocument());
  expect(getStudents).toHaveBeenCalledTimes(1);
  expect(table.getByRole('button', { name: 'Activate Ada Lovelace' })).toBeInTheDocument();
});

// --------------------------------------------------------- scenario 9
function renderBatchPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/batches/batch-1/students']}>
      <Routes>
        <Route path="/admin/batches/:batchId/students" element={<AdminBatchStudentsList />} />
      </Routes>
    </MemoryRouter>
  );
}

const openSelector = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add Students' }));
  await screen.findByText('Enroll Students');
  return within(document.querySelector('.admin-modal-overlay'));
};

test('Scenario 9: the enrolled student is excluded from the available-students selector', async () => {
  // Ada is enrolled under her linked User id.
  getBatchStudents.mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: 'e1',
        student: {
          id: 'ada-user-id', name: 'Ada Lovelace', email: 'ada@example.com',
          role: 'STUDENT', status: 'ACTIVE', rollNumber: 'R001',
        },
        status: 'ACTIVE',
      }],
    },
  });

  renderBatchPage();
  const selector = await openSelector();

  // Ada is not offered again...
  expect(selector.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  // ...but Grace, who is not enrolled, is still selectable.
  expect(selector.getByText('Grace Hopper')).toBeInTheDocument();
});

test('Scenario 9b: with nobody enrolled, every active student is offered', async () => {
  renderBatchPage();
  const selector = await openSelector();

  expect(selector.getByText('Ada Lovelace')).toBeInTheDocument();
  expect(selector.getByText('Grace Hopper')).toBeInTheDocument();
});

test('Scenario 7 (UI): selecting and enrolling sends the linked User id', async () => {
  renderBatchPage();
  const selector = await openSelector();

  fireEvent.click(selector.getByText('Grace Hopper'));
  fireEvent.click(screen.getByRole('button', { name: /Enroll Selected/i }));

  await waitFor(() => expect(enrollStudent).toHaveBeenCalledWith('batch-1', 'grace-user-id'));
  expect(enrollStudent.mock.calls[0][2]).not.toBe('grace-student-doc');
});

test('Scenario 8 (UI): the enrolled table renders the student from the batch list', async () => {
  getBatchStudents.mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: 'e1',
        student: {
          id: 'ada-user-id', name: 'Ada Lovelace', email: 'ada@example.com',
          role: 'STUDENT', status: 'ACTIVE', rollNumber: 'R001', department: 'CSE',
        },
        status: 'ACTIVE',
      }],
    },
  });

  renderBatchPage();

  expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  // rollNumber comes from the shared enrollment payload.
  expect(screen.getByText('R001')).toBeInTheDocument();
  expect(screen.getByText('CSE')).toBeInTheDocument();
});