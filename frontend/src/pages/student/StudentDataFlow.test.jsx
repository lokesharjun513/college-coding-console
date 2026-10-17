// Data-flow tests for the two Student pages that were silently showing nothing:
// /student/problems (blank screen) and /student (placeholders instead of metrics).
//
// What is pinned here:
//
//   1. Both pages settle on real data when mounted under <React.StrictMode>,
//      which is how main.jsx mounts the whole application. Both used a
//      cleanup-only `mounted` ref: React 18 StrictMode unmounts and remounts
//      every component in development, the flag stayed false, every response was
//      judged superseded and no state was ever written — so the Problems page sat
//      on its loading skeleton forever and the Dashboard never left its loading
//      placeholders, while the requests themselves had succeeded.
//   2. The real `api/student` module and the shared authenticated axios client
//      are used — the mock is at the axios layer, so a wrong URL, a wrong query
//      contract or a mis-unwrapped `{ success, data }` envelope fails here.
//   3. Each page still distinguishes loading, populated, empty and error, and the
//      error state stays recoverable.
//   4. Problem rows navigate to the registered solving route with the id the API
//      actually returned.

import React, { StrictMode } from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';

// Mocked at the axios instance, not at `api/student`: the module under test must
// be the real one, including its request contract.
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

import Problems from './Problems';
import StudentDashboard from './StudentDashboard';

/* ── payloads ───────────────────────────────────────────────────────── */

const problemRow = (overrides = {}) => ({
  id: 'p1',
  title: 'Two Sum',
  slug: 'two-sum',
  description: 'Find the pair that sums to the target.',
  difficulty: 'EASY',
  scope: 'BATCH',
  status: 'PUBLISHED',
  isToday: true,
  topic: 'Arrays',
  batch: { id: 'b1', name: 'CSE 2024', code: 'CSE24' },
  progress: 'NOT_STARTED',
  attempts: 0,
  latestVerdict: null,
  lastAttemptAt: null,
  ...overrides,
});

const problemsMeta = (overrides = {}) => ({
  scope: 'BATCH',
  enrolled: true,
  batches: [{
    id: 'b1', name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE',
    trainerName: 'Priya Menon', startDate: '2026-06-01T00:00:00.000Z',
    assigned: 2, solved: 1,
  }],
  counts: { total: 2, solved: 1, attempted: 0, notStarted: 1 },
  completionPercentage: 50,
  today: [{ id: 'p1', title: 'Two Sum', difficulty: 'EASY', topic: 'Arrays', progress: 'NOT_STARTED' }],
  todayCount: 1,
  difficulties: ['EASY', 'HARD'],
  topics: ['Arrays'],
  pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
  ...overrides,
});

const problemsPayload = (data, metaOverrides) => ({
  data: { success: true, data, meta: problemsMeta(metaOverrides) },
});

const dashboardPayload = (overrides = {}) => ({
  data: {
    success: true,
    data: {
      student: {
        id: 'u1', name: 'Aditi Ramesh', email: 'aditi@college.test',
        rollNumber: '21CS042', department: 'Computer Science', section: 'A', academicBatch: '2024',
      },
      batch: {
        id: 'b1', name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE',
        trainerName: 'Priya Menon', startDate: '2026-06-01T00:00:00.000Z', endDate: null,
      },
      metrics: {
        totalProblems: 9, attemptedProblems: 5, solvedProblems: 3, accuracy: 60,
        assignedBatchProblems: 7, batchSolvedProblems: 2, globalSolvedProblems: 1,
      },
      recentSubmissions: [{
        id: 's1', problem: 'Two Sum', problemId: 'p1', scope: 'BATCH',
        verdict: 'ACCEPTED', createdAt: '2026-10-14T09:00:00.000Z',
      }],
      ...overrides,
    },
  },
});

const EMPTY_ARRAY = { data: { success: true, data: [] } };

/** Routes each API path to its payload; `/student/problems` defaults to empty. */
function routeApi(overrides = {}) {
  get.mockImplementation((url) => {
    const path = String(url);
    if (path.includes('/student/dashboard')) return Promise.resolve(dashboardPayload());
    if (path.includes('/student/submissions')) {
      return Promise.resolve({
        data: {
          success: true,
          data: [{
            _id: 's1', problem: { _id: 'p1', title: 'Two Sum', scope: 'BATCH' },
            verdict: 'ACCEPTED', createdAt: '2026-10-14T09:00:00.000Z',
          }],
        },
      });
    }
    if (overrides[path]) return Promise.resolve(overrides[path]);
    return Promise.resolve(EMPTY_ARRAY);
  });
}

