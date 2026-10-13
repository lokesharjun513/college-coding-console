// Tests for admin/Students.jsx — academic batch display and the status control.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Students from './Students';
import { getStudents, updateStudent } from '../../api/admin';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual };
});

vi.mock('../../api/admin', () => ({
  getStudents: vi.fn(),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  deleteStudent: vi.fn(),
  downloadStudentTemplate: vi.fn(),
}));

const CURRENT_YEAR = new Date().getFullYear();

const student = (overrides = {}) => ({
  _id: 'student-doc-1',
  studentId: 'student-doc-1',
  userId: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  rollNumber: 'R001',
  department: 'CSE',
  section: 'A',
  startYear: CURRENT_YEAR,
  endYear: CURRENT_YEAR + 3,
  academicBatch: { label: `${CURRENT_YEAR}–${CURRENT_YEAR + 3}` },
  currentAcademicYear: { label: '1st Year' },
  status: 'ACTIVE',
  ...overrides,
});

const listResponse = (data) => ({ data: { success: true, data } });

beforeEach(() => {
  vi.clearAllMocks();
  getStudents.mockResolvedValue(listResponse([
    student(),
    student({
      _id: 'student-doc-2', studentId: 'student-doc-2', userId: 'user-2',
      name: 'Grace Hopper', email: 'grace@example.com', rollNumber: 'R002',
      startYear: CURRENT_YEAR + 1, endYear: CURRENT_YEAR + 5,
      academicBatch: { label: `${CURRENT_YEAR + 1}–${CURRENT_YEAR + 5}` },
      currentAcademicYear: { label: 'Not Started' },
      status: 'INACTIVE',
    }),
  ]));
  updateStudent.mockResolvedValue({ data: { success: true, data: { status: 'INACTIVE' } } });
});

function renderPage() {
  return render(<MemoryRouter><Students /></MemoryRouter>);
}

// ------------------------------------------------------------ Issue 1
test('shows the academic batch label and the calculated current year', async () => {
  renderPage();

  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  // Scope to the table to avoid matching the filter dropdown
  const table = within(screen.getByRole('table'));
  expect(table.getByText(`${CURRENT_YEAR}–${CURRENT_YEAR + 3}`)).toBeInTheDocument();
  expect(table.getByText(`${CURRENT_YEAR + 1}–${CURRENT_YEAR + 5}`)).toBeInTheDocument();
  expect(table.getByText('1st Year')).toBeInTheDocument();
  expect(table.getByText('Not Started')).toBeInTheDocument();
});

test('renders an em dash for legacy students with no academic years', async () => {
  getStudents.mockResolvedValue(listResponse([
    student({
      _id: 'legacy', studentId: 'legacy', userId: 'user-legacy',
      name: 'Legacy Student',
      startYear: null, endYear: null,
      academicBatch: { startYear: null, endYear: null, label: null },
      currentAcademicYear: null,
    }),
  ]));
  renderPage();

  await waitFor(() => expect(screen.getByText('Legacy Student')).toBeInTheDocument());
  const cells = screen.getAllByText('—');
  expect(cells.length).toBeGreaterThanOrEqual(2); // academic batch + current year
});

// ------------------------------------------------------------ Issue 2
test('renders a readable Active/Inactive badge rather than a raw enum', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  // Scoped to the table: the KPI card and status filter also say "Active".
  const table = within(screen.getByRole('table'));
  expect(table.getByText('Active')).toBeInTheDocument();
  expect(table.getByText('Inactive')).toBeInTheDocument();
  // The raw SCREAMING enum value must not be what users read.
  expect(table.queryByText('ACTIVE')).not.toBeInTheDocument();
  expect(table.queryByText('INACTIVE')).not.toBeInTheDocument();
});

test('shows an explicit, keyboard-accessible action per row', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  const deactivate = screen.getByRole('button', { name: 'Deactivate Ada Lovelace' });
  const activate = screen.getByRole('button', { name: 'Activate Grace Hopper' });
  expect(deactivate.tagName).toBe('BUTTON');
  expect(activate.tagName).toBe('BUTTON');
  expect(deactivate).not.toBeDisabled();
});

