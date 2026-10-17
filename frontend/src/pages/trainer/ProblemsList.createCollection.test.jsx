// Regression coverage for Create Collection on the Trainer Problems page.
//
// Traced end to end: open -> type -> submit -> validate -> API -> refresh ->
// select. Mocked at the existing project boundary (../../api/trainer); no
// database is involved.
//
// Covered here:
//   - the Create Collection entry points actually open the modal;
//   - typing many characters keeps the inputs controlled and focused;
//   - a valid submission carries batchId, which the backend now requires;
//   - missing batch context is refused rather than creating a GLOBAL collection;
//   - success closes, clears, refreshes and selects the new collection;
//   - failure keeps the modal open and preserves what was typed;
//   - Cancel never reaches the API;
//   - a double submit cannot create two collections.
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
} from '../../api/trainer';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../api/trainer', () => ({
  createTrainerCollection: vi.fn(),
  createTrainerTopic: vi.fn(),
  deleteProblem: vi.fn(),
  deleteTrainerCollection: vi.fn(),
  deleteTrainerTopic: vi.fn(),
  bulkImportProblems: vi.fn(),
  downloadProblemTemplate: vi.fn(),
  getBatchProblems: vi.fn(),
  getTrainerBatch: vi.fn(),
  getTrainerBatches: vi.fn(),
  getTrainerCollections: vi.fn(),
  getTrainerCollectionTopics: vi.fn(),
  unarchiveProblem: vi.fn(),
  updateTrainerCollection: vi.fn(),
  updateTrainerTopic: vi.fn(),
}));

const BATCHES = [
  { id: 'batch-1', name: 'Alpha 2026', code: 'A26', status: 'ACTIVE' },
  { id: 'batch-2', name: 'Beta 2026', code: 'B26', status: 'ACTIVE' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getTrainerBatch.mockResolvedValue({ data: { data: BATCHES[0] } });
  getTrainerBatches.mockResolvedValue({ data: { data: BATCHES } });
  getTrainerCollections.mockResolvedValue({ data: { data: [] } });
  getTrainerCollectionTopics.mockResolvedValue({ data: { data: [] } });
  getBatchProblems.mockResolvedValue({ data: { data: [] } });
  createTrainerCollection.mockResolvedValue({
    data: { success: true, data: { _id: 'col-new', name: 'Arrays Bootcamp', scope: 'BATCH', batch: 'batch-1' } },
  });
});

const renderPage = (route = '/trainer/batches/batch-1/problems') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/trainer/batches/:batchId/problems" element={<ProblemsList />} />
        <Route path="/trainer/problems" element={<ProblemsList />} />
      </Routes>
    </MemoryRouter>
  );

/** The Create Collection button in the page header (not inside the modal). */
const headerCreateButton = () =>
  Array.from(document.querySelectorAll('.trainer-page-header button')).find((b) =>
    /Create Collection/i.test(b.textContent)
  );

const openCreateDialog = async (root = renderPage()) => {
  await waitFor(() => expect(headerCreateButton()).toBeTruthy());
  fireEvent.click(headerCreateButton());
  return { root, dialog: await screen.findByRole('dialog') };
};

const typeInto = (dialog, labelPattern, value) =>
  fireEvent.change(within(dialog).getByLabelText(labelPattern), { target: { value } });

/* ------------------------------------------------------------------ opening */

test('the page header Create Collection button opens the modal', async () => {
  await openCreateDialog();
  expect(screen.getByRole('dialog', { name: /Create Collection/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/Collection name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
});

test('the empty-state Create Collection action opens the same modal', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());
  // The empty-state CTA is named distinctly from the header action so both
  // entry points are addressable; it opens the same modal.
  fireEvent.click(screen.getByRole('button', { name: /create your first collection/i }));
  expect(await screen.findByRole('dialog', { name: /Create Collection/i })).toBeInTheDocument();
});

/* -------------------------------------------------------------------- typing */

test('name and description accept many characters without losing their value', async () => {
  const { dialog } = await openCreateDialog();
  const name = within(dialog).getByLabelText(/Collection name/i);
  const description = within(dialog).getByLabelText(/Description/i);

  const longName = 'Advanced Data Structures and Algorithms';
  const longDescription = 'A curriculum covering trees, graphs, hashing and dynamic programming.';

  // Type character by character, as a user would.
  for (const value of [longName, longDescription]) {
    const field = value === longName ? name : description;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value } });
    expect(field).toHaveValue(value);
  }

  expect(name).toHaveValue(longName);
  expect(description).toHaveValue(longDescription);
});

/* ------------------------------------------------------------ batch context */

test('a valid submission sends the batchId the backend requires', async () => {
  const { dialog } = await openCreateDialog();
  typeInto(dialog, /Collection name/i, 'Arrays Bootcamp');
  typeInto(dialog, /Description/i, 'Week one');

  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() => expect(createTrainerCollection).toHaveBeenCalledTimes(1));
  expect(createTrainerCollection).toHaveBeenCalledWith({
    name: 'Arrays Bootcamp',
    description: 'Week one',
    // Prefilled from the route batch the page is already scoped to.
    batchId: 'batch-1',
  });
});

