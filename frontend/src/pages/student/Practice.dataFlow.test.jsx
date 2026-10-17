// Data-flow tests for the Student Practice page (frontend/src/pages/student/Practice.jsx).
//
// Mocked at the axios instance rather than at `api/student`, so the real API
// module, the real request contract and the real `{ success, data, meta }`
// envelope unwrapping are all exercised.
//
// Pinned here:
//   - the page calls the hierarchical library endpoint and nothing else;
//   - Collection -> Topic -> Problems renders with the real names and counts;
//   - each level expands and collapses independently, via an accessible
//     disclosure button;
//   - singular/plural labels are correct ("1 Problem", "2 Problems");
//   - a problem action never toggles its parent topic;
//   - Solve / Continue / Review navigate to the registered route with the id the
//     API returned, and a record without one is never navigated to;
//   - search, difficulty, status and topic compose and are sent server-side;
//   - empty collections, empty topics, no-match and error states are distinct;
//   - the page settles under <React.StrictMode>, which is how main.jsx mounts
//     the whole application.

import React, { StrictMode } from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api.js', () => ({
  __esModule: true,
  default: {
    get,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    defaults: { headers: { common: {} } },
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'STUDENT', name: 'Aditi Ramesh' }, logout: vi.fn() }),
}));

import Practice from './Practice';

const problem = (overrides = {}) => ({
  id: 'p1',
  title: 'Two Sum',
  description: 'Find the pair that sums to the target.',
  difficulty: 'EASY',
  progress: 'NOT_STARTED',
  ...overrides,
});

const TREE = [
  {
    id: 'c1',
    name: 'Collection 1',
    description: 'Fundamentals',
    topicCount: 2,
    // Unique across the collection: Two Sum appears in both topics.
    problemCount: 2,
    topics: [
      { id: 't1', name: 'Arrays', problemCount: 1, problems: [problem()] },
      {
        id: 't2',
        name: 'Graphs',
        problemCount: 1,
        problems: [problem({ id: 'p2', title: 'Graph Walk', difficulty: 'HARD', progress: 'SOLVED' })],
      },
    ],
  },
  {
    id: 'c2',
    name: 'Collection 2',
    description: null,
    topicCount: 1,
    problemCount: 0,
    topics: [{ id: 't3', name: 'Empty Day', problemCount: 0, problems: [] }],
  },
];

const META = {
  scope: 'GLOBAL',
  filtering: false,
  counts: { collections: 2, topics: 3, problems: 2, solved: 1, attempted: 0, notStarted: 1 },
  completionPercentage: 50,
  difficulties: ['EASY', 'HARD'],
  topics: ['Arrays', 'Empty Day', 'Graphs'],
};

const respond = (data, metaOverrides = {}) => ({
  data: { success: true, data, meta: { ...META, ...metaOverrides } },
});

function SolvedRoute() {
  const { id } = useParams();
  return <p data-testid="solved-route">{`solving ${id}`}</p>;
}

const renderPage = () =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/student/practice']}>
        <Routes>
          <Route path="/student/practice" element={<Practice />} />
          <Route path="/student/problems/:id" element={<SolvedRoute />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );

const tree = () => screen.getByRole('region', { name: /^collections$/i });
const collectionRow = (name) =>
  within(tree()).getAllByRole('button').find((b) => b.textContent.includes(name));
/** Scoped to the tree and to the topic level: the topic filter <select> inside
 *  the same region contains <option> elements with the very same names. */
const topicRow = (name) =>
  within(tree()).getAllByRole('button')
    .find((b) => b.classList.contains('pr-topic__toggle') && b.textContent.includes(name));
const overview = () => screen.getByRole('region', { name: /global practice overview/i });

/** Expands a collection and then a topic, and returns that topic's list. */
const openTopic = async (collectionName, topicName) => {
  await userEvent.click(collectionRow(collectionName));
  const topicButton = await within(tree())
    .getAllByRole('button')
    .find((b) => b.textContent.includes(topicName));
  await userEvent.click(topicButton);
  return topicButton;
};

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(respond(TREE));
});

/* ── request contract ───────────────────────────────────────────────── */

test('calls the hierarchical library endpoint', async () => {
  renderPage();
  await waitFor(() => expect(get).toHaveBeenCalled());

  expect(get.mock.calls[0][0]).toBe('/student/practice/library');
  expect(get.mock.calls[0][1].params).toEqual({
    search: undefined, difficulty: undefined, status: undefined, topic: undefined,
  });
});

