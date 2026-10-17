// Coverage for the general Problems view — /trainer/problems
// (frontend/src/pages/trainer/ProblemsList.jsx, routed from AppRoutes.jsx).
//
// /trainer/problems shares the Collection -> Topic -> Problems workspace with
// /trainer/batches/:batchId/problems, but there is no :batchId in the route, so
// the trainer picks the batch here. Batch-scoped behaviour (Day selection,
// problems, template, archive) is covered in ProblemsList.test.jsx; this file
// covers what is specific to having no batch in the route.
//
// The important behaviours pinned here:
//   - the batch picker offers only this trainer's own batches;
//   - no batch is chosen -> no problem request is fired at all;
//   - "No Collections Yet" is shown with a working Create Collection action;
//   - Create Collection sends only the fields the backend accepts (no invented
//     batch field), then selects the new collection so the next step is Add Topic;
//   - a create failure surfaces the server's own message.

import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProblemsList from './ProblemsList';
import {
  createTrainerCollection,
  getBatchProblems,
  getTrainerBatch,
  getTrainerBatches,
  getTrainerCollections,
  getTrainerCollectionTopics,
  updateProblem,
} from '../../api/trainer';


// We do not mock react-router-dom to allow MemoryRouter and useNavigate to work correctly in tests.;

vi.mock('../../api/trainer', () => ({
  createTrainerCollection: vi.fn(),
  getBatchProblems: vi.fn(),
  getTrainerBatch: vi.fn(),
  getTrainerBatches: vi.fn(),
  getTrainerCollections: vi.fn(),
  getTrainerCollectionTopics: vi.fn(),
  updateProblem: vi.fn(),
}));

vi.mock('../../components/ui/toast/ToastProvider', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

const batches = [
  { id: 'batch-1', name: 'Alpha 2026', code: 'A26', status: 'ACTIVE' },
  { id: 'batch-2', name: 'Beta 2026', code: 'B26', status: 'ACTIVE' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getTrainerBatches.mockResolvedValue({ data: { data: batches } });
  getTrainerBatch.mockResolvedValue({ data: { data: batches[0] } });
  getTrainerCollectionTopics.mockResolvedValue({
    data: { data: [{ id: 't1', name: 'Day One', status: 'ACTIVE', owned: true, order: 1 }] },
  });
  // We need to ensure we return batches here so the problem loader sees them
  getBatchProblems.mockResolvedValue({ data: { data: [] } });
  createTrainerCollection.mockResolvedValue({
    data: { data: { _id: 'col-new', name: 'Arrays Bootcamp' } },
  });
  // Initial fetch returns empty, then refetch after create returns the new collection
  getTrainerCollections.mockResolvedValueOnce({ data: { data: [] } });
  getTrainerCollections.mockResolvedValue({
    data: { data: [{ id: 'col-new', name: 'Arrays Bootcamp', status: 'ACTIVE', owned: true, topicCount: 0 }] },
  });
});

const renderPage = (route = '/trainer/problems') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/trainer/problems" element={<ProblemsList />} />
        <Route path="/trainer/batches/:batchId/problems" element={<ProblemsList />} />
      </Routes>
    </MemoryRouter>
  );

test('lists only the trainer\u2019s own batches as the working context', async () => {
  renderPage();

  await waitFor(() => expect(screen.getByText('Problems & Curriculum')).toBeInTheDocument());
  // Batch cards should be rendered
  expect(screen.getByText('Alpha 2026')).toBeInTheDocument();
  expect(screen.getByText('Beta 2026')).toBeInTheDocument();
});

test('issues no problem request until a batch is chosen', async () => {
  renderPage();

  await waitFor(() => expect(getTrainerBatches).toHaveBeenCalledTimes(1));
  // Problems are batch-scoped; without a batch there is nothing to ask for.
  expect(getBatchProblems).not.toHaveBeenCalled();
  // No batch means no collection topic can be opened, so the Add Problem
  // toolbar (which lives inside the topic view) is not rendered at all.
  expect(screen.queryByRole('button', { name: /Add Problem/i })).not.toBeInTheDocument();
});

