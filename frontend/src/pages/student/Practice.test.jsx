// Tests for student/Practice.jsx — the hierarchical global practice library.
//
// These mock at the `api/student` boundary (rather than the axios instance used
// by Practice.dataFlow.test.jsx) so they additionally pin the request contract of
// `getStudentPracticeLibrary`, and they stub `useNavigate`, which lets them
// assert that a problem action does NOT collapse its parent topic — something
// that cannot be observed once the route has changed.

import React, { StrictMode } from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../api/student', () => ({
  getStudentPracticeLibrary: vi.fn(),
}));

import Practice from './Practice';
import { getStudentPracticeLibrary } from '../../api/student';

const problem = (overrides = {}) => ({
  id: 'p1',
  title: 'Two Sum',
  description: 'Find the pair that sums to the target.',
  difficulty: 'EASY',
  progress: 'NOT_STARTED',
  ...overrides,
});

const respond = (data, metaOverrides = {}) => ({
  data: {
    success: true,
    data,
    meta: {
      scope: 'GLOBAL',
      filtering: false,
      counts: { collections: 1, topics: 1, problems: 1, solved: 0, attempted: 0, notStarted: 1 },
      completionPercentage: 0,
      difficulties: ['EASY'],
      topics: ['Arrays'],
      ...metaOverrides,
    },
  },
});

const renderPage = () =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/student/practice']}>
        <Practice />
      </MemoryRouter>
    </StrictMode>,
  );

const tree = () => screen.getByRole('region', { name: /^collections$/i });
// Scoped by level class: a collection is called "Arrays Bootcamp", so a name
// match alone would also hit its topic row.
const collectionRow = (name) =>
  within(tree()).getAllByRole('button')
    .find((b) => b.classList.contains('pr-collection__toggle') && b.textContent.includes(name));
const topicRow = (name) =>
  within(tree()).getAllByRole('button')
    .find((b) => b.classList.contains('pr-topic__toggle') && b.textContent.includes(name));

beforeEach(() => {
  vi.clearAllMocks();
  getStudentPracticeLibrary.mockResolvedValue(
    respond([
      {
        id: 'c1',
        name: 'Arrays Bootcamp',
        description: 'Fundamentals',
        topicCount: 2,
        problemCount: 3,
        topics: [
          { id: 't1', name: 'Arrays', problemCount: 1, problems: [problem()] },
          {
            id: 't2',
            name: 'Graphs',
            problemCount: 2,
            problems: [problem({ id: 'p2', title: 'Graph Walk' }), problem({ id: 'p3', title: 'Bridges' })],
          },
        ],
      },
    ]),
  );
});

test('requests the hierarchical practice library with no filters', async () => {
  renderPage();
  await waitFor(() => expect(getStudentPracticeLibrary).toHaveBeenCalled());
  expect(getStudentPracticeLibrary).toHaveBeenCalledWith({
    search: undefined, difficulty: undefined, status: undefined, topic: undefined,
  });
});

test('renders the collection and its topics collapsed by default', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Arrays Bootcamp')).toBeInTheDocument());

  const collection = collectionRow('Arrays Bootcamp');
  expect(collection).toHaveTextContent('2 topics');
  expect(collection).toHaveTextContent('3 problems');
  expect(collection).toHaveAttribute('aria-expanded', 'false');
  // Nothing from inside the collection is on screen yet.
  expect(within(tree()).queryByText('Two Sum')).not.toBeInTheDocument();
});

test('expanding a collection reveals its topics with their counts', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Arrays Bootcamp')).toBeInTheDocument());

await userEvent.click(collectionRow('Arrays Bootcamp'));

  await waitFor(() => expect(topicRow('Arrays')).toBeInTheDocument());
  expect(topicRow('Arrays')).toHaveTextContent('1 problem');
  expect(topicRow('Graphs')).toHaveTextContent('2 problems');
  // Problems are still hidden until their topic is opened.
  expect(within(tree()).queryByText('Two Sum')).not.toBeInTheDocument();
});

test('expanding a topic reveals only that topic’s problems', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Arrays Bootcamp')).toBeInTheDocument());

  await userEvent.click(collectionRow('Arrays Bootcamp'));
  await userEvent.click(topicRow('Graphs'));

  expect(within(tree()).getByText('Graph Walk')).toBeInTheDocument();
  expect(within(tree()).getByText('Bridges')).toBeInTheDocument();
  expect(within(tree()).queryByText('Two Sum')).not.toBeInTheDocument();
});

test('a problem action navigates without collapsing its topic', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Arrays Bootcamp')).toBeInTheDocument());

  await userEvent.click(collectionRow('Arrays Bootcamp'));
  const topic = topicRow('Arrays');
  await userEvent.click(topic);
  expect(topic).toHaveAttribute('aria-expanded', 'true');

  await userEvent.click(within(tree()).getByRole('button', { name: /^Solve Two Sum$/ }));

  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/p1');
  // stopPropagation kept the click off the topic and collection disclosures.
  expect(topic).toHaveAttribute('aria-expanded', 'true');
  expect(collectionRow('Arrays Bootcamp')).toHaveAttribute('aria-expanded', 'true');
});

test('a solved problem offers Review against the same registered route', async () => {
  getStudentPracticeLibrary.mockResolvedValue(respond([
    {
      id: 'c1', name: 'Arrays Bootcamp', description: null, topicCount: 1, problemCount: 1,
      topics: [{ id: 't1', name: 'Arrays', problemCount: 1, problems: [problem({ progress: 'SOLVED' })] }],
    },
  ], { counts: { collections: 1, topics: 1, problems: 1, solved: 1, attempted: 0, notStarted: 0 } }));

  renderPage();
  await waitFor(() => expect(screen.getByText('Arrays Bootcamp')).toBeInTheDocument());

await userEvent.click(collectionRow('Arrays Bootcamp'));
  await waitFor(() => expect(topicRow('Arrays')).toBeInTheDocument());
  await userEvent.click(topicRow('Arrays'));

  await userEvent.click(within(tree()).getByRole('button', { name: /^Review Two Sum$/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/p1');
});

test('the breadcrumb links back to the student dashboard', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());

  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(crumbs).getByText('Student')).toHaveAttribute('href', '/student');
  expect(within(crumbs).getByText('Practice')).toHaveAttribute('aria-current', 'page');
});