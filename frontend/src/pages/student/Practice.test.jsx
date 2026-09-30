import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Practice from './Practice';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock API
vi.mock('../../api/student', () => ({
  getStudentProblems: vi.fn(),
}));

const mockData = {
  success: true,
  data: [
    { id: '1', title: 'Problem A', description: 'Desc A', progress: 'SOLVED', difficulty: 'EASY' },
    { id: '2', title: 'Problem B', description: 'Desc B', progress: 'ATTEMPTED', difficulty: 'MEDIUM' },
    { id: '3', title: 'Problem C', description: 'Desc C', progress: 'NOT_STARTED', difficulty: 'HARD' },
    // duplicate ID – should be deduped
    { id: '1', title: 'Problem A Duplicate', description: 'Desc dup', progress: 'SOLVED', difficulty: 'EASY' },
  ],
  meta: {},
};

import * as studentApi from '../../api/student';

beforeEach(() => {
  vi.clearAllMocks();
  studentApi.getStudentProblems.mockResolvedValue({ data: mockData });
});

test('renders problem counts correctly and dedupes duplicates', async () => {
  render(
    <MemoryRouter>
      <Practice />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  // Total count should be 3 (unique)
  const totalBox = screen.getByText('Total Problems').closest('.metric-box');
  expect(within(totalBox).getByText('3')).toBeInTheDocument();
});

test('navigation to problem detail uses correct ID', async () => {
  render(
    <MemoryRouter>
      <Practice />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  const practiceButtons = screen.getAllByRole('button', { name: /Practice →/i });
  fireEvent.click(practiceButtons[0]);
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/1');
});