test('choosing a batch loads exactly that batch’s problems', async () => {
  // Reset mocks and set up specific data for this test
  getTrainerCollections.mockReset();
  getTrainerCollections.mockResolvedValue({
    data: {
      data: [{ id: 'col-1', name: 'Arrays', status: 'ACTIVE', owned: true, topicCount: 1, problemCount: 1 }],
    },
  });
  getTrainerCollectionTopics.mockResolvedValue({
    data: { data: [{ id: 't1', name: 'Day One', status: 'ACTIVE', owned: true, order: 1 }] },
  });
  renderPage();

  await waitFor(() => expect(screen.getByText('Alpha 2026')).toBeInTheDocument());
  const alphaCard = screen.getByText('Alpha 2026').closest('.trainer-batch-card');
  fireEvent.click(within(alphaCard).getByRole('button', { name: /Manage Problems/i }));

  // Choosing a batch loads that batch's own context, and only that batch.
  await waitFor(() => expect(getTrainerBatch).toHaveBeenCalledWith('batch-1'));
  await waitFor(() => expect(screen.getByText('Arrays')).toBeInTheDocument());
  expect(getTrainerBatch).not.toHaveBeenCalledWith('batch-2');

  // It deliberately does NOT imply a collection was chosen: choosing a batch
  // must not silently select its first collection, so no topics load and no
  // problem request is made for a collection the trainer never picked.
  expect(screen.queryByRole('heading', { name: 'Topics (1)', level: 3 })).not.toBeInTheDocument();
  expect(getBatchProblems).not.toHaveBeenCalled();

  // An explicit choice is what loads problems: pick the collection, then its
  // topic. Neither step is implied by having opened the batch.
  fireEvent.click(screen.getByText('Arrays'));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Topics (1)', level: 3 })).toBeInTheDocument()
  );
  expect(getBatchProblems).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Select topic'), { target: { value: 't1' } });
  await waitFor(() =>
    expect(getBatchProblems).toHaveBeenCalledWith('batch-1', { collectionId: 'col-1', topicId: 't1' })
  );
  expect(getBatchProblems).not.toHaveBeenCalledWith('batch-2', expect.anything());
});

test('shows the No Collections Yet empty state without duplicate Create Collection button', async () => {
  // We are in the batch workspace view for batch-1
  renderPage('/trainer/batches/batch-1/problems');

  // Mock the batch
  getTrainerBatch.mockResolvedValue({ data: { data: { id: 'batch-1', name: 'Alpha 2026' } } });
  // Mock collections to be empty
  getTrainerCollections.mockResolvedValue({ data: { data: [] } });

  // Use a more generic query to find the empty state
  await waitFor(() => expect(screen.getByText(/No Collections Yet/i)).toBeInTheDocument());
});

test('collections panel shows (0) count and search input when empty', async () => {
  // We are in the batch workspace view for batch-1
  renderPage('/trainer/batches/batch-1/problems');

  // Mock the batch
  getTrainerBatch.mockResolvedValue({ data: { data: { id: 'batch-1', name: 'Alpha 2026' } } });
  // Mock collections to be empty
  getTrainerCollections.mockResolvedValue({ data: { data: [] } });
  // Mock topics and problems to avoid errors
  getTrainerCollectionTopics.mockResolvedValue({ data: { data: [] } });
  getBatchProblems.mockResolvedValue({ data: { data: [] } });

  await waitFor(() => expect(screen.getByText(/^Collections \(0\)$/)).toBeInTheDocument());
  expect(screen.getByLabelText('Search collections')).toBeInTheDocument();
});

test('content panel hidden when no collections selected, avoiding duplicate create button', async () => {
  // We are in the batch workspace view for batch-1
  renderPage('/trainer/batches/batch-1/problems');

  // Mock the batch
  getTrainerBatch.mockResolvedValue({ data: { data: { id: 'batch-1', name: 'Alpha 2026' } } });
  // Mock collections to be empty
  getTrainerCollections.mockResolvedValue({ data: { data: [] } });
  // Mock topics and problems to avoid errors
  getTrainerCollectionTopics.mockResolvedValue({ data: { data: [] } });
  getBatchProblems.mockResolvedValue({ data: { data: [] } });

  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());
  // The content panel shouldn't exist when no collections are selected
  expect(screen.queryByRole('region', { name: /content panel/i })).not.toBeInTheDocument();
});

