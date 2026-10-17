// Tests for student/StudentDashboard.jsx.
//
// The dashboard is the first consumer of the authenticated `/student/dashboard`
// response in a place where the `{ success, data }` envelope matters, so these
// tests pin the envelope handling, the split batch/global metrics, the routes
// every action points at, and the rule that a failed request is never rendered
// as a zero-valued metric.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboard from './StudentDashboard';
import {
  getStudentAssignments,
  getStudentDashboard,
  getStudentProblems,
  getStudentSubmissions,
} from '../../api/student';

vi.mock('../../api/student', () => ({
  getStudentDashboard: vi.fn(),
  getStudentSubmissions: vi.fn(),
  getStudentProblems: vi.fn(),
  getStudentAssignments: vi.fn(),
}));

const DAY = 86400000;
const now = new Date();
const isoDaysAgo = (days) => new Date(now.getTime() - days * DAY).toISOString();

const student = {
  id: 's1',
  name: 'Aditi Ramesh',
  rollNumber: '21CS042',
  department: 'CSE',
  section: 'A',
  academicBatch: '2021 - 2025',
};

const dashboardBody = (overrides = {}) => ({
  data: {
    success: true,
    data: {
      student,
      batch: {
        id: 'b1',
        name: 'CSE 2024',
        code: 'CSE24',
        status: 'ACTIVE',
        trainerName: 'Priya Menon',
        startDate: '2026-06-01T00:00:00.000Z',
      },
      metrics: {
        totalProblems: 12,
        attemptedProblems: 7,
        solvedProblems: 5,
        accuracy: 71,
        assignedBatchProblems: 8,
        batchSolvedProblems: 3,
        globalSolvedProblems: 2,
      },
      recentSubmissions: [
        {
          id: 'sub1',
          problem: 'Two Sum',
          problemId: 'p1',
          scope: 'GLOBAL',
          verdict: 'ACCEPTED',
          createdAt: isoDaysAgo(1),
        },
        {
          id: 'sub2',
          problem: 'Binary Search',
          problemId: 'p2',
          scope: 'BATCH',
          verdict: 'WRONG_ANSWER',
          createdAt: isoDaysAgo(2),
        },
      ],
      ...overrides,
    },
  },
});

const listBody = (data) => ({ data: { success: true, data } });

const pendingAssignment = {
  id: 'a1',
  title: null,
  problem: { id: 'p3', title: 'Kadane Algorithm', difficulty: 'MEDIUM', scope: 'BATCH' },
  batch: { id: 'b1', name: 'CSE 2024', code: 'CSE24' },
  completed: false,
  completion: null,
};

const globalProblem = {
  id: 'p9',
  title: 'Balanced Brackets',
  difficulty: 'EASY',
  scope: 'GLOBAL',
  progress: 'NOT_STARTED',
};

beforeEach(() => {
  vi.clearAllMocks();
  getStudentDashboard.mockResolvedValue(dashboardBody());
  getStudentSubmissions.mockResolvedValue(listBody([
    { id: 's1', verdict: 'ACCEPTED', createdAt: isoDaysAgo(0) },
    { id: 's2', verdict: 'WRONG_ANSWER', createdAt: isoDaysAgo(0) },
    { id: 's3', verdict: 'ACCEPTED', createdAt: isoDaysAgo(3) },
  ]));
  getStudentProblems.mockResolvedValue(listBody([globalProblem]));
  getStudentAssignments.mockResolvedValue(listBody([pendingAssignment]));
});

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <StudentDashboard />
    </MemoryRouter>,
  );

test('reads the dashboard payload from the success envelope, not the response body', async () => {
  renderDashboard();
  // Regression guard: reading `response.data` yields the `{ success, data }`
  // envelope and silently renders every metric as zero.
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Batch Overview' })).toBeInTheDocument());
  expect(screen.getByText('8')).toBeInTheDocument();
  expect(screen.getByText('3 of 8 solved · 5 remaining')).toBeInTheDocument();
});

