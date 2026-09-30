// Tests for Problems.jsx – deduplication, today assignment, progress, navigation
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Problems from './Problems';
import { getStudentProblems } from '../../api/student';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock API calls
vi.mock('../../api/student', () => ({
  getStudentProblems: vi.fn(),
  getStudentCollections: vi.fn(() => Promise.resolve({ data: { success: true, data: [] } })),
  getStudentCollectionTopics: vi.fn(() => Promise.resolve({ data: { success: true, data: [] } })),
  getStudentTopicProblems: vi.fn(() => Promise.resolve({ data: { success: true, data: [] } })),
}));

const mockData = {
  success: true,
  data: [
    { id: '1', title: 'Problem A', description: 'Desc A', progress: 'SOLVED', scope: 'BATCH', topic: 'Math', difficulty: 'EASY' },
    { id: '2', title: 'Problem B', description: 'Desc B', progress: 'ATTEMPTED', scope: 'GLOBAL', topic: 'Algo', difficulty: 'MEDIUM' },
    { id: '3', title: 'Problem C', description: 'Desc C', progress: 'NOT_STARTED', scope: 'BATCH', topic: 'Data', difficulty: 'HARD' },
    // duplicate ID – should be deduped
    { id: '1', title: 'Problem A Duplicate', description: 'Desc dup', progress: 'SOLVED', scope: 'BATCH', topic: 'Math', difficulty: 'EASY' },
  ],
  meta: {
    enrolled: true,
    today: [{ id: '1', title: 'Problem A' }],
    upcoming: [],
    global: [{ id: '2', title: 'Problem B' }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getStudentProblems.mockResolvedValue({ data: mockData });
});

test('renders today assigned problems without duplicates', async () => {
  render(
    <MemoryRouter>
      <Problems />
    </MemoryRouter>
  );

  // Wait for loading to finish
  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  // Today section should be present
  const todayHeader = screen.getByRole('heading', { name: /Today's Assigned Problems/i });
  expect(todayHeader).toBeInTheDocument();

  // Find the today section by header
  const todaySection = todayHeader.closest('section');

  // Only one card for problem id 1 inside today section
  const todayCards = within(todaySection).getAllByText('Problem A');
  expect(todayCards).toHaveLength(1);

  // Global problem should not appear in today list
  expect(within(todaySection).queryByText('Problem B')).not.toBeInTheDocument();
});

test('main table deduplicates problems by ID', async () => {
  render(
    <MemoryRouter>
      <Problems />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  // Table rows count should equal unique problems (3)
  const rows = screen.getAllByRole('row'); // includes header row
  // header + 3 data rows = 4
  expect(rows).toHaveLength(4);
});

test('renders not enrolled hero for unenrolled student', async () => {
  const unenrolledData = {
    ...mockData,
    meta: { enrolled: false, today: [], upcoming: [], global: [] },
  };
  getStudentProblems.mockResolvedValueOnce({ data: unenrolledData });

  render(
    <MemoryRouter>
      <Problems />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  expect(screen.getByText(/You are not enrolled in a batch/i)).toBeInTheDocument();
  expect(screen.queryByText(/Today&apos;s Assigned Problems/i)).not.toBeInTheDocument();
});

test('progress badges render correct labels', async () => {
  render(
    <MemoryRouter>
      <Problems />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  // Solved badge
  const solvedBadges = screen.getAllByText(/Solved/i, { selector: '.status-badge' });
  expect(solvedBadges.length).toBeGreaterThan(0);

  // Attempted badge
  const attemptedBadges = screen.getAllByText(/Attempted/i, { selector: '.status-badge' });
  expect(attemptedBadges.length).toBeGreaterThan(0);

  // Not Started badge
  const notStartedBadges = screen.getAllByText(/Not Started/i, { selector: '.status-badge' });
  expect(notStartedBadges.length).toBeGreaterThan(0);
});

test('status filter works without duplicating entries', async () => {
  render(
    <MemoryRouter>
      <Problems />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  const solvedFilterBtn = screen.getByRole('button', { name: /^Solved Problems$/i });
  fireEvent.click(solvedFilterBtn);

  // Only solved problem (id 1) should be visible in table
  const rows = screen.getAllByRole('row');
  // header + 1 data row = 2
  expect(rows).toHaveLength(2);
});

test('clicking start button navigates with correct problem ID', async () => {
  render(
    <MemoryRouter>
      <Problems />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  const startBtn = screen.getByRole('button', { name: /Start →/i });
  fireEvent.click(startBtn);
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/1');
});