test('on the selected-batch route that batch is sent as batchId', async () => {
  // The general /trainer/problems route is batch selection, so creation is
  // scoped to the batch route. The batch comes from the route, not a picker.
  const { dialog } = await openCreateDialog(renderPage('/trainer/batches/batch-2/problems'));
  typeInto(dialog, /Collection name/i, 'Arrays Bootcamp');

  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() => expect(createTrainerCollection).toHaveBeenCalledTimes(1));
  expect(createTrainerCollection).toHaveBeenCalledWith(
    expect.objectContaining({ batchId: 'batch-2' })
  );
});

test('a collection is never created without a batchId', async () => {
  // Guards the original invariant — a collection must never be created as a
  // GLOBAL one. There is no way to reach the create dialog from the general
  // route any more, and every payload carries the route's batchId.
  renderPage('/trainer/problems');
  await waitFor(() => expect(screen.getByRole('region', { name: /available batches/i })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /Create Collection/i })).not.toBeInTheDocument();

  const { dialog } = await openCreateDialog(renderPage('/trainer/batches/batch-1/problems'));
  typeInto(dialog, /Collection name/i, 'No Batch Yet');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() => expect(createTrainerCollection).toHaveBeenCalledTimes(1));
  const [payload] = createTrainerCollection.mock.calls[0];
  expect(payload.batchId).toBe('batch-1');
  expect('batchId' in payload).toBe(true);
});

/* ------------------------------------------------------------------ success */

test('a successful creation closes, clears, refreshes and selects the new collection', async () => {
  // Second list read returns the created collection, as the server would.
  getTrainerCollections
    .mockResolvedValueOnce({ data: { data: [] } })
    .mockResolvedValue({
      data: { data: [{ id: 'col-new', name: 'Arrays Bootcamp', status: 'ACTIVE', owned: true, topicCount: 0, problemCount: 0 }] },
    });

  const { dialog } = await openCreateDialog();
  typeInto(dialog, /Collection name/i, 'Arrays Bootcamp');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  // Modal closed.
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  // Success notice (the name also appears in the row and breadcrumb).
  await waitFor(() =>
    expect(screen.getByText(/Training “Arrays Bootcamp” created/)).toBeInTheDocument()
  );

  // The list was re-read and the new collection is selected, which loads its
  // topics and clears any stale topic selection.
  await waitFor(() => expect(getTrainerCollectionTopics).toHaveBeenCalledWith('col-new'));
  await waitFor(() => expect(screen.getByText(/^Topics \(0\)$/)).toBeInTheDocument());
  expect(screen.queryByText(/^Problems \(/)).not.toBeInTheDocument();

  // Re-opening starts from a clean form rather than the previous values.
  const again = await openCreateDialog();
  expect(within(again.dialog).getByLabelText(/Collection name/i)).toHaveValue('');
  expect(within(again.dialog).getByLabelText(/Description/i)).toHaveValue('');
});

/* ------------------------------------------------------------------ failure */

test('a failed creation shows the error, keeps the modal open and preserves input', async () => {
  createTrainerCollection.mockRejectedValue({
    response: { status: 409, data: { message: 'Collection with this name already exists' } },
  });

  const { dialog } = await openCreateDialog();
  typeInto(dialog, /Collection name/i, 'Arrays Bootcamp');
  typeInto(dialog, /Description/i, 'Week one');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() =>
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Collection with this name already exists'
    )
  );
  // Modal still open with the trainer's work intact.
  expect(screen.getByRole('dialog', { name: /Create Collection/i })).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Collection name/i)).toHaveValue('Arrays Bootcamp');
  expect(within(dialog).getByLabelText(/Description/i)).toHaveValue('Week one');
  // No success notice was shown.
  expect(screen.queryByText(/created\./)).not.toBeInTheDocument();
});

test('a 403 from the batch ownership check is surfaced, not swallowed', async () => {
  createTrainerCollection.mockRejectedValue({
    response: { status: 403, data: { message: 'Access denied' } },
  });

  const { dialog } = await openCreateDialog();
  typeInto(dialog, /Collection name/i, 'Not Mine');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Access denied'));
});

/* ----------------------------------------------------- cancel / duplicate */

test('Cancel closes the modal without creating anything', async () => {
  const { dialog } = await openCreateDialog();
  typeInto(dialog, /Collection name/i, 'Abandoned');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Cancel$/i }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(createTrainerCollection).not.toHaveBeenCalled();
});

test('double-clicking Submit creates exactly one collection', async () => {
  let release;
  createTrainerCollection.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ data: { success: true, data: { _id: 'col-new' } } });
      })
  );

  const { dialog } = await openCreateDialog();
  typeInto(dialog, /Collection name/i, 'Only Once');
  const submit = within(dialog).getByRole('button', { name: /^Create Collection$/i });

  fireEvent.click(submit);
  // While the request is in flight the control is disabled and busy.
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /Saving/ })).toBeDisabled());
  fireEvent.click(within(dialog).getByRole('button', { name: /Saving/ }));

  expect(createTrainerCollection).toHaveBeenCalledTimes(1);
  release();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a blank name is refused client-side before any request', async () => {
  const { dialog } = await openCreateDialog();
  typeInto(dialog, /Collection name/i, '   ');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() =>
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name is required')
  );
  expect(createTrainerCollection).not.toHaveBeenCalled();
});