// Tests for the refactored admin/BatchDetails.jsx and the extracted
// EnrollStudentsModal: trainer card states, toolbar/filter controls, table
// alignment affordances, bulk selection, and the enrollment modal contract.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminBatchDetails from './BatchDetails';
import {
  getBatch, getTrainers, updateBatch,
  getBatchStudents, getStudents, enrollStudent,
  deleteStudentEnrollment, updateStudentEnrollment,
} from '../../api/admin';

vi.mock('../../api/admin', () => ({
  getBatch: vi.fn(),
  getTrainers: vi.fn(),
  updateBatch: vi.fn(),
  deleteBatch: vi.fn(),
  getBatchStudents: vi.fn(),
  getStudents: vi.fn(),
  enrollStudent: vi.fn(),
  deleteStudentEnrollment: vi.fn(),
  updateStudentEnrollment: vi.fn(),
}));

const BATCH_ID = 'batch-1';

const batchResponse = (trainer) => ({
  data: {
    success: true,
    data: {
      id: BATCH_ID, name: 'CSE 2024', code: 'CSE24', description: 'Core cohort',
      status: 'ACTIVE', startDate: '2024-06-01', endDate: '2028-05-31',
      trainer: trainer ? { id: 'trainer-1', name: 'Test Trainer', email: 'testtrainer@gmail.com' } : null,
    },
  },
});

// Mirrors GET /api/admin/students after the fix.
const newStudent = (overrides = {}) => ({
  _id: 'student-doc-1', studentId: 'student-doc-1', userId: 'user-1',
  name: 'TestStudent', email: 'teststudent@gmail.com', rollNumber: '18F91A0514',
  department: 'CSE', section: 'A', status: 'ACTIVE',
  academicBatch: { startYear: 2024, endYear: 2028 }, ...overrides,
});
const secondStudent = newStudent({
  _id: 'student-doc-2', studentId: 'student-doc-2', userId: 'user-2',
  name: 'Bharath', email: 'bharathcheck@gmail.com', rollNumber: '18F91A0513',
  department: 'ECE', section: 'B', academicBatch: { startYear: 2023, endYear: 2027 },
});

