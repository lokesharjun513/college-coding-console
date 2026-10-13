// Tests for student/AssignmentFeed.jsx — pending vs completed, start action
// navigation, loading/empty/error states, and the rule that a local click or a
// wrong answer can never complete an assignment.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AssignmentFeed from './AssignmentFeed';
import { getStudentAssignments } from '../../api/student';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../api/student', () => ({
  getStudentAssignments: vi.fn(),
}));

const pendingAssignment = {
  id: 'a1',
  title: null,
  problem: {
    id: 'p1',
    title: 'Two Sum',
    difficulty: 'EASY',
    description: 'Find two indices',
    examples: [{ input: 'nums=[2,7]', output: '[0,1]' }],
  },
  batch: { id: 'b1', name: 'CSE 2024', code: 'CSE24' },
  availableFrom: null,
  status: 'ACTIVE',
  completed: false,
  completion: null,
};

const completedAssignment = {
  id: 'a2',
  title: 'Week 1 practice',
  problem: {
    id: 'p2',
    title: 'Binary Search',
    difficulty: 'MEDIUM',
    description: 'Binary search',
    examples: [],
  },
  batch: { id: 'b1', name: 'CSE 2024', code: 'CSE24' },
  availableFrom: '2026-10-01T00:00:00.000Z',
  status: 'ACTIVE',
  completed: true,
  completion: { verdict: 'ACCEPTED', completedAt: '2026-10-05T10:00:00.000Z' },
};

const response = (data, meta = {}) => ({
  data: { success: true, data, meta: { enrolled: true, activeBatches: 1, total: data.length, ...meta } },
});

beforeEach(() => {
  vi.clearAllMocks();
  getStudentAssignments.mockResolvedValue(response([]));
});

test('shows a loading state during the request', async () => {
  let resolve;
  getStudentAssignments.mockImplementation(() => new Promise((r) => { resolve = r; }));

  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  expect(screen.getByRole('status')).toHaveTextContent('Loading your assignments…');

  resolve(response([pendingAssignment]));
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());
  expect(screen.queryByText('Loading your assignments…')).not.toBeInTheDocument();
});

test('shows an empty state when the API returns no assignments', async () => {
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText(/No assignments are available right now/i)).toBeInTheDocument());
});

test('shows an API error with a retry that refetches', async () => {
  getStudentAssignments.mockRejectedValueOnce({ response: { data: { message: 'Network down' } } });
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Network down');

  getStudentAssignments.mockResolvedValue(response([pendingAssignment]));
  fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
  await screen.findByText('Two Sum');
  expect(getStudentAssignments).toHaveBeenCalledTimes(2);
});

test('separates pending and completed assignments', async () => {
  getStudentAssignments.mockResolvedValue(response([pendingAssignment, completedAssignment]));
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  await screen.findByText('Two Sum');

  const pendingGroup = screen.getByRole('heading', { name: /Pending \(1\)/ }).parentElement;
  expect(pendingGroup).toHaveTextContent('Two Sum');
  expect(pendingGroup).not.toHaveTextContent('Week 1 practice');

  const completedGroup = screen.getByRole('heading', { name: /Completed \(1\)/ }).parentElement;
  // The completed card renders the explicit assignment title, not the problem title.
  expect(completedGroup).toHaveTextContent('Week 1 practice');
  expect(completedGroup).not.toHaveTextContent('Two Sum');

  expect(screen.getByText('Pending (1)')).toBeInTheDocument();
  expect(screen.getByText('Completed (1)')).toBeInTheDocument();
});

test('displays title, batch, availability and completion time', async () => {
  getStudentAssignments.mockResolvedValue(response([pendingAssignment, completedAssignment]));
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  await screen.findByText('Two Sum');

  // Explicit assignment title wins over the problem title.
  expect(screen.getByText('Week 1 practice')).toBeInTheDocument();
  expect(screen.getAllByText(/CSE 2024 · CSE24/).length).toBe(2);
  expect(screen.getByText('Available now')).toBeInTheDocument();
  // "Completed <date>" from the completion record, not the "Completed (n)" heading.
  expect(screen.getByText(/^Completed \d/)).toBeInTheDocument();
});

test('Start navigates to the existing problem-solving route', async () => {
  getStudentAssignments.mockResolvedValue(response([pendingAssignment]));
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: /Start Two Sum/i }));
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/p1');
});

test('a completed assignment offers Review on the same solving route', async () => {
  getStudentAssignments.mockResolvedValue(response([completedAssignment]));
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: /Review Binary Search/i }));
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/p2');
});

test('clicking Start never marks an assignment completed locally', async () => {
  getStudentAssignments.mockResolvedValue(response([pendingAssignment]));
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  const start = await screen.findByRole('button', { name: /Start Two Sum/i });
  fireEvent.click(start);

  // Still Pending, no refetch triggered, no optimistic completion.
  expect(screen.getByText('Pending (1)')).toBeInTheDocument();
  expect(screen.queryByText('Completed (1)')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Start Two Sum/i })).toBeInTheDocument();
  expect(getStudentAssignments).toHaveBeenCalledTimes(1);
});

test('completion state is only ever what the API returned', async () => {
  // A submission that was wrong does not appear anywhere in this response,
  // so nothing may be inferred from submissions or from a click.
  getStudentAssignments.mockResolvedValue({
    data: {
      success: true,
      data: [{ ...pendingAssignment, problem: { ...pendingAssignment.problem } }],
      meta: { enrolled: true, activeBatches: 1, total: 1, completed: 0, pending: 1 },
    },
  });
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  await screen.findByText('Two Sum');
  expect(screen.getByText('Pending (1)')).toBeInTheDocument();
  expect(screen.getByText(/0 completed · 1 pending/)).toBeInTheDocument();
});

test('renders no hidden test-case data even if a problem carries examples', async () => {
  getStudentAssignments.mockResolvedValue(response([pendingAssignment]));
  const { container } = render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  await screen.findByText('Two Sum');
  const html = container.innerHTML;
  expect(html).not.toContain('expectedOutput');
  expect(html).not.toContain('isHidden');
  expect(html).not.toContain('testCases');
});

test('refetches on window focus so a just-accepted submission is reflected', async () => {
  getStudentAssignments.mockResolvedValue(response([pendingAssignment]));
  render(<MemoryRouter><AssignmentFeed /></MemoryRouter>);

  await screen.findByText('Two Sum');
  expect(getStudentAssignments).toHaveBeenCalledTimes(1);

  getStudentAssignments.mockResolvedValue(response([{ ...pendingAssignment, completed: true, completion: { verdict: 'ACCEPTED', completedAt: '2026-10-05T10:00:00.000Z' } }]));
  window.dispatchEvent(new Event('focus'));

  await waitFor(() => expect(screen.getByText('Completed (1)')).toBeInTheDocument());
  expect(getStudentAssignments).toHaveBeenCalledTimes(2);
});