/** Stands in for `/student/problems/:id` so navigation can be observed. */
function SolvedRoute() {
  const { id } = useParams();
  return <p data-testid="solved-route">{`solving ${id}`}</p>;
}

beforeEach(() => {
  get.mockReset();
});

/* ═══ /student/problems ═════════════════════════════════════════════ */

const renderProblems = () =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/student/problems']}>
        <Routes>
          <Route path="/student/problems" element={<Problems />} />
          <Route path="/student/problems/:id" element={<SolvedRoute />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );

test('renders a loading state while the request is pending, even under StrictMode', async () => {
  get.mockImplementation(() => new Promise(() => {}));
  renderProblems();

  expect(await screen.findByRole('status')).toHaveTextContent(/loading your assigned problems/i);
});

test('renders the real assigned problems returned by the API', async () => {
  routeApi({
    '/student/problems': problemsPayload(
      [problemRow(), problemRow({ id: 'p2', title: 'Three Sum', difficulty: 'HARD', topic: 'Graphs', isToday: false })],
      { topics: ['Arrays', 'Graphs'] },
    ),
  });
  renderProblems();

  await waitFor(() => expect(within(screen.getByRole('region', { name: /assigned problem library/i })).getByText('Two Sum')).toBeInTheDocument());

  const library = screen.getByRole('region', { name: /assigned problem library/i });
  expect(within(library).getByText('Three Sum')).toBeInTheDocument();
  // Real metadata from the response, not invented.
  expect(within(library).getByText('Two Sum').closest('li')).toHaveTextContent('Arrays');
  expect(within(library).getByText('Two Sum').closest('li')).toHaveTextContent('EASY');
});

test('maps the batch, trainer and counts from the response', async () => {
  routeApi({ '/student/problems': problemsPayload([problemRow()]) });
  renderProblems();

  expect(await screen.findByRole('heading', { name: 'CSE 2024' })).toBeInTheDocument();
  expect(screen.getByText(/Trainer Priya Menon/)).toBeInTheDocument();

  const header = document.querySelector('.sp-header__summary');
  expect(header).toHaveTextContent('2 assigned');
  expect(header).toHaveTextContent('1 solved');
  expect(header).toHaveTextContent('1 remaining');

  const progress = screen.getByRole('progressbar', { name: 'Overall completion' });
  expect(progress).toHaveAttribute('aria-valuenow', '50');
  expect(progress).toHaveAttribute('aria-valuetext', '1 of 2 assigned problems solved');
});

test('requests the batch-scoped endpoint with the documented query contract', async () => {
  routeApi({ '/student/problems': problemsPayload([problemRow()]) });
  renderProblems();
  await waitFor(() => expect(get).toHaveBeenCalled());

  const [url, config] = get.mock.calls.find(([u]) => String(u).includes('/student/problems'));
  expect(url).toBe('/student/problems');
  expect(config.params).toMatchObject({ scope: 'BATCH', page: 1, pageSize: 20 });
});