const enrolled = (overrides = {}) => ({
  id: 'e1',
  student: {
    id: 'user-1', name: 'TestStudent', email: 'teststudent@gmail.com',
    rollNumber: '18F91A0514', department: 'CSE', section: 'A',
    academicBatch: { startYear: 2024, endYear: 2028 }, status: 'ACTIVE',
  },
  status: 'ACTIVE', ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/admin/batches/${BATCH_ID}`]}>
      <Routes>
        <Route path="/admin/batches/:batchId" element={<AdminBatchDetails />} />
      </Routes>
    </MemoryRouter>
  );
}

const openEnrollment = async () => {
  // The enrollment header button is the canonical trigger. An empty roster also
  // renders its own "Add Students" call to action, so scope to the header one.
  const [trigger] = await screen.findAllByRole('button', { name: /Add Students/ });
  fireEvent.click(trigger);
  return screen.findByRole('dialog', { name: /Enroll Students/i });
};

beforeEach(() => {
  vi.clearAllMocks();
  getBatch.mockResolvedValue(batchResponse(true));
  getTrainers.mockResolvedValue({ data: { success: true, data: [] } });
  getBatchStudents.mockResolvedValue({ data: { success: true, data: [enrolled()] } });
  getStudents.mockResolvedValue({ data: { success: true, data: [newStudent(), secondStudent] } });
  enrollStudent.mockResolvedValue({ data: { success: true, data: { id: 'e2' } } });
  updateStudentEnrollment.mockResolvedValue({ data: { success: true, data: {} } });
  deleteStudentEnrollment.mockResolvedValue({ data: { success: true, data: null } });
  updateBatch.mockResolvedValue({ data: { success: true, data: {} } });
});

// ─────────────────────────────── PHASE 3: trainer card
test('Trainer card shows the assigned trainer and state', async () => {
  renderPage();
  await screen.findByText('Test Trainer');

  const card = screen.getByRole('region', { name: /Trainer assignment/i });
  expect(within(card).getByText('Trainer Assignment')).toBeInTheDocument();
  expect(within(card).getByText(/Manage the instructional lead for this batch/i)).toBeInTheDocument();
  // Avatar + name + email grouped, left aligned.
  expect(within(card).getByText('testtrainer@gmail.com')).toBeInTheDocument();
  expect(within(card).getByText('Assigned')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Change Trainer' })).toBeInTheDocument();
});

test('Trainer card shows the unassigned state when no trainer is set', async () => {
  getBatch.mockResolvedValue(batchResponse(false));
  renderPage();

  const card = await screen.findByRole('region', { name: /Trainer assignment/i });
  expect(within(card).getByText('Not Assigned')).toBeInTheDocument();
  expect(within(card).queryByText('Unassigned')).not.toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Assign Trainer' })).toBeInTheDocument();
});

test('Trainer card handles a very long email without overflowing', async () => {
  getBatch.mockResolvedValue({
    data: {
      success: true,
      data: {
        id: BATCH_ID, name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE',
        trainer: {
          id: 't1', name: 'A Very Long Instructor Name Indeed',
          email: 'an.extremely.long.instructor.address.with.many.parts@example-domain.edu',
        },
      },
    },
  });
  renderPage();

  const card = await screen.findByRole('region', { name: /Trainer assignment/i });
  expect(within(card).getByText(/an\.extremely\.long\.instructor\.address/)).toBeInTheDocument();
  expect(within(card).getByText('A Very Long Instructor Name Indeed')).toBeInTheDocument();
});

// ─────────────────────────── PHASE 4: header + toolbar
test('Enrollment header has a title, description and Add Students action', async () => {
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Student Enrollment', level: 2 })).toBeInTheDocument();
  expect(screen.getByText(/Search, filter and manage the students enrolled/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Add Students/ })).toBeInTheDocument();
});

test('status filter buttons render visible All / Active / Inactive labels', async () => {
  renderPage();
  await screen.findByRole('button', { name: /Add Students/ });

  const group = screen.getByRole('group', { name: /Filter by enrollment status/i });
  expect(within(group).getByRole('button', { name: /All Students/ })).toBeInTheDocument();
  expect(within(group).getByRole('button', { name: /Active/ })).toBeInTheDocument();
  expect(within(group).getByRole('button', { name: /Inactive/ })).toBeInTheDocument();

  // Each segment reports its own count so the roster total is never guessed.
  expect(within(group).getByRole('button', { name: 'All Students 1' })).toBeInTheDocument();

  // Active is highlighted through the pressed state, not colour alone.
  expect(within(group).getByRole('button', { name: /All Students/ })).toHaveAttribute('aria-pressed', 'true');
});

test('status filtering actually filters the table', async () => {
  getBatchStudents.mockResolvedValue({
    data: {
      success: true,
      data: [enrolled(), enrolled({
        id: 'e2',
        student: { ...enrolled().student, id: 'user-9', name: 'Inactive Person' },
        status: 'INACTIVE',
      })],
    },
  });
  renderPage();
  await screen.findByText('TestStudent');
  expect(screen.getByText('Inactive Person')).toBeInTheDocument();

  const group = screen.getByRole('group', { name: /Filter by enrollment status/i });
  fireEvent.click(within(group).getByRole('button', { name: /Inactive/ }));

  await waitFor(() => expect(screen.queryByText('TestStudent')).not.toBeInTheDocument());
  expect(screen.getByText('Inactive Person')).toBeInTheDocument();
});

test('search matches name, email and roll number', async () => {
  renderPage();
  await screen.findByText('TestStudent');

  const search = screen.getByLabelText('Search enrolled students');

  fireEvent.change(search, { target: { value: '18F91A0514' } });
  await waitFor(() => expect(screen.getByText('TestStudent')).toBeInTheDocument());

  fireEvent.change(search, { target: { value: 'teststudent@' } });
  await waitFor(() => expect(screen.getByText('TestStudent')).toBeInTheDocument());

  fireEvent.change(search, { target: { value: 'zzz-nobody' } });
  expect(await screen.findByText('No matching students')).toBeInTheDocument();
});

// ─────────────────────────── PHASE 5: advanced filters
test('advanced filters populate from real roster data and combine', async () => {
  getBatchStudents.mockResolvedValue({
    data: {
      success: true,
      data: [
        enrolled(),
        enrolled({
          id: 'e2',
          student: { ...enrolled().student, id: 'user-9', name: 'Other Student', department: 'ECE', section: 'B', academicBatch: { startYear: 2023, endYear: 2027 } },
        }),
      ],
    },
  });
  renderPage();
  await screen.findByText('TestStudent');

  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));

  const dept = screen.getByLabelText('Department');
  const year = screen.getByLabelText('Academic Batch');
  const section = screen.getByLabelText('Section');

  // Options come from the data, not hard-coded.
  expect(within(dept).getByRole('option', { name: 'CSE' })).toBeInTheDocument();
  expect(within(dept).getByRole('option', { name: 'ECE' })).toBeInTheDocument();
  expect(within(year).getByRole('option', { name: '2024–2028' })).toBeInTheDocument();
  expect(within(section).getByRole('option', { name: 'B' })).toBeInTheDocument();

  expect(screen.getByTestId('enrolled-match-count')).toHaveTextContent('2 of 2 students');

  // Filters combine.
  fireEvent.change(dept, { target: { value: 'CSE' } });
  await waitFor(() => expect(screen.getByTestId('enrolled-match-count')).toHaveTextContent('1 of 2 students'));
  expect(screen.getByText('TestStudent')).toBeInTheDocument();
  expect(screen.queryByText('Other Student')).not.toBeInTheDocument();

  fireEvent.change(year, { target: { value: '2023-2027' } });
  await waitFor(() => expect(screen.getByText('No matching students')).toBeInTheDocument());

  // Clear restores everything.
  fireEvent.click(within(screen.getByRole('group', { name: 'Advanced filters' })).getByRole('button', { name: /Clear all filters/ }));
  await waitFor(() => expect(screen.getByTestId('enrolled-match-count')).toHaveTextContent('2 of 2 students'));
});

test('clear filters resets search and status together', async () => {
  getBatchStudents.mockResolvedValue({
    data: { success: true, data: [enrolled(), enrolled({ id: 'e2', student: { ...enrolled().student, id: 'user-9', name: 'Second' }, status: 'INACTIVE' })] },
  });
  renderPage();
  await screen.findByText('TestStudent');

  fireEvent.change(screen.getByLabelText('Search enrolled students'), { target: { value: 'Second' } });
  const group = screen.getByRole('group', { name: /Filter by enrollment status/i });
  fireEvent.click(within(group).getByRole('button', { name: /^Active/ }));

  await waitFor(() => expect(screen.queryByText('Second')).not.toBeInTheDocument());

  // The chip bar's "Clear all" resets the search box and the status segment together.
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  await waitFor(() => expect(screen.getByText('TestStudent')).toBeInTheDocument());
  expect(within(screen.getByRole('group', { name: /Filter by enrollment status/i }))
    .getByRole('button', { name: /All Students/ })).toHaveAttribute('aria-pressed', 'true');
});

// ─────────────────────────── PHASE 6: table + bulk
test('table exposes selectable rows with accessible labels', async () => {
  renderPage();
  await screen.findByText('TestStudent');

  expect(screen.getByRole('checkbox', { name: 'Select all enrolled students on this page' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Select TestStudent' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Roll Number' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Department' })).toBeInTheDocument();
});

test('bulk bar appears with an accurate count and clears selection', async () => {
  renderPage();
  await screen.findByText('TestStudent');

  expect(screen.queryByTestId('bulk-selection-count')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Select TestStudent' }));

  const bar = await screen.findByText(/student selected/);
  expect(bar).toHaveTextContent('1 student selected');
  expect(screen.getByRole('button', { name: /Remove selected/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Clear selection/ }));
  await waitFor(() => expect(screen.queryByTestId('bulk-selection-count')).not.toBeInTheDocument());
});

test('select-all checkbox selects every filtered row', async () => {
  getBatchStudents.mockResolvedValue({
    data: { success: true, data: [enrolled(), enrolled({ id: 'e2', student: { ...enrolled().student, id: 'user-9', name: 'Second' } })] },
  });
  renderPage();
  await screen.findByText('TestStudent');

  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all enrolled students on this page' }));
  await waitFor(() => expect(screen.getByTestId('bulk-selection-count')).toBeInTheDocument());
});

test('empty roster shows a call to action instead of a blank table', async () => {
  getBatchStudents.mockResolvedValue({ data: { success: true, data: [] } });
  renderPage();

  expect(await screen.findByText('No students enrolled yet')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Add Students/ }).length).toBeGreaterThan(0);
});

// ───────────────────── premium enrollment header + filters
test('header reports the enrolled total and the segmented counts come from data', async () => {
  getBatchStudents.mockResolvedValue({
    data: {
      success: true,
      data: [
        enrolled(),
        enrolled({ id: 'e2', student: { ...enrolled().student, id: 'user-9', name: 'Second' } }),
        enrolled({ id: 'e3', student: { ...enrolled().student, id: 'user-8', name: 'Third' }, status: 'INACTIVE' }),
      ],
    },
  });
  renderPage();
  await screen.findByText('TestStudent');

  expect(screen.getByTestId('enrolled-total')).toHaveTextContent('3');

  const group = screen.getByRole('group', { name: /Filter by enrollment status/i });
  expect(within(group).getByRole('button', { name: 'All Students 3' })).toBeInTheDocument();
  expect(within(group).getByRole('button', { name: 'Active 2' })).toBeInTheDocument();
  expect(within(group).getByRole('button', { name: 'Inactive 1' })).toBeInTheDocument();
});

test('active filters render as removable chips', async () => {
  renderPage();
  await screen.findByText('TestStudent');

  fireEvent.change(screen.getByLabelText('Search enrolled students'), { target: { value: 'Test' } });

  const chip = await screen.findByRole('button', { name: /Remove search filter/ });
  expect(chip).toHaveTextContent('“Test”');

  // Removing the chip clears only that filter, not the whole toolbar.
  fireEvent.click(chip);
  await waitFor(() => expect(screen.getByLabelText('Search enrolled students')).toHaveValue(''));
});

test('bulk removal deletes only the selected enrollments and reports one summary', async () => {
  getBatchStudents.mockResolvedValue({
    data: {
      success: true,
      data: [
        enrolled(),
        enrolled({ id: 'e2', student: { ...enrolled().student, id: 'user-9', name: 'Second' } }),
      ],
    },
  });
  renderPage();
  await screen.findByText('TestStudent');

  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all enrolled students on this page' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove selected' }));
  const dialog = await screen.findByRole('dialog', { name: /Remove selected students\?/i });
  // The data-safety promise is stated before the destructive call.
  expect(dialog).toHaveTextContent(/does not delete any student account/i);

  fireEvent.click(within(dialog).getByRole('button', { name: /Remove 2 Students/ }));
  await waitFor(() => expect(deleteStudentEnrollment).toHaveBeenCalledTimes(2));
  expect(deleteStudentEnrollment).toHaveBeenCalledWith(BATCH_ID, 'user-1');
  expect(deleteStudentEnrollment).toHaveBeenCalledWith(BATCH_ID, 'user-9');
  expect(deleteStudentEnrollment).not.toHaveBeenCalledWith(BATCH_ID, 'student-doc-1');
  await waitFor(() => expect(screen.getByText(/Successfully removed 2 student\(s\)/)).toBeInTheDocument());
});

test('a failed bulk removal keeps the error visible and clears the stale selection', async () => {
  deleteStudentEnrollment.mockRejectedValueOnce(new Error('nope'));
  renderPage();
  await screen.findByText('TestStudent');

  fireEvent.click(screen.getByRole('checkbox', { name: 'Select TestStudent' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }));
  const dialog = await screen.findByRole('dialog', { name: /Remove selected students\?/i });
  fireEvent.click(within(dialog).getByRole('button', { name: /Remove 1 Student/ }));

  await waitFor(() => expect(screen.getByText('Failed to remove student')).toBeInTheDocument());
  await waitFor(() => expect(screen.queryByTestId('bulk-selection-count')).not.toBeInTheDocument());
});

test('pagination keeps the roster reachable past the first page', async () => {
  const many = Array.from({ length: 12 }, (_, i) => enrolled({
    id: `e${i}`,
    student: { ...enrolled().student, id: `user-${i}`, name: `Student ${i}` },
  }));
  getBatchStudents.mockResolvedValue({ data: { success: true, data: many } });
  renderPage();

  await screen.findByText('Student 0');
  // A page holds ten rows, so Student 11 lives on the second page only.
  expect(screen.getByText('Student 9')).toBeInTheDocument();
  expect(screen.queryByText('Student 10')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(screen.queryByText('Student 0')).not.toBeInTheDocument());
  expect(screen.getByText('Student 11')).toBeInTheDocument();

  // Paging back is possible and re-enables the forward control correctly.
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await waitFor(() => expect(screen.getByText('Student 0')).toBeInTheDocument());
});

// ─────────────────────────── PHASE 7 + 8: enrollment modal
test('Enroll modal shows header, description, search and accurate count', async () => {
  renderPage();
  const dialog = await openEnrollment();

  expect(within(dialog).getByRole('heading', { name: 'Enroll Students' })).toBeInTheDocument();
  expect(within(dialog).getByText(/Select eligible students who are not already enrolled in CSE 2024/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Search available students')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Close enrollment dialog')).toBeInTheDocument();
  expect(within(dialog).getByTestId('enroll-selection-count')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
});

test('Enroll modal submit is disabled until a student is selected', async () => {
  renderPage();
  const dialog = await openEnrollment();

  const submit = within(dialog).getByRole('button', { name: /Enroll Selected \(0\)/ });
  expect(submit).toBeDisabled();

  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Bharath' }));
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /Enroll Selected \(1\)/ })).not.toBeDisabled());
});

test('Enroll modal select-all toggles the whole eligible set', async () => {
  renderPage();
  const dialog = await openEnrollment();
  const count = within(dialog).getByTestId('enroll-selection-count');
  const selectAll = within(dialog).getByRole('checkbox', { name: 'Select all eligible students' });

  fireEvent.click(selectAll);
  // Only Bharath is eligible in this fixture: user-1 is already enrolled.
  await waitFor(() => expect(count).toHaveTextContent('1 of 1 student selected'));
  expect(selectAll).toBeChecked();

  fireEvent.click(selectAll);
  await waitFor(() => expect(count).toHaveTextContent('0 of 1 student selected'));
  expect(selectAll).not.toBeChecked();
});

test('enrolling sends the linked User id and refreshes both lists', async () => {
  renderPage();
  const dialog = await openEnrollment();

  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Bharath' }));
  fireEvent.click(within(dialog).getByRole('button', { name: /Enroll Selected \(1\)/ }));

  // user-1 is already enrolled in the default roster, so the only eligible
  // student is Bharath — and enrollment must send her linked User id.
  await waitFor(() => expect(enrollStudent).toHaveBeenCalledWith(BATCH_ID, 'user-2'));
  expect(enrollStudent.mock.calls[0][2]).not.toBe('student-doc-2');

  // Both lists are refetched after a successful enrollment.
  await waitFor(() => expect(getBatchStudents.mock.calls.length).toBeGreaterThanOrEqual(2));
  expect(getStudents.mock.calls.length).toBeGreaterThanOrEqual(2);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Enroll Students/i })).not.toBeInTheDocument());
});

test('enrolling prevents duplicate submissions while in flight', async () => {
  let resolveEnroll;
  enrollStudent.mockImplementation(() => new Promise((r) => { resolveEnroll = r; }));

  renderPage();
  const dialog = await openEnrollment();

  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Bharath' }));
  const submit = within(dialog).getByRole('button', { name: /Enroll Selected \(1\)/ });
  fireEvent.click(submit);

  // The submit button reports busy state and blocks a second submission.
  await waitFor(() => expect(submit).toBeDisabled());
  expect(submit).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(submit);
  expect(enrollStudent).toHaveBeenCalledTimes(1);

  resolveEnroll({ data: { success: true, data: { id: 'e2' } } });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Enroll Students/i })).not.toBeInTheDocument());
});

test('an API failure shows an error and preserves the selection', async () => {
  enrollStudent.mockRejectedValue({ response: { data: { message: 'Student already enrolled in this batch' } } });
  renderPage();
  const dialog = await openEnrollment();

  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Bharath' }));
  fireEvent.click(within(dialog).getByRole('button', { name: /Enroll Selected \(1\)/ }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Student already enrolled in this batch');
  // Selection preserved, no false success, list not marked enrolled.
  expect(within(dialog).getByTestId('enroll-selection-count')).toHaveTextContent('1 of 1 student selected');
  expect(getBatchStudents).toHaveBeenCalledTimes(1);
});

test('already-enrolled students are excluded by normalized id', async () => {
  renderPage();
  const dialog = await openEnrollment();

  // user-1 is enrolled in this batch, so only Bharath (user-2) is offered.
  expect(within(dialog).queryByText('TestStudent')).not.toBeInTheDocument();
  expect(within(dialog).getByText('Bharath')).toBeInTheDocument();
  expect(within(dialog).getByTestId('enroll-selection-count')).toBeInTheDocument();
});

test('modal search filters the eligible list and shows an empty state', async () => {
  renderPage();
  const dialog = await openEnrollment();

  fireEvent.change(within(dialog).getByLabelText('Search available students'), { target: { value: 'bharath' } });
  await waitFor(() => expect(within(dialog).queryByText('TestStudent')).not.toBeInTheDocument());

  fireEvent.change(within(dialog).getByLabelText('Search available students'), { target: { value: 'zzz' } });
  expect(await within(dialog).findByText('No matching students')).toBeInTheDocument();
  expect(within(dialog).getByText(/No eligible student matches the current search and filters/)).toBeInTheDocument();
});

test('Escape and the close button dismiss the modal', async () => {
  renderPage();
  let dialog = await openEnrollment();

  fireEvent.click(within(dialog).getByLabelText('Close enrollment dialog'));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Enroll Students/i })).not.toBeInTheDocument());

  dialog = await openEnrollment();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Enroll Students/i })).not.toBeInTheDocument());
});

// ───────────────────────── premium modal: filters, segments, states
/**
 * Three eligible students across two departments, two academic batches and two
 * sections, so filter interactions can be asserted independently.
 */
function useMultiDepartmentRoster() {
  getBatchStudents.mockResolvedValue({ data: { success: true, data: [] } });
  getStudents.mockResolvedValue({
    data: {
      success: true,
      data: [
        newStudent({
          _id: 'doc-a', studentId: 'doc-a', userId: 'user-a', name: 'Asha Rao',
          email: 'asha@example.com', rollNumber: 'R-001',
          department: 'CSE', section: 'A', academicBatch: { startYear: 2023, endYear: 2027 },
        }),
        newStudent({
          _id: 'doc-b', studentId: 'doc-b', userId: 'user-b', name: 'Bhavin Menon',
          email: 'bhavin@example.com', rollNumber: 'R-002',
          department: 'CSE', section: 'B', academicBatch: { startYear: 2023, endYear: 2027 },
        }),
        newStudent({
          _id: 'doc-c', studentId: 'doc-c', userId: 'user-c', name: 'Chitra Iyer',
          email: 'chitra@example.com', rollNumber: 'R-003',
          department: 'ECE', section: 'A', academicBatch: { startYear: 2024, endYear: 2028 },
        }),
      ],
    },
  });
}

test('filter options are populated from the eligible roster', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();

  const dept = within(dialog).getByLabelText('Department');
  const batch = within(dialog).getByLabelText('Academic Batch');
  const section = within(dialog).getByLabelText('Section');

  expect(within(dept).getByRole('option', { name: 'CSE' })).toBeInTheDocument();
  expect(within(dept).getByRole('option', { name: 'ECE' })).toBeInTheDocument();
  expect(within(batch).getByRole('option', { name: '2023–2027' })).toBeInTheDocument();
  expect(within(batch).getByRole('option', { name: '2024–2028' })).toBeInTheDocument();
  expect(within(section).getByRole('option', { name: 'A' })).toBeInTheDocument();
  expect(within(section).getByRole('option', { name: 'B' })).toBeInTheDocument();
});

test('department, academic batch and section filters combine', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Asha Rao');

  fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: 'CSE' } });
  await waitFor(() => expect(within(dialog).queryByText('Chitra Iyer')).not.toBeInTheDocument());
  expect(within(dialog).getByText('Asha Rao')).toBeInTheDocument();
  expect(within(dialog).getByText('Bhavin Menon')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText('Section'), { target: { value: 'B' } });
  await waitFor(() => expect(within(dialog).queryByText('Asha Rao')).not.toBeInTheDocument());
  expect(within(dialog).getByText('Bhavin Menon')).toBeInTheDocument();

  // Academic batch still narrows the same set, proving the filters compose.
  fireEvent.change(within(dialog).getByLabelText('Academic Batch'), { target: { value: '2023-2027' } });
  expect(within(dialog).getByTestId('enroll-eligible-count')).toHaveTextContent('1 of 3 eligible');

  fireEvent.change(within(dialog).getByLabelText('Academic Batch'), { target: { value: '2024-2028' } });
  expect(within(dialog).getByText('No matching students')).toBeInTheDocument();
});

test('clearing one filter does not reset the others', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Asha Rao');

  fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: 'CSE' } });
  fireEvent.change(within(dialog).getByLabelText('Section'), { target: { value: 'A' } });
  await waitFor(() => expect(within(dialog).getByTestId('enroll-eligible-count')).toHaveTextContent('1 of 3 eligible'));

  // Reset just the section.
  fireEvent.change(within(dialog).getByLabelText('Section'), { target: { value: 'ALL' } });
  expect(within(dialog).getByLabelText('Department')).toHaveValue('CSE');
  await waitFor(() => expect(within(dialog).getByTestId('enroll-eligible-count')).toHaveTextContent('2 of 3 eligible'));

  // Clear filters restores the default state, and only then is the action shown.
  fireEvent.click(within(dialog).getByRole('button', { name: /Clear filters/ }));
  await waitFor(() => expect(within(dialog).getByLabelText('Department')).toHaveValue('ALL'));
  expect(within(dialog).queryByRole('button', { name: /Clear filters/ })).not.toBeInTheDocument();
  expect(within(dialog).getByTestId('enroll-eligible-count')).toHaveTextContent('3 of 3 eligible');
});

test('department segments stay in sync with the department select', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Asha Rao');

  const segments = within(dialog).getByRole('group', { name: /Filter eligible students by department/i });
  const cse = within(segments).getByRole('button', { name: /^CSE/ });
  const all = within(segments).getByRole('button', { name: /^All Students/ });

  // Counts come from the data, and the whole roster is eligible here.
  expect(all).toHaveTextContent('All Students3');
  expect(cse).toHaveTextContent('CSE2');

  fireEvent.click(cse);
  expect(within(dialog).getByLabelText('Department')).toHaveValue('CSE');
  expect(cse).toHaveAttribute('aria-pressed', 'true');
  expect(all).toHaveAttribute('aria-pressed', 'false');

  // The select drives the segments too — one shared piece of state.
  fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: 'ECE' } });
  await waitFor(() => expect(within(segments).getByRole('button', { name: /^ECE/ })).toHaveAttribute('aria-pressed', 'true'));
  expect(cse).toHaveAttribute('aria-pressed', 'false');
});

test('avatar initials and academic data render from real data', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Asha Rao');

  const row = within(dialog).getByText('Asha Rao').closest('tr');
  expect(within(row).getByText('AR')).toBeInTheDocument();
  expect(within(row).getByText('R-001')).toBeInTheDocument();
  expect(within(row).getByText('asha@example.com')).toBeInTheDocument();
  expect(within(row).getByText(/active/i)).toBeInTheDocument();
  // The internal Student document id is never shown as identity.
  expect(within(row).queryByText(/doc-a/)).not.toBeInTheDocument();

  // The roster table is Student / Roll Number / Email / Status, so a student's
  // academic standing surfaces through the filters that scope the roster rather
  // than as its own columns. They must still be derived from the real roster.
  const deptFilter = within(dialog).getByLabelText('Department');
  const batchFilter = within(dialog).getByLabelText('Academic Batch');
  const sectionFilter = within(dialog).getByLabelText('Section');
  expect(deptFilter).toHaveValue('ALL');
  expect(within(deptFilter).getByRole('option', { name: 'CSE' })).toBeInTheDocument();
  expect(within(deptFilter).getByRole('option', { name: 'ECE' })).toBeInTheDocument();
  // Dash-agnostic: the option label and the filter value format the range
  // differently, and this asserts the range, not the glyph.
  expect(within(batchFilter).getByRole('option', { name: /2023.2027/ })).toBeInTheDocument();
  expect(within(batchFilter).getByRole('option', { name: /2024.2028/ })).toBeInTheDocument();
  expect(within(sectionFilter).getByRole('option', { name: 'A' })).toBeInTheDocument();
  expect(within(sectionFilter).getByRole('option', { name: 'B' })).toBeInTheDocument();

  // And those values really filter the table they scope.
  fireEvent.change(batchFilter, { target: { value: '2024-2028' } });
  await waitFor(() => expect(within(dialog).queryByText('Asha Rao')).not.toBeInTheDocument());
  expect(within(dialog).getByText('Chitra Iyer')).toBeInTheDocument();
});

test('legacy students without year fields render a neutral placeholder', async () => {
  getBatchStudents.mockResolvedValue({ data: { success: true, data: [] } });
  getStudents.mockResolvedValue({
    data: {
      success: true,
      data: [
        {
          _id: 'doc-x', studentId: 'doc-x', userId: 'user-x', name: 'Legacy Person',
          email: 'legacy@example.com', rollNumber: null, department: null,
          section: null, academicBatch: null, status: 'ACTIVE',
        },
      ],
    },
  });
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Legacy Person');

  const row = within(dialog).getByText('Legacy Person').closest('tr');
  // A missing roll number gets the neutral em-dash placeholder, not "null".
  expect(within(row).getByText('—')).toBeInTheDocument();
  // The fields that are present still render normally.
  expect(within(row).getByText('legacy@example.com')).toBeInTheDocument();
  expect(within(row).getByText(/active/i)).toBeInTheDocument();

  // No academic-batch or section option can be derived from null fields, so
  // both filters stay at their default and offer nothing to narrow by.
  expect(within(dialog).getByLabelText('Academic Batch')).toHaveValue('ALL');
  expect(within(dialog).getByLabelText('Section')).toHaveValue('ALL');
  expect(within(dialog).getByLabelText('Academic Batch').querySelectorAll('option').length).toBe(1);
  expect(within(dialog).getByLabelText('Section').querySelectorAll('option').length).toBe(1);

  // The student stays visible and selectable rather than disappearing.
  expect(within(dialog).getByRole('checkbox', { name: /Select Legacy Person/i })).toBeInTheDocument();
});

test('header checkbox reports an indeterminate state for a partial selection', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Asha Rao');

  const selectAll = within(dialog).getByRole('checkbox', { name: 'Select all eligible students' });
  expect(selectAll.indeterminate).toBe(false);

  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Asha Rao' }));
  await waitFor(() => expect(selectAll.indeterminate).toBe(true));
  expect(selectAll).not.toBeChecked();

  fireEvent.click(selectAll);
  await waitFor(() => expect(selectAll.indeterminate).toBe(false));
  expect(within(dialog).getByTestId('enroll-selection-count')).toHaveTextContent('3 of 3 students selected');
});

test('select-all applies to the filtered set only', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Asha Rao');

  fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: 'CSE' } });
  await waitFor(() => expect(within(dialog).queryByText('Chitra Iyer')).not.toBeInTheDocument());

  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select all eligible students' }));
  // Only the two visible CSE rows are selected; ECE is untouched.
  expect(within(dialog).getByTestId('enroll-selection-count')).toHaveTextContent('2 of 3 students selected');
  expect(within(dialog).getByRole('checkbox', { name: 'Select Asha Rao' })).toBeChecked();
  expect(within(dialog).getByRole('checkbox', { name: 'Select Bhavin Menon' })).toBeChecked();
});

test('selecting through a filter never enrolls a hidden student', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Asha Rao');

  fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: 'CSE' } });
  await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Select Asha Rao' })).toBeInTheDocument());
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Asha Rao' }));

  fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: 'ECE' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Enroll Selected \(1\)/ }));

  await waitFor(() => expect(enrollStudent).toHaveBeenCalledTimes(1));
  expect(enrollStudent).toHaveBeenCalledWith(BATCH_ID, 'user-a');
  expect(enrollStudent).not.toHaveBeenCalledWith(BATCH_ID, 'doc-a');
});

test('the no-eligible-students state explains why the list is empty', async () => {
  getStudents.mockResolvedValue({ data: { success: true, data: [] } });
  renderPage();
  const dialog = await openEnrollment();

  expect(await within(dialog).findByText('No eligible students available')).toBeInTheDocument();
  expect(within(dialog).getByText(/Every active student is already enrolled in CSE 2024/)).toBeInTheDocument();
  expect(within(dialog).getByTestId('enroll-eligible-count')).toHaveTextContent('0 of 0 eligible');
});

test('a roster load failure shows an error and Retry instead of an empty list', async () => {
  getStudents.mockRejectedValueOnce({ response: { data: { message: 'Students service unavailable' } } });
  renderPage();
  const dialog = await openEnrollment();

  expect(await within(dialog).findByText('Could not load students')).toBeInTheDocument();
  expect(within(dialog).getByText('Students service unavailable')).toBeInTheDocument();
  // Crucially, not a silent empty state.
  expect(within(dialog).queryByText('No eligible students available')).not.toBeInTheDocument();

  const before = getStudents.mock.calls.length;
  fireEvent.click(within(dialog).getByRole('button', { name: /Retry/ }));
  await waitFor(() => expect(getStudents.mock.calls.length).toBeGreaterThan(before));
  // Bharath is the only eligible student in the default fixture.
  await within(dialog).findByText('Bharath');
  expect(within(dialog).queryByText('Could not load students')).not.toBeInTheDocument();
});

test('the submit button is disabled until at least one student is selected', async () => {
  useMultiDepartmentRoster();
  renderPage();
  const dialog = await openEnrollment();
  await within(dialog).findByText('Asha Rao');

  const submit = within(dialog).getByRole('button', { name: /Enroll Selected \(0\)/ });
  expect(submit).toBeDisabled();

  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Select Asha Rao' }));
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /Enroll Selected \(1\)/ })).not.toBeDisabled());
});

// ─────────────────────────── existing behaviour preserved
test('row actions expose accessible labels and keep their handlers', async () => {
  renderPage();
  await screen.findByText('TestStudent');

  const deactivate = screen.getByRole('button', { name: 'Deactivate TestStudent' });
  // Re-query after the status change re-renders the table.

  fireEvent.click(deactivate);
  const confirmDialog = await screen.findByRole('dialog', { name: /Deactivate student\?/i });
  expect(confirmDialog).toHaveTextContent(/deactivate TestStudent/i);
  // The copy must describe the enrollment, not the account: this endpoint only
  // flips BatchStudent.status and never blocks sign-in.
  expect(confirmDialog).toHaveTextContent(/can still sign in/i);
  expect(confirmDialog).not.toHaveTextContent(/no longer be able to sign in/i);
  fireEvent.click(within(confirmDialog).getByRole('button', { name: /Deactivate Student/ }));
  await waitFor(() => expect(updateStudentEnrollment).toHaveBeenCalledWith(BATCH_ID, 'user-1', 'INACTIVE'));

  fireEvent.click(screen.getByRole('button', { name: 'Remove TestStudent from batch' }));
  const removeDialog = await screen.findByRole('dialog', { name: /Remove student from batch\?/i });
  // Data-safety guarantee stays visible before the destructive call.
  expect(removeDialog).toHaveTextContent(/does not delete their student account/i);
  fireEvent.click(within(removeDialog).getByRole('button', { name: /Remove from Batch/ }));
  await waitFor(() => expect(deleteStudentEnrollment).toHaveBeenCalledWith(BATCH_ID, 'user-1'));
});

test('trainer assignment submits the selected trainer', async () => {
  getTrainers.mockResolvedValue({
    data: { success: true, data: [{ id: 'trainer-2', name: 'Second Trainer', email: 'second@gmail.com' }] },
  });
  renderPage();
  await screen.findByText('Test Trainer');

  fireEvent.click(screen.getByRole('button', { name: 'Change Trainer' }));
  const dialog = await screen.findByRole('dialog', { name: /Change trainer/i });
  fireEvent.change(within(dialog).getByLabelText('Trainer'), { target: { value: 'trainer-2' } });
  fireEvent.change(within(dialog).getByLabelText('Search trainers'), { target: { value: 'second' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Assignment/ }));

  await waitFor(() => expect(updateBatch).toHaveBeenCalledWith(BATCH_ID, { trainer: 'trainer-2' }));
});