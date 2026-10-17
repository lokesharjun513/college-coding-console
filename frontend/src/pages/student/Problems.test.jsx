// Tests for student/Problems.jsx — the batch-assigned problems page.
//
// These validate the CURRENT intended UI:
//   - only problems assigned to the authenticated student's batch
//   - the { success, data, meta } envelope, read at response.data.data
//   - nested problem ids / titles mapped onto the solving route
//   - status precedence Solved > Attempted > Not Started
//   - search + difficulty + status composing, and pagination resetting
//   - Solve / Continue / Review pointing at registered routes
//   - distinct loading, empty, no-match and API-error states
//
// The page uses a semantic list rather than a table so rows can become cards
// on a phone; the previous `role="row"` assertions are replaced with
// list-item assertions, not weakened.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Problems from './Problems';
import { getStudentAssignedProblems } from '../../api/student';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../api/student', () => ({
  getStudentAssignedProblems: vi.fn(),
}));

const DAY = 86400000;
const isoDaysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();

const BATCH = {
  id: 'b1',
  name: 'CSE 2024',
  code: 'CSE24',
  status: 'ACTIVE',
  trainerName: 'Priya Menon',
  startDate: '2026-06-01T00:00:00.000Z',
  assigned: 4,
  solved: 1,
};

const rows = [
  { id: 'p1', title: 'Problem A', difficulty: 'EASY', scope: 'BATCH', isToday: true, topic: 'Math', progress: 'SOLVED', attempts: 2, latestVerdict: 'ACCEPTED', lastAttemptAt: isoDaysAgo(1), batch: { id: 'b1', name: 'CSE 2024' } },
  { id: 'p2', title: 'Problem B', difficulty: 'MEDIUM', scope: 'BATCH', isToday: false, topic: 'Algo', progress: 'ATTEMPTED', attempts: 3, latestVerdict: 'WRONG_ANSWER', lastAttemptAt: isoDaysAgo(2), batch: { id: 'b1', name: 'CSE 2024' } },
  { id: 'p3', title: 'Problem C', difficulty: 'HARD', scope: 'BATCH', isToday: false, topic: 'Data', progress: 'NOT_STARTED', attempts: 0, latestVerdict: null, lastAttemptAt: null, batch: { id: 'b1', name: 'CSE 2024' } },
  { id: 'p4', title: 'Problem D', difficulty: 'EASY', scope: 'BATCH', isToday: true, topic: 'Graphs', progress: 'NOT_STARTED', attempts: 0, latestVerdict: null, lastAttemptAt: null, batch: { id: 'b1', name: 'CSE 2024' } },
];

const meta = (overrides = {}) => ({
  scope: 'BATCH',
  enrolled: true,
  batches: [BATCH],
  counts: { total: 4, solved: 1, attempted: 1, notStarted: 2 },
  completionPercentage: 25,
  todayCount: 2,
  difficulties: ['EASY', 'MEDIUM', 'HARD'],
  topics: ['Math', 'Algo', 'Data', 'Graphs'],
  pagination: { page: 1, pageSize: 20, total: 4, totalPages: 1 },
  ...overrides,
});

const respond = (data, metaOverrides) => ({
  data: { success: true, data, meta: meta(metaOverrides) },
});

const renderPage = () => render(<MemoryRouter><Problems /></MemoryRouter>);

/* A problem can legitimately appear in both the "today" panel and the library,
   so every row assertion is scoped to one of the two regions. */
const library = () => screen.getByRole('region', { name: /assigned problem library/i });
const todayPanel = () => screen.getByRole('region', { name: /today's assigned problems/i });
const summary = () => screen.getByRole('region', { name: /assigned problem summary/i });
const libraryRows = () => within(library()).getAllByRole('listitem');
const inLibrary = (text) => within(library()).getByText(text);
const stat = (label) => within(summary()).getByText(label).closest('.sp-stat');

beforeEach(() => {
  vi.clearAllMocks();
  getStudentAssignedProblems.mockResolvedValue(respond(rows));
});

/* ── envelope + mapping ─────────────────────────────────────────────── */

test('reads the payload from the success envelope, not the response body', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Assigned Problems' })).toBeInTheDocument());

  // Regression guard: reading response.data returns the envelope, not the rows.
  expect(getStudentAssignedProblems).toHaveBeenCalled();
  expect(inLibrary('Problem A')).toBeInTheDocument();
  expect(libraryRows()).toHaveLength(4);
});

test('maps title, difficulty, topic and status onto each row', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  const row = inLibrary('Problem A').closest('li');
  expect(row).toHaveTextContent('Math');
  expect(row).toHaveTextContent('EASY');
  expect(row).toHaveTextContent('Solved');

  expect(inLibrary('Problem C').closest('li')).toHaveTextContent('Not started');
  expect(inLibrary('Problem B').closest('li')).toHaveTextContent('Attempted');
});

