// Tests for student/Performance.jsx — the Student Stats page (/student/performance).
//
// Mocked at the `api/student` boundary so the real request contract of
// `getStudentPerformance` is exercised alongside the component.
//
// Pinned here:
//   - the GLOBAL endpoint is requested on mount, with no batch id;
//   - the real metrics, difficulty breakdown and recent activity are rendered;
//   - the Batch control only appears when the student is enrolled, and switching
//     scope re-requests with the right parameters;
//   - switching back to Global drops the batch id;
//   - a submission whose problem document is gone renders as static text, never
//     as a link to `/student/problems/undefined`;
//   - empty, loading and error states are distinct and the error is recoverable;
//   - nothing is rendered as zero-valued KPIs when the request failed;
//   - the page settles under <React.StrictMode>, which is how main.jsx mounts
//     the whole application.

import React, { StrictMode } from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/student', () => ({
  getStudentPerformance: vi.fn(),
}));

import Performance from './Performance';
import { getStudentPerformance } from '../../api/student';

const BATCHES = [
  { id: 'b1', name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE' },
  { id: 'b2', name: 'CSE 2023', code: 'CSE23', status: 'ACTIVE' },
];

const globalPayload = (overrides = {}) => ({
  data: {
    success: true,
    data: {
      scope: 'GLOBAL',
      batch: null,
      activeBatches: BATCHES,
      metrics: { assigned: 4, solved: 1, attempted: 2, notStarted: 1, completionPercentage: 25 },
      breakdowns: {
        difficulty: [
          { label: 'EASY', assigned: 3, solved: 1, attempted: 1, notStarted: 1, completionPercentage: 33 },
          { label: 'HARD', assigned: 1, solved: 0, attempted: 1, notStarted: 0, completionPercentage: 0 },
        ],
      },
      recentActivity: [
        { id: 's1', problemId: 'p1', title: 'Two Sum', verdict: 'ACCEPTED', createdAt: '2026-10-14T09:00:00.000Z' },
        { id: 's2', problemId: 'p2', title: 'Graph Walk', verdict: 'WRONG_ANSWER', createdAt: '2026-10-13T09:00:00.000Z' },
      ],
      ...overrides,
    },
  },
});

const batchPayload = (batchId) => ({
  data: {
    success: true,
    data: {
      scope: 'BATCH',
      batch: { id: batchId, name: 'CSE 2024', code: 'CSE24', status: 'ACTIVE' },
      activeBatches: BATCHES,
      metrics: { assigned: 2, solved: 2, attempted: 0, notStarted: 0, completionPercentage: 100 },
      breakdowns: {
        difficulty: [
          { label: 'EASY', assigned: 2, solved: 2, attempted: 0, notStarted: 0, completionPercentage: 100 },
        ],
      },
      recentActivity: [],
    },
  },
});

const renderPage = () =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/student/performance']}>
        <Performance />
      </MemoryRouter>
    </StrictMode>,
  );

const kpi = (label) => screen.getByText(label).closest('.pf-kpi');

beforeEach(() => {
  vi.clearAllMocks();
  getStudentPerformance.mockResolvedValue(globalPayload());
});

/* ── request contract ───────────────────────────────────────────────── */

test('requests the GLOBAL scope on mount', async () => {
  renderPage();
  await waitFor(() => expect(getStudentPerformance).toHaveBeenCalled());
  expect(getStudentPerformance).toHaveBeenCalledWith({ scope: 'GLOBAL' });
});

test('settles on real data under StrictMode', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument(), { timeout: 3000 });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

/* ── header + metrics ───────────────────────────────────────────────── */

test('shows the breadcrumb, heading and real metrics', async () => {
  renderPage();
  await waitFor(() => expect(kpi('Solved')).toBeInTheDocument());

  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(crumbs).getByText('Student')).toHaveAttribute('href', '/student');
  expect(within(crumbs).getByText('Stats')).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Performance');

  expect(kpi('Global problems')).toHaveTextContent('4');
  expect(kpi('Solved')).toHaveTextContent('1');
  expect(kpi('Completion')).toHaveTextContent('25%');
  expect(kpi('Attempted')).toHaveTextContent('2');
});

test('the progress bar exposes the real value', async () => {
  renderPage();
  await waitFor(() => expect(kpi('Solved')).toBeInTheDocument());

  const bar = screen.getByRole('progressbar', { name: /global progress completion/i });
  expect(bar).toHaveAttribute('aria-valuenow', '25');
  expect(bar).toHaveAttribute('aria-valuetext', '1 of 4 problems solved');
});

test('the difficulty breakdown renders the response rows', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Difficulty performance')).toBeInTheDocument());

  const section = screen.getByText('Difficulty performance').closest('.pf-card');
  expect(within(section).getByText('EASY')).toBeInTheDocument();
  expect(within(section).getByText(/1 solved · 1 attempted · 1 not started/)).toBeInTheDocument();
  expect(within(section).getByText('33%')).toBeInTheDocument();
});

/* ── recent activity ────────────────────────────────────────────────── */

test('recent activity links to the problem route with the real id', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Recent activity')).toBeInTheDocument());

  expect(screen.getByRole('link', { name: /Two Sum/ })).toHaveAttribute('href', '/student/problems/p1');
  expect(screen.getByRole('link', { name: /Graph Walk/ })).toHaveAttribute('href', '/student/problems/p2');
});