test('greets the student by name and shows their batch details', async () => {
  renderDashboard();
  await waitFor(() => expect(screen.getByText(/Aditi Ramesh/)).toBeInTheDocument());

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), Aditi Ramesh/);
  // Batch name appears in the header chip and again in the Batch Overview facts.
  expect(screen.getAllByText('CSE 2024').length).toBeGreaterThan(0);
  expect(screen.getByText('Priya Menon')).toBeInTheDocument();
  expect(screen.getByText('1 Jun 2026')).toBeInTheDocument();
  expect(screen.getByText(/2021 - 2025 · CSE · A · Roll 21CS042/)).toBeInTheDocument();
});

test('reports the four required KPIs from the split metrics', async () => {
  renderDashboard();
  await waitFor(() => expect(screen.getByText('8')).toBeInTheDocument());

  expect(screen.getByText('Assigned batch problems')).toBeInTheDocument();
  expect(screen.getByText('Batch problems solved')).toBeInTheDocument();
  expect(screen.getByText('Global problems solved')).toBeInTheDocument();

  // Global solved is read from its own KPI card, not matched anywhere in the page.
  const globalCard = screen.getByText('Global problems solved').closest('.sd-kpi');
  expect(globalCard).toHaveTextContent('2');
});

test('marks practice time unavailable instead of inventing a zero', async () => {
  renderDashboard();
  await waitFor(() => expect(screen.getByText('Practice time')).toBeInTheDocument());
  // No endpoint records session duration, so no number may be shown.
  expect(screen.getByText('Practice sessions are not timed yet')).toBeInTheDocument();
});

test('shows a useful empty state for a student with no batch', async () => {
  getStudentDashboard.mockResolvedValue(dashboardBody({
    batch: null,
    metrics: {
      totalProblems: 3,
      attemptedProblems: 1,
      solvedProblems: 1,
      accuracy: 100,
      assignedBatchProblems: 0,
      batchSolvedProblems: 0,
      globalSolvedProblems: 1,
    },
  }));

  renderDashboard();
  await waitFor(() =>
    expect(screen.getByText('You are not enrolled in a batch yet.')).toBeInTheDocument(),
  );

  expect(screen.queryByText('Priya Menon')).not.toBeInTheDocument();
  expect(screen.getByText('Global practice and the free console are still available to you.')).toBeInTheDocument();
});

test('never renders a failed KPI request as a zero metric', async () => {
  getStudentDashboard.mockRejectedValue({ response: { data: { message: 'Service unavailable' } } });

  renderDashboard();
  await waitFor(() => expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0));
  expect(screen.getAllByText('Service unavailable').length).toBeGreaterThan(0);
  // The metric slots themselves must not fall back to 0.
  const batchCard = screen.getByText('Assigned batch problems').closest('.sd-kpi');
  expect(batchCard).toHaveTextContent('Unavailable');
  expect(batchCard).not.toHaveTextContent('0');
});