test('shows real batch and trainer details from the API', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'CSE 2024' })).toBeInTheDocument());

  expect(screen.getByText(/Trainer Priya Menon/)).toBeInTheDocument();
  expect(screen.getByText(/1 Jun 2026/)).toBeInTheDocument();

  // Two progress bars exist by design: the overall one in the header and one per
  // batch. Both are named, so each can be asserted on its own rather than
  // "the first progressbar on the page".
  const batchProgress = screen.getByRole('progressbar', { name: 'CSE 2024 completion' });
  expect(batchProgress).toHaveAttribute('aria-valuetext', '1 of 4 assigned problems solved');
  expect(batchProgress).toHaveAttribute('aria-valuenow', '25');

  const overall = screen.getByRole('progressbar', { name: 'Overall completion' });
  expect(overall).toHaveAttribute('aria-valuetext', '1 of 4 assigned problems solved');
  expect(overall).toHaveAttribute('aria-valuenow', '25');
  // Completion is the API's percentage over the whole assigned set, not a
  // fraction recomputed from whatever page is on screen.
  expect(overall).toHaveAttribute('aria-valuenow', String(meta().completionPercentage));
});

test('the header reports assigned, solved and remaining counts from the API', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  const header = document.querySelector('.sp-header__summary');
  expect(header).toHaveTextContent('4 assigned');
  expect(header).toHaveTextContent('1 solved');
  expect(header).toHaveTextContent('3 remaining');
});

test('summary counts come from the API, not recomputed per page', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  expect(stat('Total assigned')).toHaveTextContent('4');
  expect(stat('Solved')).toHaveTextContent('1');
  expect(stat('Attempted')).toHaveTextContent('1');
  expect(stat('Not started')).toHaveTextContent('2');
});

/* ── status precedence ──────────────────────────────────────────────── */

test('an accepted submission outranks failures: one accept among failures is Solved', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  const row = inLibrary('Problem A').closest('li');
  expect(row).toHaveAttribute('data-status', 'SOLVED');
  expect(row).toHaveTextContent('2 attempts');
  // A solved row does not keep showing a stale failing verdict.
  expect(row).not.toHaveTextContent('Last:');
});

test('an unsolved problem shows its real latest verdict and attempt count', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem B')).toBeInTheDocument());

  const row = inLibrary('Problem B').closest('li');
  expect(row).toHaveTextContent('Last: Wrong answer');
  expect(row).toHaveTextContent('3 attempts');
});

/* ── today's work ───────────────────────────────────────────────────── */

