import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
  getStudentCollections: vi.fn(),
  getStudentCollectionTopics: vi.fn(),
  getStudentTopicProblems: vi.fn(),
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
  studentApi.getStudentCollections.mockResolvedValue({ data: { data: [{ id: 'collection-1', name: 'Basics', topicCount: 1, problemCount: 3, completedProblemCount: 1 }] } });
  studentApi.getStudentCollectionTopics.mockResolvedValue({ data: { data: [{ id: 'topic-1', name: 'Topic', problemCount: 3, completedProblemCount: 1 }] } });
  studentApi.getStudentTopicProblems.mockResolvedValue({ data: { data: mockData.data.slice(0, 3) } });
});

test('renders collection progress from authoritative counts', async () => {
  render(
    <MemoryRouter>
      <Practice />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  expect(screen.getByText('1 / 3 completed')).toBeInTheDocument();
});

test('navigation to problem detail uses correct ID', async () => {
  render(
    <MemoryRouter>
      <Practice />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /Basics/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Topic/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Topic/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Problem A/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Problem A/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/1');
});