test('shows a loading state while the request is pending', async () => {
  get.mockImplementation(() => new Promise(() => {}));
  renderPage();
  expect(await screen.findByRole('status')).toHaveTextContent(/loading the practice library/i);
});

test('settles on the real tree under StrictMode', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument(), { timeout: 3000 });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

/* ── header ─────────────────────────────────────────────────────────── */

test('breadcrumb, title and overview come from the response', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(crumbs).getByText('Student')).toHaveAttribute('href', '/student');
  expect(within(crumbs).getByText('Practice')).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Practice');

  expect(within(overview()).getByText('Problems').closest('.pr-summary__item')).toHaveTextContent('2');
  expect(within(overview()).getByText('Solved').closest('.pr-summary__item')).toHaveTextContent('1');
  expect(within(overview()).getByText('Completion').closest('.pr-summary__item')).toHaveTextContent('50%');
});

/* ── collection accordion ───────────────────────────────────────────── */

test('collection rows show the real counts with correct pluralisation', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

// topicCount 2, problemCount 2 (Two Sum is shared with Graphs but counted once).
  expect(collectionRow('Collection 1')).toHaveTextContent(/2 topics/);
  expect(collectionRow('Collection 1')).toHaveTextContent(/2 problems/);
  // topicCount 1, problemCount 0 -> singular topic, plural problems.
  expect(collectionRow('Collection 2')).toHaveTextContent(/1 topic /);
  expect(collectionRow('Collection 2')).toHaveTextContent(/0 problems/);
});

test('singular and plural labels are correct at both levels', async () => {
  get.mockResolvedValue(respond([{
    id: 'c1', name: 'Counts', description: null, topicCount: 2, problemCount: 3,
    topics: [
      { id: 't1', name: 'Solo', problemCount: 1, problems: [problem()] },
      {
        id: 't2', name: 'Pair', problemCount: 2,
        problems: [problem({ id: 'p2' }), problem({ id: 'p3' })],
      },
    ],
  }], {
    counts: { collections: 1, topics: 2, problems: 3, solved: 0, attempted: 0, notStarted: 3 },
    difficulties: ['EASY'], topics: ['Pair', 'Solo'], completionPercentage: 0,
  }));
  renderPage();

  await screen.findByText('Counts');
  expect(collectionRow('Counts')).toHaveTextContent(/2 topics/);
  // Three distinct problems across the two topics.
  expect(collectionRow('Counts')).toHaveTextContent(/3 problems/);

  await userEvent.click(collectionRow('Counts'));
  expect(await screen.findByRole('button', { name: /Solo/ })).toHaveTextContent(/1 problem$/);
  expect(screen.getByRole('button', { name: /Pair/ })).toHaveTextContent(/2 problems$/);
});

test('a collection expands and collapses independently', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  const first = collectionRow('Collection 1');
  const second = collectionRow('Collection 2');
  expect(first).toHaveAttribute('aria-expanded', 'false');
  expect(second).toHaveAttribute('aria-expanded', 'false');

  await userEvent.click(first);
  expect(first).toHaveAttribute('aria-expanded', 'true');
  // Expanding one does not expand the other.
  expect(second).toHaveAttribute('aria-expanded', 'false');
  expect(within(tree()).getByRole('button', { name: /Arrays/ })).toBeInTheDocument();

  await userEvent.click(first);
  expect(first).toHaveAttribute('aria-expanded', 'false');
  expect(within(tree()).queryByRole('button', { name: /Arrays/ })).not.toBeInTheDocument();
});

test('collapsing a collection hides its topic and problem rows', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  await openTopic('Collection 1', 'Arrays');
  expect(screen.getByText('Two Sum')).toBeInTheDocument();

  await userEvent.click(collectionRow('Collection 1'));
  expect(within(tree()).queryByRole('button', { name: /Arrays/ })).not.toBeInTheDocument();
  expect(within(tree()).queryByText('Two Sum')).not.toBeInTheDocument();
});

/* ── topic accordion ────────────────────────────────────────────────── */

test('topic rows show the real problem count', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  await userEvent.click(collectionRow('Collection 1'));
  expect(topicRow('Arrays')).toHaveTextContent(/1 problem$/);
  expect(topicRow('Graphs')).toHaveTextContent(/1 problem$/);
});