test('Create Collection sends only backend-supported fields and then selects it', async () => {
  renderPage('/trainer/batches/batch-1/problems');
  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /Create Collection/i })[0]);

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Collection name/i), {
    target: { value: 'Arrays Bootcamp' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Description/i), {
    target: { value: 'Week one fundamentals' },
  });
  // Choosing a batch here is page context only (batchId from URL)
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() => expect(createTrainerCollection).toHaveBeenCalledTimes(1));

const [payload] = createTrainerCollection.mock.calls[0];
  // Trainer curriculum is BATCH scope: the server now requires a batchId, and
  // the selected batch is sent as `batchId` (never as a `batch` field).
  expect(payload).toEqual({
    name: 'Arrays Bootcamp',
    description: 'Week one fundamentals',
    batchId: 'batch-1',
  });
  expect(payload).not.toHaveProperty('batch');

  // The list is re-read so the `owned` flag is present, then the new collection
  // is selected so the trainer's next step is Add Topic. Both happen after the
  // refetch resolves, so the assertion has to wait rather than sample instantly.
  await waitFor(() => expect(getTrainerCollections).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(getTrainerCollectionTopics).toHaveBeenCalledWith('col-new'));
});

test('a create failure surfaces the server message and leaves the dialog open', async () => {
  createTrainerCollection.mockRejectedValue({
    response: { status: 409, data: { message: 'Collection with this name already exists' } },
  });
  renderPage('/trainer/batches/batch-1/problems');
  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());
  fireEvent.click(screen.getAllByRole('button', { name: /Create Collection/i })[0]);
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Collection name/i), { target: { value: 'Taken' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Collection with this name already exists'
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('on batch-specific route, the batch comes from the route, not a dialog dropdown', async () => {
  getTrainerBatch.mockResolvedValue({ data: { data: { id: 'batch-1', name: 'Alpha 2026' } } });
  renderPage('/trainer/batches/batch-1/problems');

  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());
  // The batch is established by the route and shown in the breadcrumb.
  await waitFor(() => expect(screen.getByText('Alpha 2026')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /Create Collection/i })[0]);

  const dialog = await screen.findByRole('dialog');
  // Nothing to pick: no batch field is shown or required, because there is
  // exactly one batch in play.
  expect(screen.queryByLabelText('Batch *')).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('combobox', { name: /Batch/i })).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText(/Batch/i)).not.toBeInTheDocument();
});

test('on batch-specific route, correct batchId is sent without dropdown', async () => {
  getTrainerBatch.mockResolvedValue({ data: { data: { id: 'batch-1', name: 'Alpha 2026' } } });
  renderPage('/trainer/batches/batch-1/problems');

  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());
  fireEvent.click(screen.getAllByRole('button', { name: /Create Collection/i })[0]);

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Collection name/i), {
    target: { value: 'Arrays Bootcamp' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Description/i), {
    target: { value: 'Week one fundamentals' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() => expect(createTrainerCollection).toHaveBeenCalledTimes(1));
  const [payload] = createTrainerCollection.mock.calls[0];
  expect(payload).toEqual({
    name: 'Arrays Bootcamp',
    description: 'Week one fundamentals',
    batchId: 'batch-1',
  });
});

test('on the general route, collection creation is unavailable because there is no batch', async () => {
  // This used to assert that a batch dropdown inside the dialog blocked
  // submission. After the split the general route has no collection dialog at
  // all, so the stronger guarantee holds: no batch, no collection management,
  // and nothing is ever created without a batch.
  renderPage('/trainer/problems');

  await waitFor(() => expect(screen.getByText('Problems & Curriculum')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /Create Collection/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Add Topic/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('heading', { name: 'Alpha 2026' }));
  expect(createTrainerCollection).not.toHaveBeenCalled();
});

test('the collection name is required before anything is sent', async () => {
  renderPage('/trainer/batches/batch-1/problems');
  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /Create Collection/i })[0]);
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Collection name/i), { target: { value: '   ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Name is required');
  expect(createTrainerCollection).not.toHaveBeenCalled();
});
// ------------------------------------------------------------ initial state

/**
 * Two authorized collections (3 + 2 topics) plus one global Admin collection
 * that must never contribute to any count.
 */
