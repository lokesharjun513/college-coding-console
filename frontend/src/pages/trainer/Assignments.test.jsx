// Tests for trainer/Assignments.jsx — batch selection, list, create, edit,
// soft delete, 409 duplicate handling and API errors.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Assignments from './Assignments';
import {
  getTrainerBatches,
  getBatchAssignments,
  getAssignableProblems,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} from '../../api/trainer';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../api/trainer', () => ({
  getTrainerBatches: vi.fn(),
  getBatchAssignments: vi.fn(),
  getAssignableProblems: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
}));

const BATCH_ID = 'batch-1';

const batchesResponse = {
  data: {
    success: true,
    data: [
      { id: 'batch-1', name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE', studentCount: 4 },
      { id: 'batch-2', name: 'IT 2024', code: 'IT24', status: 'ACTIVE', studentCount: 2 },
    ],
  },
};

const problemsResponse = {
  data: {
    success: true,
    data: [
      { id: 'p-global', title: 'Two Sum', slug: 'two-sum', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' },
      { id: 'p-own', title: 'Binary Search', slug: 'binary-search', difficulty: 'MEDIUM', scope: 'BATCH', status: 'PUBLISHED' },
    ],
  },
};

const assignment = (overrides = {}) => ({
  id: 'a1',
  problem: { id: 'p-global', title: 'Two Sum', slug: 'two-sum', difficulty: 'EASY', scope: 'GLOBAL', status: 'PUBLISHED' },
  batch: BATCH_ID,
  title: null,
  availableFrom: null,
  status: 'ACTIVE',
  deleted: false,
  monitoring: { enrolledStudents: 4, completed: 1, pending: 3 },
  ...overrides,
});

const assignmentsResponse = (data) => ({ data: { success: true, data } });

function renderScoped() {
  return render(
    <MemoryRouter initialEntries={[`/trainer/batches/${BATCH_ID}/assignments`]}>
      <Routes>
        <Route path="/trainer/batches/:batchId/assignments" element={<Assignments />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPicker() {
  return render(
    <MemoryRouter initialEntries={['/trainer/assignments']}>
      <Routes>
        <Route path="/trainer/assignments" element={<Assignments />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTrainerBatches.mockResolvedValue(batchesResponse);
  getBatchAssignments.mockResolvedValue(assignmentsResponse([]));
  getAssignableProblems.mockResolvedValue(problemsResponse);
  createAssignment.mockResolvedValue({ data: { success: true, data: assignment() } });
  updateAssignment.mockResolvedValue({ data: { success: true, data: assignment() } });
  deleteAssignment.mockResolvedValue({ data: { success: true, data: assignment({ deleted: true }) } });
});

// ---------------------------------------------------------------- picker
test('batch picker lists the trainer batches and navigates on select', async () => {
  renderPicker();

  await screen.findByText('CSE 2024');
  expect(screen.getByText('IT 2024')).toBeInTheDocument();

  // The scoped APIs must not be called before a batch is chosen.
  expect(getBatchAssignments).not.toHaveBeenCalled();

  const row = screen.getByText('CSE 2024').closest('li');
  fireEvent.click(within(row).getByRole('button', { name: /Manage Assignments/i }));
  expect(mockNavigate).toHaveBeenCalledWith('/trainer/batches/batch-1/assignments');
});

test('batch picker shows an empty state when no batches exist', async () => {
  getTrainerBatches.mockResolvedValue({ data: { success: true, data: [] } });
  renderPicker();

  await waitFor(() => expect(screen.getByText(/No batches assigned to you yet/i)).toBeInTheDocument());
  expect(getBatchAssignments).not.toHaveBeenCalled();
});

test('batch picker surfaces an API error with retry', async () => {
  getTrainerBatches.mockRejectedValueOnce({ response: { data: { message: 'Network down' } } });
  renderPicker();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Network down');

  getTrainerBatches.mockResolvedValue(batchesResponse);
  fireEvent.click(within(alert).getByRole('button', { name: /Retry/i }));
  await screen.findByText('CSE 2024');
});

// ---------------------------------------------------------------- list
test('lists assignments with status, availability and completion counts', async () => {
  getBatchAssignments.mockResolvedValue(assignmentsResponse([
    assignment({ id: 'a1', title: 'Week 1 practice', availableFrom: '2026-10-01T00:00:00.000Z' }),
    assignment({
      id: 'a2',
      status: 'CANCELLED',
      title: 'Old drill',
      problem: { id: 'p-own', title: 'Binary Search', slug: 'bs', difficulty: 'MEDIUM', scope: 'BATCH', status: 'PUBLISHED' },
      monitoring: { enrolledStudents: 2, completed: 2, pending: 0 },
    }),
  ]));
  renderScoped();

  await screen.findByText('Week 1 practice');

  expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  expect(screen.getByText('CANCELLED')).toBeInTheDocument();
  // One "Available …" label per assignment row.
  expect(screen.getAllByText(/Available/).length).toBeGreaterThan(0);
  
  // 1 of 4 enrolled = 25%; 2 of 2 = 100%
  expect(screen.getByText(/1 completed · 3 pending · 4 enrolled · 25%/)).toBeInTheDocument();
  expect(screen.getByText(/2 completed · 0 pending · 2 enrolled · 100%/)).toBeInTheDocument();
});

test('omits the completion percentage when the API supplies no usable denominator', async () => {
  getBatchAssignments.mockResolvedValue(assignmentsResponse([
    assignment({ id: 'a1', monitoring: { enrolledStudents: 0, completed: 0, pending: 0 } }),
  ]));
  renderScoped();

  await screen.findByText('Two Sum');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

test('shows an empty state when the batch has no assignments', async () => {
  renderScoped();
  await waitFor(() => expect(screen.getByText(/No assignments yet/i)).toBeInTheDocument());
});

test('surfaces a list API error with retry', async () => {
  getBatchAssignments.mockRejectedValue({ response: { data: { message: 'Access denied' } } });
  renderScoped();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Access denied');

  getBatchAssignments.mockResolvedValue(assignmentsResponse([assignment()]));
  fireEvent.click(within(alert).getByRole('button', { name: /Retry/i }));
  await screen.findByText('Two Sum');
});

// ---------------------------------------------------------------- create
test('creates an assignment with the supported fields only (no dueDate)', async () => {
  renderScoped();
  await screen.findByText(/No assignments yet/i);

  fireEvent.click(screen.getByRole('button', { name: /New Assignment/i }));

  fireEvent.change(screen.getByLabelText('Problem'), { target: { value: 'p-own' } });
  fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: '  Week 2 drill  ' } });
  fireEvent.change(screen.getByLabelText(/Available from/i), { target: { value: '2026-10-15' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'CANCELLED' } });

  fireEvent.click(screen.getByRole('button', { name: /Create Assignment/i }));

  await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(1));
  expect(createAssignment).toHaveBeenCalledWith(BATCH_ID, {
    problemId: 'p-own',
    title: 'Week 2 drill',
    availableFrom: '2026-10-15',
    status: 'CANCELLED',
  });
  // The API has no dueDate — the payload must never contain one.
  expect(createAssignment.mock.calls[0][1]).not.toHaveProperty('dueDate');
});

test('only offers published, authorised problems from the API catalogue', async () => {
  renderScoped();
  await screen.findByText(/No assignments yet/i);

  fireEvent.click(screen.getByRole('button', { name: /New Assignment/i }));
  const select = screen.getByLabelText('Problem');

  const values = within(select).getAllByRole('option').map((o) => o.value);
  expect(values).toContain('p-global');
  expect(values).toContain('p-own');
  // No unpublished/inaccessible problem is ever rendered as an option.
  expect(values).toEqual(['', 'p-global', 'p-own']);
});

test('disables submit when no problem is chosen', async () => {
  renderScoped();
  await screen.findByText(/No assignments yet/i);

  fireEvent.click(screen.getByRole('button', { name: /New Assignment/i }));
  expect(screen.getByRole('button', { name: /Create Assignment/i })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Create Assignment/i }));
  expect(createAssignment).not.toHaveBeenCalled();
});

test('prevents duplicate submissions in the UI', async () => {
  let resolveCreate;
  createAssignment.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));

  renderScoped();
  await screen.findByText(/No assignments yet/i);

  fireEvent.click(screen.getByRole('button', { name: /New Assignment/i }));
  fireEvent.change(screen.getByLabelText('Problem'), { target: { value: 'p-global' } });

  const submit = screen.getByRole('button', { name: /Create Assignment/i });
  fireEvent.click(submit);
  await waitFor(() => expect(submit).toBeDisabled());

  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(createAssignment).toHaveBeenCalledTimes(1);

  resolveCreate({ data: { success: true, data: assignment() } });
  await waitFor(() => expect(getBatchAssignments).toHaveBeenCalledTimes(2));
});