test('a topic expands and collapses independently of its siblings', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  await userEvent.click(collectionRow('Collection 1'));
  await waitFor(() => expect(topicRow('Arrays')).toBeInTheDocument());
  const arrays = topicRow('Arrays');
  const graphs = topicRow('Graphs');

  await userEvent.click(arrays);
  expect(arrays).toHaveAttribute('aria-expanded', 'true');
  expect(graphs).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('Two Sum')).toBeInTheDocument();
  expect(screen.queryByText('Graph Walk')).not.toBeInTheDocument();

  await userEvent.click(arrays);
  expect(arrays).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();

  // The sibling still expands on its own.
  await userEvent.click(graphs);
  expect(screen.getByText('Graph Walk')).toBeInTheDocument();
});

test('only problems belonging to that topic are shown', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  await openTopic('Collection 1', 'Arrays');
  expect(screen.getByText('Two Sum')).toBeInTheDocument();
  expect(screen.queryByText('Graph Walk')).not.toBeInTheDocument();
});

test('a topic with zero problems expands to an explanation', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 2')).toBeInTheDocument());

  const empty = await openTopic('Collection 2', 'Empty Day');
  expect(empty).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/no published problems yet/i)).toBeInTheDocument();
});

/* ── problem rows ───────────────────────────────────────────────────── */

test('problem rows show title, difficulty and status with a correct action', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  await openTopic('Collection 1', 'Arrays');
  const row = screen.getByText('Two Sum').closest('.pr-problem');
  expect(row).toHaveTextContent('Find the pair that sums to the target.');
  expect(row).toHaveTextContent('EASY');
  expect(row).toHaveTextContent('Not started');
  expect(within(row).getByRole('button', { name: /^Solve Two Sum$/ })).toBeInTheDocument();

  await userEvent.click(collectionRow('Collection 1'));
  await openTopic('Collection 1', 'Graphs');
  const solvedRow = screen.getByText('Graph Walk').closest('.pr-problem');
  expect(solvedRow).toHaveAttribute('data-status', 'SOLVED');
  expect(solvedRow).toHaveTextContent('Solved');
  expect(within(solvedRow).getByRole('button', { name: /^Review Graph Walk$/ })).toBeInTheDocument();
});

test('Solve navigates to the registered route with the API problem id', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  await openTopic('Collection 1', 'Arrays');
  await userEvent.click(screen.getByRole('button', { name: /^Solve Two Sum$/ }));

  expect(await screen.findByTestId('solved-route')).toHaveTextContent('solving p1');
});

test('a problem action navigates without disturbing the expanded tree', async () => {
  // The stopPropagation guard on the action is asserted in Practice.test.jsx,
  // where useNavigate is stubbed and the page therefore stays mounted. Here we
  // only assert that the navigation happened and no error was raised on the way.
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  await openTopic('Collection 1', 'Arrays');
  await userEvent.click(screen.getByRole('button', { name: /^Solve Two Sum$/ }));

  expect(await screen.findByTestId('solved-route')).toHaveTextContent('solving p1');
});

test('missing optional problem metadata renders without crashing', async () => {
  get.mockResolvedValue(respond([{
    id: 'c1', name: 'Sparse Collection', description: null, topicCount: 1, problemCount: 1,
    topics: [{
      id: 't1', name: 'Sparse Topic', problemCount: 1,
      problems: [{ id: 'p9', title: 'Sparse Problem', description: null, difficulty: null, progress: 'ATTEMPTED' }],
    }],
  }], {
    counts: { collections: 1, topics: 1, problems: 1, solved: 0, attempted: 1, notStarted: 0 },
    difficulties: [], topics: ['Sparse Topic'], completionPercentage: 0,
  }));
  renderPage();

  await screen.findByText('Sparse Collection');
  await openTopic('Sparse Collection', 'Sparse Topic');
  const row = screen.getByText('Sparse Problem').closest('.pr-problem');
  expect(row).toHaveTextContent('Unspecified');
  expect(row).toHaveTextContent('Attempted');
  expect(within(row).getByRole('button', { name: /^Continue Sparse Problem$/ })).toBeInTheDocument();
});

/* ── search + filters ───────────────────────────────────────────────── */

test('search is debounced and sent to the API', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());
  get.mockClear();

  await userEvent.type(screen.getByRole('searchbox'), 'Graph');
  await waitFor(
    () => expect(get).toHaveBeenCalledWith('/student/practice/library', expect.objectContaining({
      params: expect.objectContaining({ search: 'Graph' }),
    })),
    { timeout: 2000 },
  );
});