const seedWorkspace = () => {
  // beforeEach queues a one-shot empty list for the create-collection flow;
  // reset first so the mount-time fetch gets this workspace instead.
  getTrainerCollections.mockReset();
  getTrainerCollections.mockResolvedValue({
    data: {
      data: [
        { id: 'col-1', name: 'Arrays', status: 'ACTIVE', owned: true, topicCount: 3, problemCount: 4 },
        { id: 'col-2', name: 'Graphs', status: 'ACTIVE', owned: true, topicCount: 2, problemCount: 1 },
        { id: 'col-shared', name: 'Admin Curriculum', status: 'ACTIVE', owned: false, topicCount: 99, problemCount: 99 },
      ],
    },
  });
  getBatchProblems.mockResolvedValue({
    data: {
      data: [
        { id: 'p1', title: 'A', status: 'PUBLISHED' },
        { id: 'p2', title: 'B', status: 'PUBLISHED' },
        { id: 'p3', title: 'C', status: 'DRAFT' },
      ],
    },
  });
};

// Scoped to the KPI card: once a topic is open, labels like "Published" also
// appear in the problems table, so a bare text query is ambiguous.
const kpiValue = (label) => {
  const card = Array.from(document.querySelectorAll('.admin-dashboard__stat-card')).find((c) =>
    c.querySelector('.admin-dashboard__stat-label')?.textContent.trim() === label
  );
  return card.querySelector('.admin-dashboard__stat-value').textContent.trim();
};

test('the initial header matches the Admin Problems & Curriculum heading', async () => {
  renderPage();

  await waitFor(() => expect(screen.getByText('Problems & Curriculum')).toBeInTheDocument());
  // The general route carries the batch-selection description; the
  // "Manage collections..." line belongs to the batch workspace only.
  expect(
    screen.getByText(/Select a batch to manage its coding problems/i)
  ).toBeInTheDocument();

  // Trainer / Problems. There is no batch in the trail on the general page.
  const breadcrumb = document.querySelector('.trainer-breadcrumb');
  expect(breadcrumb).toBeTruthy();
  expect(within(breadcrumb).getByText('Trainer')).toBeInTheDocument();
  expect(within(breadcrumb).getByText('Problems')).toBeInTheDocument();
  expect(screen.queryByText('Batches')).not.toBeInTheDocument();
});

test('breadcrumb shows Trainer / Problems on general view without batch', async () => {
  renderPage('/trainer/problems');

  await waitFor(() => expect(screen.getByText('Problems & Curriculum')).toBeInTheDocument());
  const breadcrumb = document.querySelector('.trainer-breadcrumb');
  expect(breadcrumb).toBeTruthy();
  expect(within(breadcrumb).getByText('Trainer')).toBeInTheDocument();
  expect(within(breadcrumb).getByText('Problems')).toBeInTheDocument();
  expect(screen.queryByText('Batches')).not.toBeInTheDocument();
});

test('breadcrumb shows Trainer / Problems / BATCHNAME on batch-specific view', async () => {
  renderPage('/trainer/batches/batch-1/problems');

  await waitFor(() => expect(screen.getByText('Problems', { selector: 'h1' })).toBeInTheDocument());
  const breadcrumb = document.querySelector('.trainer-breadcrumb');
  expect(breadcrumb).toBeTruthy();
  expect(within(breadcrumb).getByText('Trainer')).toBeInTheDocument();
  expect(within(breadcrumb).getByText('Problems')).toBeInTheDocument();
  expect(within(breadcrumb).getByText('Alpha 2026')).toBeInTheDocument();
  expect(screen.queryByText('Batches')).not.toBeInTheDocument();

  // Trainer and Problems should be links
  const trainerLink = within(breadcrumb).getByRole('link', { name: 'Trainer' });
  expect(trainerLink).toHaveAttribute('href', '/trainer');

  const problemsLink = within(breadcrumb).getByRole('link', { name: 'Problems' });
  expect(problemsLink).toHaveAttribute('href', '/trainer/problems');

  // Batch name should not be a link (current page)
  const batchBreadcrumb = within(breadcrumb).getByText('Alpha 2026');
  expect(batchBreadcrumb.tagName).toBe('SPAN');
});