test("today's work is rendered from the API rather than the current page", async () => {
  routeApi({ '/student/problems': problemsPayload([problemRow()]) });
  renderProblems();

  const today = await screen.findByRole('region', { name: /today's assigned problems/i });
  expect(within(today).getByText('Two Sum')).toBeInTheDocument();
});

test('an empty assignment set shows the empty state, not an error', async () => {
  routeApi({
    '/student/problems': problemsPayload([], {
      batches: [], counts: { total: 0, solved: 0, attempted: 0, notStarted: 0 },
      today: [], todayCount: 0, topics: [], difficulties: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }),
  });
  renderProblems();

  expect(await screen.findByText(/No problems have been assigned to your batch yet/i)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a student with no batch sees the enrolment empty state', async () => {
  routeApi({
    '/student/problems': problemsPayload([], {
      enrolled: false, batches: [], counts: { total: 0, solved: 0, attempted: 0, notStarted: 0 },
      today: [], todayCount: 0, topics: [], difficulties: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }),
  });
  renderProblems();

  expect(await screen.findByRole('heading', { name: /no batch assignments yet/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /go to global practice/i })).toHaveAttribute('href', '/student/practice');
});

test('an API failure shows a readable error and the retry recovers', async () => {
  get.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal server error' } } });
  routeApi({ '/student/problems': problemsPayload([problemRow()]) });

  renderProblems();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Internal server error');
  // A failure must never be dressed up as an empty result.
  expect(screen.queryByText(/No problems have been assigned/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect((await screen.findAllByText('Two Sum')).length).toBeGreaterThan(0);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a 403 is surfaced, not swallowed and not redirected away', async () => {
  get.mockRejectedValue({ response: { status: 403, data: { message: 'Access denied' } } });
  renderProblems();

  expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
});

test('missing optional fields render without crashing', async () => {
  // No topic, no batch, no trainer, no attempts, no verdict, no dates.
  routeApi({
    '/student/problems': problemsPayload(
      [{
        id: 'p9', title: 'Sparse Row', difficulty: null, progress: 'ATTEMPTED',
        topic: null, batch: null, attempts: 0, latestVerdict: null, lastAttemptAt: null, isToday: false,
      }],
      {
        batches: [],
        counts: { total: 1, solved: 0, attempted: 1, notStarted: 0 },
        today: [], todayCount: 0, topics: [], difficulties: [],
      },
    ),
  });
  renderProblems();

  const row = (await screen.findByText('Sparse Row')).closest('li');
  expect(row).toBeInTheDocument();
  expect(row).toHaveTextContent('Unspecified');
  expect(row).toHaveTextContent('Attempted');
});

test('each action navigates to the registered route with the API problem id', async () => {
  routeApi({
    '/student/problems': problemsPayload(
      [problemRow(), problemRow({ id: 'p2', title: 'Three Sum', progress: 'SOLVED', isToday: false, attempts: 3 })],
      { topics: ['Arrays'] },
    ),
  });
  renderProblems();

  const library = await screen.findByRole('region', { name: /assigned problem library/i });
  await userEvent.click(within(library).getByRole('button', { name: /^Solve Two Sum$/ }));

  expect(await screen.findByTestId('solved-route')).toHaveTextContent('solving p1');
});

test('a repeated problem id is rendered once', async () => {
  routeApi({
    '/student/problems': problemsPayload([problemRow(), problemRow(), problemRow({ id: 'p2', title: 'Three Sum', isToday: false })]),
  });
  renderProblems();

  const library = await screen.findByRole('region', { name: /assigned problem library/i });
  expect(within(library).getAllByText('Two Sum')).toHaveLength(1);
  expect(within(library).getAllByRole('listitem')).toHaveLength(2);
});

/* ═══ /student dashboard ══════════════════════════════════════════════ */

const renderDashboard = () =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/student']}>
        <StudentDashboard />
      </MemoryRouter>
    </StrictMode>,
  );

test('the dashboard calls every endpoint it renders, on the shared client', async () => {
  routeApi();
  const { rerender } = renderDashboard();

  await waitFor(() => expect(get).toHaveBeenCalled());
  const paths = () => get.mock.calls.map(([url]) => String(url));

  expect(new Set(paths())).toEqual(new Set([
    '/student/dashboard',
    '/student/submissions',
    '/student/assignments',
    '/student/problems',
  ]));

  // Re-rendering must not re-fetch: the effect dependencies are stable, so a
  // second render issues no further requests. (StrictMode intentionally
  // double-invokes mount effects in development; that is a React behaviour, not
  // a repeat-on-every-render bug, and it does not happen in production.)
  const before = get.mock.calls.length;
  rerender(
    <StrictMode>
      <MemoryRouter initialEntries={['/student']}>
        <StudentDashboard />
      </MemoryRouter>
    </StrictMode>,
  );
  expect(get.mock.calls.length).toBe(before);
});

test('the dashboard shows the real student, batch and metric values', async () => {
  routeApi();
  renderDashboard();

  await waitFor(() => expect(screen.getByText('Priya Menon')).toBeInTheDocument());

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Aditi Ramesh');
  expect(screen.getByText(/21CS042/)).toBeInTheDocument();
  expect(screen.getAllByText('CSE 2024').length).toBeGreaterThan(0);

  const kpi = (label) =>
    screen.getByText(label).closest('.sd-kpi').querySelector('.sd-kpi__value').textContent;

  expect(kpi('Assigned batch problems')).toBe('7');
  expect(kpi('Batch problems solved')).toBe('2');
  expect(kpi('Global problems solved')).toBe('1');
});

test('the batch progress bar reflects the real metrics', async () => {
  routeApi();
  renderDashboard();

  await waitFor(() => expect(screen.getByText('Priya Menon')).toBeInTheDocument());
  const bar = screen.getByRole('progressbar');
  expect(bar).toHaveAttribute('aria-valuenow', String(Math.round((2 / 7) * 100)));
  expect(bar).toHaveAttribute('aria-valuetext', '2 of 7 batch problems solved');
});

test('Practice time stays explicitly unavailable', async () => {
  routeApi();
  renderDashboard();

  await waitFor(() => expect(screen.getByText('Practice time')).toBeInTheDocument());
  expect(screen.getByText(/Practice sessions are not timed yet/i)).toBeInTheDocument();
});

test('a student with no batch gets empty states, never fabricated zeros', async () => {
  get.mockImplementation((url) => {
    if (String(url).includes('/student/dashboard')) {
      return Promise.resolve(dashboardPayload({
        batch: null,
        metrics: {
          totalProblems: 3, attemptedProblems: 1, solvedProblems: 1, accuracy: 100,
          assignedBatchProblems: 0, batchSolvedProblems: 0, globalSolvedProblems: 1,
        },
        recentSubmissions: [],
      }));
    }
    return Promise.resolve(EMPTY_ARRAY);
  });
  renderDashboard();

  expect(await screen.findByText(/You are not enrolled in a batch yet/i)).toBeInTheDocument();

  const assignedKpi = screen.getByText('Assigned batch problems').closest('.sd-kpi');
  // "—" (unavailable), not a confident 0 that reads like real data.
  expect(assignedKpi.querySelector('.sd-kpi__value').textContent).toBe('—');
  expect(screen.getByText('No submissions yet.')).toBeInTheDocument();
});

test('a failing dashboard request is visible and recoverable, never a zero KPI', async () => {
  get.mockImplementation((url) => {
    if (String(url).includes('/student/dashboard')) {
      return Promise.reject({ response: { status: 500, data: { message: 'Dashboard unavailable' } } });
    }
    return Promise.resolve(EMPTY_ARRAY);
  });
  renderDashboard();

  await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  expect(screen.getAllByText('Dashboard unavailable').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
});

test('a failing request recovers on retry', async () => {
  // StrictMode double-invokes the mount effect, so the failure has to cover
  // every dashboard call until the flag is flipped — otherwise the second call
  // simply succeeds and no error state is ever reached.
  let failing = true;
  get.mockImplementation((url) => {
    if (String(url).includes('/student/dashboard')) {
      if (failing) return Promise.reject({ response: { status: 500, data: { message: 'Temporary failure' } } });
      return Promise.resolve(dashboardPayload());
    }
    return Promise.resolve(EMPTY_ARRAY);
  });
  renderDashboard();

  await waitFor(() => expect(screen.getAllByText('Temporary failure').length).toBeGreaterThan(0));

  failing = false;
  // The failed-load state offers a retry; once a batch is loaded the same
  // section exposes it as "Refresh".
  await userEvent.click((await screen.findAllByRole('button', { name: /retry|refresh/i }))[0]);

  await waitFor(() => expect(screen.getByText('Priya Menon')).toBeInTheDocument());
});

test('a response missing optional fields does not crash the dashboard', async () => {
  get.mockImplementation((url) => {
    if (String(url).includes('/student/dashboard')) {
      return Promise.resolve({
        data: {
          success: true,
          data: {
            student: { id: 'u1', name: 'Sparse Student' },
            batch: { id: 'b1', name: 'CSE 2024', trainerName: null, startDate: null, status: null },
            metrics: {},
            recentSubmissions: [],
          },
        },
      });
    }
    return Promise.resolve(EMPTY_ARRAY);
  });
  renderDashboard();

  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sparse Student'));
  expect(screen.getByText('Not assigned')).toBeInTheDocument();
  expect(screen.getByText('Not recorded')).toBeInTheDocument();
});