test('shows a clear message when the API returns 409 duplicate', async () => {
  createAssignment.mockRejectedValue({
    response: { status: 409, data: { message: 'already exists', code: 'DUPLICATE_ASSIGNMENT' } },
  });
  renderScoped();
  await screen.findByText(/No assignments yet/i);

  fireEvent.click(screen.getByRole('button', { name: /New Assignment/i }));
  fireEvent.change(screen.getByLabelText('Problem'), { target: { value: 'p-global' } });
  fireEvent.click(screen.getByRole('button', { name: /Create Assignment/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This problem is already assigned to this batch for that date.'
  );
});

test('shows a non-409 create error message', async () => {
  createAssignment.mockRejectedValue({ response: { status: 400, data: { message: 'Only published problems can be assigned' } } });
  renderScoped();
  await screen.findByText(/No assignments yet/i);

  fireEvent.click(screen.getByRole('button', { name: /New Assignment/i }));
  fireEvent.change(screen.getByLabelText('Problem'), { target: { value: 'p-global' } });
  fireEvent.click(screen.getByRole('button', { name: /Create Assignment/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Only published problems can be assigned');
});

// ---------------------------------------------------------------- edit
test('edits title, availableFrom and status only', async () => {
  getBatchAssignments.mockResolvedValue(assignmentsResponse([
    assignment({ id: 'a1', title: 'Week 1', availableFrom: '2026-10-01T00:00:00.000Z', status: 'ACTIVE' }),
  ]));
  renderScoped();

  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Week 1 revised' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'COMPLETED' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

  await waitFor(() => expect(updateAssignment).toHaveBeenCalledTimes(1));
  expect(updateAssignment).toHaveBeenCalledWith(BATCH_ID, 'a1', {
    title: 'Week 1 revised',
    availableFrom: '2026-10-01',
    status: 'COMPLETED',
  });
  expect(updateAssignment.mock.calls[0][2]).not.toHaveProperty('problem');
  expect(updateAssignment.mock.calls[0][2]).not.toHaveProperty('batch');
  expect(updateAssignment.mock.calls[0][2]).not.toHaveProperty('trainer');
  expect(updateAssignment.mock.calls[0][2]).not.toHaveProperty('dueDate');
});

test('reports a 409 when an edit collides with another assignment date', async () => {
  getBatchAssignments.mockResolvedValue(assignmentsResponse([assignment({ id: 'a1', availableFrom: '2026-10-01T00:00:00.000Z' })]));
  updateAssignment.mockRejectedValue({ response: { status: 409, data: { message: 'conflict' } } });
  renderScoped();

  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Available from'), { target: { value: '2026-11-01' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Another assignment already uses this problem for that date.'
  );
});

// ---------------------------------------------------------------- delete
test('soft delete requires confirmation and then refreshes the list', async () => {
  getBatchAssignments.mockResolvedValue(assignmentsResponse([assignment({ id: 'a1' })]));
  renderScoped();

  const openDeleteDialog = async () => {
    const row = (await screen.findByText('Two Sum')).closest('li');
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    return screen.findByRole('dialog');
  };

  const dialog = await openDeleteDialog();
  expect(within(dialog).getByText(/The record is kept for reporting/i)).toBeInTheDocument();

  // Cancelling must not delete.
  fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(deleteAssignment).not.toHaveBeenCalled();

  const dialog2 = await openDeleteDialog();
  fireEvent.click(within(dialog2).getByRole('button', { name: 'Remove' }));

  await waitFor(() => expect(deleteAssignment).toHaveBeenCalledWith(BATCH_ID, 'a1'));
  await waitFor(() => expect(getBatchAssignments).toHaveBeenCalledTimes(2));
});