test('labels recent activity with verdict, scope and a link to the problem', async () => {
  renderDashboard();
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

  const accepted = screen.getByText('Two Sum').closest('a');
  expect(accepted).toHaveAttribute('href', '/student/problems/p1');

  const failed = screen.getByText('Binary Search').closest('a');
  expect(failed).toHaveAttribute('href', '/student/problems/p2');

  // A failed submission is labelled with its real verdict, not a bare "Failed".
  expect(screen.getByText('Wrong answer')).toBeInTheDocument();
  expect(screen.getAllByText('Batch').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Global').length).toBeGreaterThan(0);
});

test('shows an activity empty state with a link to start practising', async () => {
  getStudentDashboard.mockResolvedValue(dashboardBody({ recentSubmissions: [] }));
  renderDashboard();

  await waitFor(() => expect(screen.getByText('No submissions yet.')).toBeInTheDocument());
  const cta = screen.getAllByRole('link', { name: /browse problems/i });
  expect(cta[0]).toHaveAttribute('href', '/student/problems');
});

test('builds the weekly chart from real submission timestamps only', async () => {
  getStudentSubmissions.mockResolvedValue(listBody([
    { id: 's1', verdict: 'ACCEPTED', createdAt: isoDaysAgo(0) },
    { id: 's2', verdict: 'WRONG_ANSWER', createdAt: isoDaysAgo(6) },
  ]));

  renderDashboard();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Weekly Activity' })).toBeInTheDocument());

  const chart = screen.getByRole('img', { name: /weekly activity chart/i });
  // 2 submissions in the window, 1 of them accepted — counted, not invented.
  expect(chart).toHaveAccessibleName('Weekly activity chart. 2 submissions over the last 7 days, 1 accepted.');
});

test('omits the chart entirely when there is no activity instead of drawing zeros', async () => {
  getStudentSubmissions.mockResolvedValue(listBody([]));
  renderDashboard();

  await waitFor(() =>
    expect(screen.getByText('No submissions in the last 7 days.')).toBeInTheDocument(),
  );
  expect(screen.queryByRole('img', { name: /weekly activity chart/i })).not.toBeInTheDocument();
});

test('continue practising labels batch and global scope separately', async () => {
  getStudentProblems.mockResolvedValue(listBody([globalProblem]));
  renderDashboard();

  await waitFor(() => expect(screen.getByText('Kadane Algorithm')).toBeInTheDocument());
  expect(screen.getByText('Balanced Brackets')).toBeInTheDocument();

  const batchCard = screen.getByText('Kadane Algorithm').closest('li');
  expect(batchCard).toHaveTextContent('Batch');
  expect(batchCard).toHaveTextContent('MEDIUM');
  expect(screen.getByRole('link', { name: 'Continue' }).closest('li')).toBe(batchCard);

  const globalCard = screen.getByText('Balanced Brackets').closest('li');
  expect(globalCard).toHaveTextContent('Global');
  expect(globalCard).toHaveTextContent('EASY');
  expect(screen.getByRole('link', { name: 'Solve' })).toHaveAttribute('href', '/student/problems/p9');
});

test('never links to an undefined problem id', async () => {
  // An assignment whose problem payload is missing must not produce /undefined.
  getStudentAssignments.mockResolvedValue(listBody([{ ...pendingAssignment, problem: null }]));
  getStudentProblems.mockResolvedValue(listBody([]));
  renderDashboard();

  await waitFor(() =>
    expect(screen.getByText('Nothing in progress right now.')).toBeInTheDocument(),
  );
  expect(screen.queryByRole('link', { name: /continue|solve|review/i })).not.toBeInTheDocument();
});

test('offers Problems, Practice and Free Console when there is nothing to continue', async () => {
  getStudentAssignments.mockResolvedValue(listBody([]));
  getStudentProblems.mockResolvedValue(listBody([]));
  renderDashboard();

  await waitFor(() =>
    expect(screen.getByText('Nothing in progress right now.')).toBeInTheDocument(),
  );
  const links = screen.getAllByRole('link');
  const hrefs = links.map((link) => link.getAttribute('href'));
  expect(hrefs).toContain('/student/problems');
  expect(hrefs).toContain('/student/practice');
  expect(hrefs).toContain('/student/freeconsole');
});

test('points batch actions at the existing /student/batch route, not a batch id', async () => {
  renderDashboard();
  await waitFor(() => expect(screen.getByRole('link', { name: /view batch/i })).toBeInTheDocument());

  // /student/batch/:id is not a registered route and fell through to /login.
  const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
  expect(hrefs).toContain('/student/batch');
  expect(hrefs.some((href) => href?.startsWith('/student/batch/'))).toBe(false);
});

test('batches its breadcrumb inside a link so navigation stays client-side', async () => {
  renderDashboard();
  const breadcrumb = await screen.findByRole('navigation', { name: 'Breadcrumb' });
  const home = breadcrumb.querySelector('a');
  expect(home).toHaveAttribute('href', '/student');
  expect(breadcrumb).toHaveTextContent('Dashboard');
});

test('requests each endpoint exactly once', async () => {
  renderDashboard();
  await waitFor(() => expect(screen.getByText('Batch Overview')).toBeInTheDocument());

  expect(getStudentDashboard).toHaveBeenCalledTimes(1);
  expect(getStudentSubmissions).toHaveBeenCalledTimes(1);
  expect(getStudentProblems).toHaveBeenCalledTimes(1);
  expect(getStudentAssignments).toHaveBeenCalledTimes(1);
});