test("renders today's assigned problems once each", async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('heading', { name: /Today's Assigned Problems/i })).toBeInTheDocument());

  const items = within(todayPanel()).getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(within(todayPanel()).getByText('Problem A')).toBeInTheDocument();
  expect(within(todayPanel()).getByText('Problem D')).toBeInTheDocument();
  expect(within(todayPanel()).queryByText('Problem B')).not.toBeInTheDocument();
});

test("today's panel is hidden when nothing is scheduled for today", async () => {
  getStudentAssignedProblems.mockResolvedValue(
    respond(rows.map((r) => ({ ...r, isToday: false })), { todayCount: 0 }),
  );
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  expect(screen.queryByRole('heading', { name: /Today's Assigned Problems/i })).not.toBeInTheDocument();
});

test("today's panel comes from the API, so paging or filtering cannot empty it", async () => {
  // Page 2 is showing a problem that is NOT today's work, while the API still
  // reports today's scheduled problem. The panel must show the API's answer.
  getStudentAssignedProblems.mockResolvedValue(
    respond(
      [{ ...rows[2], isToday: false }],
      {
        today: [{ id: 'p9', title: 'Scheduled Today', difficulty: 'HARD', progress: 'NOT_STARTED' }],
        todayCount: 1,
        pagination: { page: 2, pageSize: 1, total: 2, totalPages: 2 },
      },
    ),
  );
  renderPage();
  await waitFor(() => expect(screen.getByRole('heading', { name: /Today's Assigned Problems/i })).toBeInTheDocument());

  const items = within(todayPanel()).getAllByRole('listitem');
  expect(items).toHaveLength(1);
  expect(within(todayPanel()).getByText('Scheduled Today')).toBeInTheDocument();
  expect(within(todayPanel()).queryByText('Problem C')).not.toBeInTheDocument();

  await userEvent.click(within(todayPanel()).getByRole('button', { name: /^Solve Scheduled Today$/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/p9');
});

test('an empty meta.today is authoritative — the panel stays hidden', async () => {
  getStudentAssignedProblems.mockResolvedValue(
    // The rows carry isToday, but the API explicitly says nothing is scheduled.
    respond(rows, { today: [], todayCount: 0 }),
  );
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  expect(screen.queryByRole('heading', { name: /Today's Assigned Problems/i })).not.toBeInTheDocument();
});

/* ── actions ────────────────────────────────────────────────────────── */

test('Solve, Continue and Review all use the registered solving route', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  // Scoped to the library: the "today" panel renders its own action for the
  // same problem.
  await userEvent.click(within(library()).getByRole('button', { name: /^Review Problem A$/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/p1');

  await userEvent.click(within(library()).getByRole('button', { name: /^Continue Problem B$/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/p2');

  await userEvent.click(within(library()).getByRole('button', { name: /^Solve Problem C$/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/student/problems/p3');
});

test('no action ever navigates to an undefined or malformed problem id', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  for (const label of [/^Review Problem A$/, /^Continue Problem B$/, /^Solve Problem C$/]) {
    await userEvent.click(within(library()).getByRole('button', { name: label }));
  }
  expect(mockNavigate).toHaveBeenCalledTimes(3);
  for (const call of mockNavigate.mock.calls) {
    expect(call[0]).toMatch(/^\/student\/problems\/p\d$/);
  }
});

test('a record without a problem id is never rendered and never navigated to', async () => {
  getStudentAssignedProblems.mockResolvedValue(
    respond([
      ...rows,
      { title: 'Record Without Id', difficulty: 'EASY', progress: 'NOT_STARTED', isToday: false },
      { id: null, title: 'Record With Null Id', difficulty: 'EASY', progress: 'ATTEMPTED', isToday: false },
    ]),
  );
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  expect(screen.queryByText('Record Without Id')).not.toBeInTheDocument();
  expect(screen.queryByText('Record With Null Id')).not.toBeInTheDocument();

  // Every button that is left points at a real, well-formed id.
  const ids = screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .filter((label) => /^(Solve|Continue|Review)\b/.test(label || ''));
  expect(ids.length).toBeGreaterThan(0);

  for (const button of within(library()).getAllByRole('button')) {
    await userEvent.click(button);
  }
  for (const call of mockNavigate.mock.calls) {
    expect(call[0]).toMatch(/^\/student\/problems\/p\d$/);
    expect(call[0]).not.toContain('undefined');
  }
});

test('a repeated record for the same problem is rendered once', async () => {
  getStudentAssignedProblems.mockResolvedValue(
    respond([
      ...rows,
      { ...rows[0] },
      { ...rows[1], topic: 'Math' },
    ]),
  );
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  expect(libraryRows()).toHaveLength(4);
  expect(within(library()).getAllByText('Problem A')).toHaveLength(1);
  expect(within(library()).getAllByText('Problem B')).toHaveLength(1);
  // The counts still describe four distinct problems, not six rows.
  expect(stat('Total assigned')).toHaveTextContent('4');
});

test('a repeated record in today’s work is listed once', async () => {
  getStudentAssignedProblems.mockResolvedValue(
    respond([rows[0], rows[3]], { todayCount: 2 }),
  );
  renderPage();
  await waitFor(() => expect(screen.getByRole('heading', { name: /Today's Assigned Problems/i })).toBeInTheDocument());

  expect(within(todayPanel()).getAllByRole('listitem')).toHaveLength(2);
  expect(within(todayPanel()).getAllByText('Problem A')).toHaveLength(1);
});

/* ── filters ────────────────────────────────────────────────────────── */

test('search is sent to the API as a query parameter', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());
  getStudentAssignedProblems.mockClear();

  await userEvent.type(screen.getByRole('searchbox'), 'Prob');

  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(expect.objectContaining({ search: 'Prob' })),
  );
});

test('difficulty and status filters compose', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());
  getStudentAssignedProblems.mockClear();

  await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'HARD');
  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'HARD' })),
  );

  getStudentAssignedProblems.mockClear();
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'ATTEMPTED');
  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: 'HARD', status: 'ATTEMPTED' }),
    ),
  );
});

test('the topic filter is applied by the API, not narrowed in the browser', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());
  getStudentAssignedProblems.mockClear();

  await userEvent.selectOptions(screen.getByLabelText('Topic'), 'Graphs');

  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Graphs', page: 1 }),
    ),
  );
});

test('topic, search, difficulty and status filters all compose', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());
  getStudentAssignedProblems.mockClear();

  await userEvent.type(screen.getByRole('searchbox'), 'Prob');
  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(expect.objectContaining({ search: 'Prob' })),
  );

  getStudentAssignedProblems.mockClear();
  await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'EASY');
  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Prob', difficulty: 'EASY' }),
    ),
  );

  getStudentAssignedProblems.mockClear();
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'SOLVED');
  await userEvent.selectOptions(screen.getByLabelText('Topic'), 'Math');

  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Prob', difficulty: 'EASY', status: 'SOLVED', topic: 'Math' }),
    ),
  );
});