// ------------------------------------------------------------ Issue 2
test('the status badge itself is the toggle button', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
  const table = within(screen.getByRole('table'));

  const toggle = table.getByRole('button', { name: 'Deactivate Ada Lovelace' });
  // The badge classes come from the shared admin.css badge rules.
  expect(toggle).toHaveClass('admin-badge');
  expect(toggle).toHaveClass('admin-badge--status');
  expect(toggle).toHaveClass('admin-badge--active');
  expect(toggle).toHaveTextContent('Active');

  // No separate Activate/Deactivate text button remains in the table.
  const standaloneLabels = within(screen.getByRole('table'))
    .getAllByRole('button')
    .filter((b) => ['Activate', 'Deactivate'].includes(b.textContent.trim()));
  expect(standaloneLabels).toHaveLength(0);

  const inactiveToggle = table.getByRole('button', { name: 'Activate Grace Hopper' });
  expect(inactiveToggle).toHaveClass('admin-badge--inactive');
  expect(inactiveToggle).toHaveTextContent('Inactive');
});

test('clicking the Active badge opens the deactivation confirmation', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Deactivate Ada Lovelace' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/inactive/i)).toBeInTheDocument();
  expect(updateStudent).not.toHaveBeenCalled();
});

test('clicking the Inactive badge activates immediately', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());

  fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Activate Grace Hopper' }));

  await waitFor(() => expect(updateStudent).toHaveBeenCalledWith('student-doc-2', { status: 'ACTIVE' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

// ------------------------------------------------------------ Issue 1
test('the avatar and name reuse the shared admin avatar styles', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
  const table = within(screen.getByRole('table'));

  const cell = table.getByText('Ada Lovelace').closest('td');
  const avatar = within(cell).getByText('AL');
  expect(avatar).toHaveClass('admin-avatar');
  expect(avatar).toHaveClass('admin-avatar--student');

  // The Student ID is no longer rendered beneath the name; roll number stays
  // in its own column.
  expect(table.queryByText(/^ID:/)).not.toBeInTheDocument();
  expect(table.getByText('R001')).toBeInTheDocument();
});

test('activating an inactive student calls PATCH with only { status }', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Activate Grace Hopper' }));

  await waitFor(() => expect(updateStudent).toHaveBeenCalledTimes(1));
  expect(updateStudent).toHaveBeenCalledWith('student-doc-2', { status: 'ACTIVE' });
});

test('deactivating asks for confirmation before calling the API', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Deactivate Ada Lovelace' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/inactive/i)).toBeInTheDocument();
  expect(updateStudent).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole('button', { name: /Yes, Deactivate/i }));
  await waitFor(() => expect(updateStudent).toHaveBeenCalledWith('student-doc-1', { status: 'INACTIVE' }));
});

test('cancelling the confirmation does not call the API', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Deactivate Ada Lovelace' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(updateStudent).not.toHaveBeenCalled();
});

test('shows disabled/working feedback and blocks duplicate requests', async () => {
  let resolveUpdate;
  updateStudent.mockImplementation(() => new Promise((r) => { resolveUpdate = r; }));

  renderPage();
  await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());

  const activate = screen.getByRole('button', { name: 'Activate Grace Hopper' });
  fireEvent.click(activate);

  // Wait for API call to be made
  await waitFor(() => expect(updateStudent).toHaveBeenCalledTimes(1));

  // Button should be disabled and show busy state during request
  await waitFor(() => {
    expect(activate).toBeDisabled();
    expect(activate.getAttribute('aria-busy')).toBe('true');
  });

  resolveUpdate({ data: { success: true, data: { status: 'ACTIVE' } } });

  // After resolution, button should no longer be disabled or busy
  await waitFor(() => {
    expect(activate).not.toBeDisabled();
    expect(activate.getAttribute('aria-busy')).toBeNull();
  });
});

test('keeps the UI in step with the server response', async () => {
  updateStudent.mockResolvedValue({ data: { success: true, data: { status: 'INACTIVE' } } });
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Deactivate Ada Lovelace' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Yes, Deactivate/i }));

  // The row now offers "Activate" because the server returned INACTIVE,
  // without a full refetch.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Activate Ada Lovelace' })).toBeInTheDocument());
  expect(getStudents).toHaveBeenCalledTimes(1);
});

test('surfaces a success notification', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Activate Grace Hopper' }));
  await waitFor(() => expect(screen.getByText('Grace Hopper is now active')).toBeInTheDocument());
});

test('surfaces an API error and leaves the row unchanged', async () => {
  updateStudent.mockRejectedValue({ response: { data: { message: 'Invalid status' } } });
  renderPage();
  await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Activate Grace Hopper' }));

  await waitFor(() => expect(screen.getByText('Invalid status')).toBeInTheDocument());
  // Still shows the original action, so the UI did not drift optimistically.
  expect(screen.getByRole('button', { name: 'Activate Grace Hopper' })).toBeInTheDocument();
});