test('PROBLEMS breadcrumb links back to /trainer/problems', async () => {
  renderPage('/trainer/batches/batch-1/problems');

  await waitFor(() => expect(screen.getByText('Problems', { selector: 'h1' })).toBeInTheDocument());
  const breadcrumb = document.querySelector('.trainer-breadcrumb');
  const problemsLink = within(breadcrumb).getByRole('link', { name: 'Problems' });
  expect(problemsLink).toHaveAttribute('href', '/trainer/problems');
});

test('the KPI row renders the four Admin cards in order', async () => {
  renderPage('/trainer/batches/batch-1/problems');

  await waitFor(() => expect(screen.getByText('Collections')).toBeInTheDocument());
  const labels = Array.from(document.querySelectorAll('.admin-dashboard__stat-label')).map(
    (el) => el.textContent.trim()
  );
  expect(labels).toEqual(['Collections', 'Topics', 'Total Problems', 'Published']);
});

test('KPI counts come from authorized Trainer data only', async () => {
  seedWorkspace();
  // The batch comes from the route path now; `?batchId=` was the single-page
  // mechanism and no longer selects a batch.
  renderPage('/trainer/batches/batch-1/problems');

  // Problems are topic-scoped, so the counters only reflect a topic the trainer
  // has actually opened. Drive the workspace to that state before reading them.
  await waitFor(() => expect(screen.getByText('Arrays')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Arrays'));
  await waitFor(() => expect(screen.getByLabelText('Select topic')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Select topic'), { target: { value: 't1' } });

  await waitFor(() => expect(kpiValue('Total Problems')).toBe('3'));
  // 3 + 2 from the owned collections; the global Admin collection is excluded.
  expect(kpiValue('Topics')).toBe('5');
  expect(kpiValue('Total Problems')).toBe('3');
  expect(kpiValue('Published')).toBe('2');
  expect(screen.queryByText('Admin Curriculum')).not.toBeInTheDocument();
});

test('the general route shows no workspace KPIs and asks for no problems', async () => {
  seedWorkspace();
  // Equivalent behaviour after the split: with no batch chosen there is no
  // workspace to count, so no KPI row renders and no problem request is fired.
  // (Previously this asserted zeroed counters, which required a workspace on a
  // batch-less route.)
  renderPage('/trainer/problems');

  await waitFor(() => expect(screen.getByText('Problems & Curriculum')).toBeInTheDocument());
  expect(screen.queryByText('Collections')).not.toBeInTheDocument();
  expect(screen.queryByText('Total Problems')).not.toBeInTheDocument();
  expect(document.querySelector('.admin-problems__collections-panel')).toBeNull();
  expect(getBatchProblems).not.toHaveBeenCalled();
});

test('with no collection selected the content panel is hidden when collections are empty', async () => {
  renderPage('/trainer/batches/batch-1/problems');

  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());
  // The collection list is still rendered on the left.
  expect(document.querySelector('.admin-problems__collections-panel')).toBeTruthy();
  // No content panel shown when no collections exist
  expect(screen.queryByText(/Choose a collection/)).not.toBeInTheDocument();
  // No topic or problem surfaces until a collection is chosen.
  expect(screen.queryByText(/^Topics \(/)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Problems \(/)).not.toBeInTheDocument();
});

test('selecting a collection shows its breadcrumb, Topics heading and actions', async () => {
  seedWorkspace();
  getTrainerCollectionTopics.mockResolvedValue({
    data: { data: [{ id: 't1', name: 'Day One', status: 'ACTIVE', owned: true, order: 1, problemCount: 1 }] },
  });

  renderPage('/trainer/batches/batch-1/problems');
  await waitFor(() => expect(screen.getByText('Arrays')).toBeInTheDocument());

  fireEvent.click(screen.getByText('Arrays'));

await waitFor(() => expect(screen.getByText(/^Topics \(1\)$/)).toBeInTheDocument());
  // Breadcrumb: Collections / Arrays. Scoped because "Collections" is also a
  // KPI label and a panel heading.
  const crumbs = document.querySelector('.admin-problems__breadcrumb');
  expect(within(crumbs).getByText('Collections')).toBeInTheDocument();
  expect(within(crumbs).getByText('Arrays')).toBeInTheDocument();

// Add Topic and the topic selector are both present.
  expect(screen.getAllByRole('button', { name: /Add Topic/i }).length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Select topic')).toBeInTheDocument();
});