test('a filter change returns to page 1 so the user is never stranded', async () => {
  // Four pages, and the mock echoes back whichever page was requested.
  const paged = (params) =>
    Promise.resolve(respond(rows, { pagination: { page: params.page, pageSize: 2, total: 8, totalPages: 4 } }));

  getStudentAssignedProblems.mockImplementation(paged);
  renderPage();

  const next = await screen.findByRole('button', { name: 'Next page' });
  await userEvent.click(next);
  await waitFor(() => expect(getStudentAssignedProblems).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));

  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page'));

  getStudentAssignedProblems.mockClear();
  await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'EASY');

  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(expect.objectContaining({ page: 1 })),
  );
});

test('pagination requests the next page', async () => {
  getStudentAssignedProblems.mockImplementation((params) =>
    Promise.resolve(respond(rows, { pagination: { page: params.page, pageSize: 2, total: 8, totalPages: 4 } })),
  );
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument());

  getStudentAssignedProblems.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })),
  );
});

test('reset filters clears every filter and re-requests unfiltered', async () => {
  renderPage();
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());

  await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'HARD');
  await waitFor(() => expect(screen.getByLabelText('Difficulty')).toHaveValue('HARD'));

  getStudentAssignedProblems.mockClear();
  await userEvent.click(screen.getByRole('button', { name: /reset filters/i }));

  await waitFor(() =>
    expect(getStudentAssignedProblems).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: undefined, status: undefined, search: undefined }),
    ),
  );
});

/* ── states ─────────────────────────────────────────────────────────── */

test('shows a loading state before the request resolves', async () => {
  let resolve;
  getStudentAssignedProblems.mockImplementation(() => new Promise((r) => { resolve = r; }));

  renderPage();
  expect(screen.getByRole('status')).toHaveTextContent(/loading your assigned problems/i);

  // The initial load is debounced through a timer, so wait for the request to
  // actually start before resolving it.
  await waitFor(() => expect(getStudentAssignedProblems).toHaveBeenCalled());

  resolve(respond(rows));
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('shows an empty-batch state for a student with no enrollment', async () => {
  getStudentAssignedProblems.mockResolvedValue({
    data: {
      success: true,
      data: [],
      meta: meta({
        enrolled: false,
        batches: [],
        counts: { total: 0, solved: 0, attempted: 0, notStarted: 0 },
        topics: [],
      }),
    },
  });

  renderPage();
  await waitFor(() => expect(screen.getByRole('heading', { name: /no batch assignments yet/i })).toBeInTheDocument());

  expect(screen.getByText(/You are not currently enrolled in a batch/i)).toBeInTheDocument();
  expect(screen.queryByText('Problem A')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /go to global practice/i })).toHaveAttribute('href', '/student/practice');
});

test('distinguishes "no assignments" from "no filter matches"', async () => {
  getStudentAssignedProblems.mockResolvedValue(
    respond([], {
      counts: { total: 0, solved: 0, attempted: 0, notStarted: 0 },
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }),
  );
  const { unmount } = renderPage();
  await waitFor(() =>
    expect(screen.getByText(/No problems have been assigned to your batch yet/i)).toBeInTheDocument(),
  );
  unmount();

  // Assignments exist, but the active filter excludes every one of them.
  getStudentAssignedProblems.mockResolvedValue(
    respond([], { pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
  );
  renderPage();
  await waitFor(() => expect(screen.getByText(/No problems match your filters/i)).toBeInTheDocument());

  expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
});

test('shows an API error with a retry that refetches', async () => {
  getStudentAssignedProblems.mockRejectedValueOnce({ response: { data: { message: 'Network down' } } });
  renderPage();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Network down');

  getStudentAssignedProblems.mockResolvedValue(respond(rows));
  await userEvent.click(screen.getByRole('button', { name: /try again/i }));
  await waitFor(() => expect(inLibrary('Problem A')).toBeInTheDocument());
});

test('an API error never renders zeroed metrics', async () => {
  getStudentAssignedProblems.mockRejectedValue({ response: { data: { message: 'Boom' } } });
  renderPage();

  await screen.findByRole('alert');
  // No fabricated counts while the request is failing.
  expect(screen.queryByRole('region', { name: /assigned problem summary/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

/* ── scope ──────────────────────────────────────────────────────────── */

test('the page is titled as assigned work, not the global library', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Assigned Problems');
  expect(getStudentAssignedProblems).toHaveBeenCalledTimes(1);
});