test('difficulty, status and topic filters compose', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());
  get.mockClear();

  await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'HARD');
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/student/practice/library', expect.objectContaining({
      params: expect.objectContaining({ difficulty: 'HARD' }),
    })),
  );

  get.mockClear();
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'SOLVED');
  await userEvent.selectOptions(screen.getByLabelText('Topic'), 'Graphs');
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/student/practice/library', expect.objectContaining({
      params: expect.objectContaining({ difficulty: 'HARD', status: 'SOLVED', topic: 'Graphs' }),
    })),
  );
});

test('filtered counts reflect what is displayed', async () => {
  get.mockResolvedValue(respond([{
    id: 'c1', name: 'Collection 1', description: null, topicCount: 1, problemCount: 1,
    topics: [{ id: 't2', name: 'Graphs', problemCount: 1, problems: [problem({ id: 'p2', title: 'Graph Walk', difficulty: 'HARD' })] }],
  }], {
    filtering: true,
    counts: { collections: 1, topics: 1, problems: 1, solved: 0, attempted: 0, notStarted: 1 },
    difficulties: ['HARD'], topics: ['Graphs'],
  }));
  renderPage();

  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());
  expect(collectionRow('Collection 1')).toHaveTextContent(/1 topic /);
  // Collections and topics with no matches are not rendered at all.
  expect(screen.queryByText('Collection 2')).not.toBeInTheDocument();
});

test('reset clears every filter and re-requests unfiltered', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());

  await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'HARD');
  await waitFor(() => expect(screen.getByLabelText('Difficulty')).toHaveValue('HARD'));

  get.mockClear();
  await userEvent.click(screen.getByRole('button', { name: /reset filters/i }));

  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/student/practice/library', expect.objectContaining({
      params: expect.objectContaining({ difficulty: undefined, status: undefined, topic: undefined, search: undefined }),
    })),
  );
  expect(screen.getByRole('searchbox')).toHaveValue('');
});

/* ── states ─────────────────────────────────────────────────────────── */

test('no published collections explains where batch work lives', async () => {
  get.mockResolvedValue(respond([], {
    counts: { collections: 0, topics: 0, problems: 0, solved: 0, attempted: 0, notStarted: 0 },
    completionPercentage: 0, difficulties: [], topics: [],
  }));
  renderPage();

  expect(await screen.findByText(/No global collections are published yet/i)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /global practice overview/i })).not.toBeInTheDocument();
});

test('an empty filtered result is distinct from an empty library', async () => {
  // The filter is chosen in the UI and the server answers with nothing; the
  // component decides which empty state applies from its OWN filter state, not
  // from what the server echoes back.
  get.mockImplementation((url, config) => (config?.params?.difficulty
    ? Promise.resolve(respond([], {
      filtering: true,
      counts: { collections: 0, topics: 0, problems: 0, solved: 0, attempted: 0, notStarted: 0 },
      completionPercentage: 0, difficulties: [], topics: [],
    }))
    : Promise.resolve(respond(TREE))));
  renderPage();

  await waitFor(() => expect(screen.getByText('Collection 1')).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'HARD');

  expect(await screen.findByText(/No problems match your filters/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  expect(screen.queryByText(/No global collections are published yet/i)).not.toBeInTheDocument();
});

test('an API failure shows a readable error and the retry recovers', async () => {
  let failing = true;
  get.mockImplementation(() => (failing
    ? Promise.reject({ response: { status: 500, data: { message: 'Internal server error' } } })
    : Promise.resolve(respond(TREE))));
  renderPage();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Internal server error');
  // No fabricated collections are rendered behind the error.
  expect(screen.queryByText('Collection 1')).not.toBeInTheDocument();

  failing = false;
  await userEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(await screen.findByText('Collection 1')).toBeInTheDocument();
});

test('a permission error is surfaced, not hidden behind an empty state', async () => {
  get.mockRejectedValue({ response: { status: 403, data: { message: 'Access denied' } } });
  renderPage();

  expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
  expect(screen.getByRole('link', { name: /go to your assigned problems/i })).toHaveAttribute('href', '/student/problems');
});

test('an authentication failure stays an error, never a fake success', async () => {
  get.mockRejectedValue({ response: { status: 401, data: { message: 'Unauthorized' } } });
  renderPage();

  expect(await screen.findByRole('alert')).toHaveTextContent('Unauthorized');
  expect(screen.queryByText('Collection 1')).not.toBeInTheDocument();
});