test('a submission whose problem is gone is static text, never a dead link', async () => {
  getStudentPerformance.mockResolvedValue(globalPayload({
    recentActivity: [
      { id: 's3', problemId: null, title: 'Deleted problem', verdict: 'WRONG_ANSWER', createdAt: '2026-10-12T09:00:00.000Z' },
    ],
  }));
  renderPage();

  await waitFor(() => expect(screen.getByText('Deleted problem')).toBeInTheDocument());

  // Scoped to the activity card: the breadcrumb is a link too.
  const activity = screen.getByText('Recent activity').closest('.pf-card');
  expect(within(activity).queryByRole('link')).not.toBeInTheDocument();
  expect(within(activity).getByText('Deleted problem').closest('li')).toHaveTextContent('Wrong answer');
  expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  expect(document.querySelector('a[href*="undefined"]')).toBeNull();
});

/* ── scope switching ────────────────────────────────────────────────── */

test('the Batch control only appears for an enrolled student', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Batch' })).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Global' })).toHaveAttribute('aria-pressed', 'true');
});

test('a student with no batch is offered Global only', async () => {
  getStudentPerformance.mockResolvedValue(globalPayload({ activeBatches: [] }));
  renderPage();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Global' })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Batch' })).not.toBeInTheDocument();
});

test('switching to Batch re-requests with a batch id and renders batch metrics', async () => {
  getStudentPerformance.mockImplementation((params) => Promise.resolve(
    params.scope === 'BATCH' ? batchPayload(params.batchId) : globalPayload(),
  ));
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Batch' })).toBeInTheDocument());

  getStudentPerformance.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Batch' }));

  await waitFor(() => expect(getStudentPerformance).toHaveBeenCalledWith({ scope: 'BATCH' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'CSE 2024' })).toBeInTheDocument());
  expect(kpi('Assigned problems')).toHaveTextContent('2');
});

test('with several batches a picker is offered and drives the request', async () => {
  getStudentPerformance.mockImplementation((params) => Promise.resolve(
    params.scope === 'BATCH'
      ? batchPayload(params.batchId || 'b1')
      : globalPayload(),
  ));
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Batch' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Batch' }));

  const picker = await screen.findByLabelText('Batch');
  await waitFor(() => expect(picker).toHaveValue('b1'));

  getStudentPerformance.mockClear();
  await userEvent.selectOptions(picker, 'b2');
  await waitFor(() => expect(getStudentPerformance).toHaveBeenCalledWith({ scope: 'BATCH', batchId: 'b2' }));
});

test('switching back to Global drops the batch id', async () => {
  getStudentPerformance.mockImplementation((params) => Promise.resolve(
    params.scope === 'BATCH' ? batchPayload(params.batchId) : globalPayload(),
  ));
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Batch' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Batch' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Global' })).toBeInTheDocument());

  getStudentPerformance.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Global' }));

  await waitFor(() => expect(getStudentPerformance).toHaveBeenCalledWith({ scope: 'GLOBAL' }));
  const lastCall = getStudentPerformance.mock.calls.at(-1)[0];
  expect(lastCall).not.toHaveProperty('batchId');
});

/* ── states ─────────────────────────────────────────────────────────── */

test('an empty scope explains itself instead of showing zeroed KPIs', async () => {
  getStudentPerformance.mockResolvedValue(globalPayload({
    metrics: { assigned: 0, solved: 0, attempted: 0, notStarted: 0, completionPercentage: 0 },
    breakdowns: { difficulty: [] },
    recentActivity: [],
  }));
  renderPage();

  expect(await screen.findByText(/No global problems available yet/i)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /global performance summary/i })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /go to practice/i })).toHaveAttribute('href', '/student/practice');
});

test('an empty BATCH scope points at the trainer rather than at Practice', async () => {
  getStudentPerformance.mockImplementation((params) => Promise.resolve(
    params.scope === 'BATCH'
      ? {
        data: {
          success: true,
          data: {
            scope: 'BATCH',
            batch: { id: 'b1', name: 'CSE 2024' },
            activeBatches: BATCHES,
            metrics: { assigned: 0, solved: 0, attempted: 0, notStarted: 0, completionPercentage: 0 },
            breakdowns: { difficulty: [] },
            recentActivity: [],
          },
        },
      }
      : globalPayload(),
  ));
  renderPage();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Batch' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Batch' }));

  expect(await screen.findByText(/No batch problems available yet/i)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /go to practice/i })).not.toBeInTheDocument();
});

test('shows a loading state while the request is pending', async () => {
  getStudentPerformance.mockImplementation(() => new Promise(() => {}));
  renderPage();
  expect(await screen.findByRole('status')).toHaveTextContent(/loading your performance/i);
});

test('an API failure is visible, recoverable, and never becomes zeroed KPIs', async () => {
  let failing = true;
  getStudentPerformance.mockImplementation(() => (failing
    ? Promise.reject({ response: { status: 500, data: { message: 'Unable to load performance data.' } } })
    : Promise.resolve(globalPayload())));
  renderPage();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Unable to load performance data.');
  expect(screen.queryByRole('region', { name: /global performance summary/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/No global problems available yet/i)).not.toBeInTheDocument();

  failing = false;
  await userEvent.click(screen.getByRole('button', { name: /try again/i }));
  await waitFor(() => expect(kpi('Solved')).toBeInTheDocument());
});

test('a 403 is surfaced, not hidden behind an empty state', async () => {
  getStudentPerformance.mockRejectedValue({
    response: {
      status: 403,
      data: {
        message: 'You are not enrolled in an active batch.',
        data: { activeBatches: BATCHES },
      },
    },
  });
  renderPage();

  expect(await screen.findByRole('alert')).toHaveTextContent(/not enrolled in an active batch/i);
  expect(screen.queryByText(/No .* problems available yet/i)).not.toBeInTheDocument();
});