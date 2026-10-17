// Regression coverage for the Trainer Problems workspace
// (frontend/src/pages/trainer/ProblemsList.jsx).
//
// The page mirrors Admin Problems & Curriculum: a Collections panel on the left,
// and a Content panel that is either "Topics for the selected Collection"
// (state 2) or "Problems for the selected Topic" (state 3).
//
// What is pinned here:
//   - only trainer-OWNED collections are ever listed (global Admin curriculum
//     is never offered, and a hand-edited ?collectionId= cannot pull one in);
//   - problems are shown only in state 3, and only for the selected
//     Collection AND Topic;
//   - search and the difficulty/status filters are local — they never re-query;
//   - Edit / Archive / Restore / Delete call the trainer-authorized APIs only;
//   - loading, empty and error states are distinguished.
//
// Batch-scoped behaviour (the general view's batch picker and Create Collection)
// is covered in TrainerProblems.test.jsx.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProblemsList from './ProblemsList';
import {
  createTrainerCollection,
  createTrainerTopic,
  deleteProblem,
  deleteTrainerCollection,
  deleteTrainerTopic,
  getBatchProblems,
  getTrainerBatch,
  getTrainerBatches,
  getTrainerCollections,
  getTrainerCollectionTopics,
  unarchiveProblem,
  updateTrainerCollection,
  updateTrainerTopic,
} from '../../api/trainer';
import { downloadProblemTemplateFile } from '../../components/trainer/ProblemImportModal';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../api/trainer', () => ({
  createTrainerCollection: vi.fn(),
  createTrainerTopic: vi.fn(),
  deleteProblem: vi.fn(),
  deleteTrainerCollection: vi.fn(),
  deleteTrainerTopic: vi.fn(),
  getBatchProblems: vi.fn(),
  getTrainerBatch: vi.fn(),
  getTrainerBatches: vi.fn(),
  getTrainerCollections: vi.fn(),
  getTrainerCollectionTopics: vi.fn(),
  unarchiveProblem: vi.fn(),
  updateTrainerCollection: vi.fn(),
  updateTrainerTopic: vi.fn(),
}));

vi.mock('../../components/trainer/ProblemImportModal', async () => {
  const actual = await vi.importActual('../../components/trainer/ProblemImportModal');
  return {
    __esModule: true,
    ...actual,
    default: ({ isOpen, collectionId, topicId }) =>
      isOpen ? (
        <div data-testid="import-modal" data-collection={collectionId} data-topic={topicId} />
      ) : null,
    downloadProblemTemplateFile: vi.fn(),
  };
});

const collection = (overrides = {}) => ({
  id: 'col-1',
  name: 'Arrays & Strings',
  status: 'ACTIVE',
  owned: true,
  topicCount: 2,
  problemCount: 3,
  ...overrides,
});

const topic = (overrides = {}) => ({
  id: 'topic-1',
  name: 'Two Pointer',
  status: 'ACTIVE',
  owned: true,
  order: 1,
  problemCount: 2,
  ...overrides,
});

const problem = (overrides = {}) => ({
  id: 'p1',
  title: 'Two Sum',
  description: 'Find the pair that sums to the target.',
  difficulty: 'EASY',
  status: 'PUBLISHED',
  collectionId: 'col-1',
  topicId: 'topic-1',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getTrainerBatch.mockResolvedValue({ data: { data: { id: 'batch-1', name: 'Alpha 2026' } } });
  getTrainerBatches.mockResolvedValue({ data: { data: [] } });
  getTrainerCollections.mockResolvedValue({
    data: {
      data: [
        collection(),
        collection({ id: 'col-2', name: 'Graphs Traversal', topicCount: 1, problemCount: 1 }),
        // Global Admin curriculum — must never reach the Trainer UI.
        collection({ id: 'col-shared', name: 'Admin Curriculum', owned: false }),
      ],
    },
  });
  getTrainerCollectionTopics.mockResolvedValue({
    data: {
      data: [topic(), topic({ id: 'topic-2', name: 'Sliding Window', problemCount: 1 })],
    },
  });
  getBatchProblems.mockResolvedValue({
    data: {
      data: [
        problem(),
        problem({ id: 'p2', title: 'Three Sum', topicId: 'topic-2' }),
        problem({ id: 'p3', title: 'Unlinked Task', topicId: undefined, collectionId: undefined }),
        // Belongs to a different collection: must not leak into col-1's topics.
        problem({
          id: 'p4',
          title: 'Other Collection Problem',
          collectionId: 'col-2',
          topicId: 'topic-1',
        }),
        problem({ id: 'p5', title: 'Archived Task', status: 'ARCHIVED' }),
        problem({ id: 'p6', title: 'Hard Task', difficulty: 'HARD', status: 'DRAFT' }),
      ],
    },
  });
  createTrainerCollection.mockResolvedValue({ data: { data: { _id: 'col-new' } } });
  createTrainerTopic.mockResolvedValue({ data: { data: {} } });
  updateTrainerTopic.mockResolvedValue({ data: { data: {} } });
  updateTrainerCollection.mockResolvedValue({ data: { data: {} } });
  deleteTrainerTopic.mockResolvedValue({ data: { data: { archived: true } } });
  deleteTrainerCollection.mockResolvedValue({ data: { data: { archived: true } } });
  deleteProblem.mockResolvedValue({ data: { success: true } });
  unarchiveProblem.mockResolvedValue({ data: { success: true } });
  downloadProblemTemplateFile.mockResolvedValue({
    topic: 'Arrays',
    problems: [{ title: 'Two Sum', difficulty: 'EASY', description: 'd' }],
  });
});

const renderPage = (route = '/trainer/batches/batch-1/problems') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/trainer/problems" element={<ProblemsList />} />
        <Route path="/trainer/batches/:batchId/problems" element={<ProblemsList />} />
      </Routes>
    </MemoryRouter>
  );

const collectionsPanel = (root) => root.container.querySelector('.admin-problems__collections-panel');
/** Topics are chosen through a dropdown, not a list. */
const topicSelect = (root) => root.container.querySelector('.admin-problems__topic-selector');
/** Per-topic actions live in the section header once a topic is selected. */
const topicActions = (root) =>
  within(root.container.querySelector('.admin-problems__section-actions'));
/** A collection row, scoped because its action buttons share names with the
 *  topic rows and the confirm dialog. */
const collectionRow = (root, name) => {
  const item = Array.from(
    collectionsPanel(root).querySelectorAll('.admin-problems__collection-item')
  ).find((el) => el.textContent.includes(name));
  return within(item);
};
/** A problem table row's action cluster. */
const problemRow = (title) => within(screen.getByText(title).closest('tr'));
const openCollection = async (name) => {
  const root = renderPage();
  await waitFor(() => expect(within(collectionsPanel(root)).getByText(name)).toBeInTheDocument());
  fireEvent.click(within(collectionsPanel(root)).getByText(name));
  // Selecting a collection is explicit (nothing is auto-selected), so wait for
  // the topics section that the selection triggers to finish loading.
  await waitFor(() => expect(root.container.querySelector('.admin-problems__topics-header')).toBeInTheDocument());
  return root;
};
const openTopic = async (name) => {
  const root = await openCollection('Arrays & Strings');
  await waitFor(() => expect(topicSelect(root)).toBeInTheDocument());
  const option = Array.from(topicSelect(root).options).find((o) => o.textContent.includes(name));
  expect(option).toBeTruthy();
  fireEvent.change(topicSelect(root), { target: { value: option.value } });
  return root;
};

/** jsdom here has no Blob.prototype.text(); read through FileReader. */
const readBlob = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });

/* ------------------------------------------------------------ collections */

test('lists only owned collections, with a heading count and search', async () => {
  const root = renderPage();

  await waitFor(() => expect(screen.getByText(/^Collections \(2\)$/)).toBeInTheDocument());
  expect(within(collectionsPanel(root)).getByText('Arrays & Strings')).toBeInTheDocument();
  expect(within(collectionsPanel(root)).getByText('Graphs Traversal')).toBeInTheDocument();
  // owned:false is dropped, so global Admin curriculum is absent entirely.
  expect(screen.queryByText('Admin Curriculum')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Search collections'), {
    target: { value: 'graph' },
  });
  expect(within(collectionsPanel(root)).queryByText('Arrays & Strings')).not.toBeInTheDocument();
  expect(within(collectionsPanel(root)).getByText('Graphs Traversal')).toBeInTheDocument();
});

test('shows the No Collections Yet state with a working Create Collection action', async () => {
  getTrainerCollections.mockResolvedValue({ data: { data: [] } });
  renderPage();

  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());
  expect(
    screen.getByText('Create a collection for your batch before adding topics and problems.')
  ).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Create Collection/i }).length).toBeGreaterThan(0);
});

test('a collection load failure is reported and retryable', async () => {
  getTrainerCollections.mockRejectedValue({
    response: { status: 500, data: { message: 'Internal server error' } },
  });
  renderPage();

  await waitFor(() => expect(screen.getByText(/Couldn.t load collections/)).toBeInTheDocument());
  expect(screen.getByText('Internal server error')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});

test('editing a collection calls the trainer API with only supported fields', async () => {
  const root = await openCollection('Arrays & Strings');

  fireEvent.click(collectionRow(root, 'Arrays & Strings').getByRole('button', { name: /^Edit/ }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Collection name/i), {
    target: { value: 'Renamed' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: /Save Changes/i }));

  await waitFor(() => expect(updateTrainerCollection).toHaveBeenCalledTimes(1));
  const [id, payload] = updateTrainerCollection.mock.calls[0];
  expect(id).toBe('col-1');
  expect(payload.name).toBe('Renamed');
  expect(payload).not.toHaveProperty('batch');
});

test('archiving a collection confirms first, then patches status', async () => {
  const root = await openCollection('Arrays & Strings');

  fireEvent.click(collectionRow(root, 'Arrays & Strings').getByRole('button', { name: /^Archive/ }));

  const dialog = await screen.findByRole('dialog');
  expect(updateTrainerCollection).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole('button', { name: /^Archive$/ }));
  await waitFor(() => expect(updateTrainerCollection).toHaveBeenCalledWith('col-1', { status: 'ARCHIVED' }));
});

test('deleting a collection reports when it was archived instead of removed', async () => {
  const root = await openCollection('Arrays & Strings');

  fireEvent.click(collectionRow(root, 'Arrays & Strings').getByRole('button', { name: /^Delete/ }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));

  await waitFor(() => expect(deleteTrainerCollection).toHaveBeenCalledWith('col-1'));
  // The API answers "archived, not deleted" when the collection still has content.
  await waitFor(() => expect(screen.getByText(/archived instead/i)).toBeInTheDocument());
});

/* ----------------------------------------------------------------- topics */

test('selecting a collection shows its topics with a count', async () => {
  await openCollection('Arrays & Strings');

  await waitFor(() => expect(screen.getByText(/^Topics \(2\)$/)).toBeInTheDocument());
  expect(getTrainerCollectionTopics).toHaveBeenCalledWith('col-1');
  // State 2: no problem table until a topic is chosen.
  expect(screen.queryByText(/^Problems \(/)).not.toBeInTheDocument();
});

test('the topic dropdown lists only the selected collection’s topics', async () => {
  const root = await openCollection('Arrays & Strings');
  await waitFor(() => expect(topicSelect(root)).toBeInTheDocument());
  const callsAfterLoad = getTrainerCollectionTopics.mock.calls.length;

  const labels = Array.from(topicSelect(root).options).map((o) => o.textContent);
  expect(labels.some((l) => /Two Pointer/.test(l))).toBe(true);
  expect(labels.some((l) => /Sliding Window/.test(l))).toBe(true);
  // Selecting a topic must not re-query the API.
  expect(getTrainerCollectionTopics.mock.calls.length).toBe(callsAfterLoad);
});

test('switching collection clears the topic selection', async () => {
  const root = await openCollection('Arrays & Strings');
  await waitFor(() => expect(topicSelect(root)).toBeInTheDocument());
  const first = Array.from(topicSelect(root).options).find((o) => /Two Pointer/.test(o.textContent));
  fireEvent.change(topicSelect(root), { target: { value: first.value } });
  await waitFor(() => expect(screen.getByText(/^Problems \(/)).toBeInTheDocument());

  // Choosing another collection must drop the now-incompatible topic.
  fireEvent.click(within(collectionsPanel(root)).getByText('Graphs Traversal'));
  await waitFor(() => expect(screen.getByText(/^Topics \(/)).toBeInTheDocument());
  expect(screen.queryByText(/^Problems \(/)).not.toBeInTheDocument();
  expect(topicSelect(root)).toHaveValue('');
});

test('a topic load failure is reported, not shown as an empty list', async () => {
  getTrainerCollectionTopics.mockRejectedValue({
    response: { status: 500, data: { message: 'Internal server error' } },
  });
  await openCollection('Arrays & Strings');

  await waitFor(() => expect(screen.getByText(/Couldn.t load topics/)).toBeInTheDocument());
  expect(screen.getByText('Internal server error')).toBeInTheDocument();
});

test('an empty topic list offers Add Topic rather than an error', async () => {
  getTrainerCollectionTopics.mockResolvedValue({ data: { data: [] } });
  await openCollection('Arrays & Strings');

  await waitFor(() => expect(screen.getByText('No topics yet')).toBeInTheDocument());
  expect(screen.getAllByRole('button', { name: /Add Topic/i }).length).toBeGreaterThan(0);
});

test('Add Topic creates against the selected collection and refreshes', async () => {
  const root = await openCollection('Arrays & Strings');

  fireEvent.click(within(root.container.querySelector('.admin-problems__topics-header')).getByRole('button', { name: /Add Topic/i }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Topic name/i), { target: { value: 'New Topic' } });
  fireEvent.change(within(dialog).getByLabelText(/Order/i), { target: { value: '3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Create Topic/i }));

  await waitFor(() =>
    expect(createTrainerTopic).toHaveBeenCalledWith('col-1', {
      name: 'New Topic',
      description: '',
      order: 3,
    })
  );
  await waitFor(() => expect(getTrainerCollectionTopics.mock.calls.length).toBeGreaterThan(1));
});

test('a topic name is required before anything is sent', async () => {
  const root = await openCollection('Arrays & Strings');
  fireEvent.click(within(root.container.querySelector('.admin-problems__topics-header')).getByRole('button', { name: /Add Topic/i }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Topic name/i), { target: { value: '  ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Create Topic/i }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Name is required');
  expect(createTrainerTopic).not.toHaveBeenCalled();
});

test('editing a topic patches it against its collection', async () => {
  const root = await openTopic('Two Pointer');
  await waitFor(() => expect(topicActions(root).getByRole('button', { name: /Edit Topic/i })).toBeInTheDocument());

  fireEvent.click(topicActions(root).getByRole('button', { name: /Edit Topic/i }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Topic name/i), { target: { value: 'Renamed Topic' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Save Changes/i }));

  await waitFor(() =>
    expect(updateTrainerTopic).toHaveBeenCalledWith(
      'col-1',
      'topic-1',
      expect.objectContaining({ name: 'Renamed Topic' })
    )
  );
});

test('archiving a topic uses the trainer archive endpoint', async () => {
  const root = await openTopic('Two Pointer');
  await waitFor(() => expect(topicActions(root).getByRole('button', { name: /^Archive$/ })).toBeInTheDocument());

  fireEvent.click(topicActions(root).getByRole('button', { name: /^Archive$/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Archive$/ }));
  await waitFor(() =>
    expect(updateTrainerTopic).toHaveBeenCalledWith('col-1', 'topic-1', { status: 'ARCHIVED' })
  );
});

test('an archived topic offers restore and delete instead of archive', async () => {
  getTrainerCollectionTopics.mockResolvedValue({
    data: {
      data: [topic({ id: 'topic-1', name: 'Two Pointer', status: 'ARCHIVED' }), topic({ id: 'topic-2', name: 'Sliding Window' })],
    },
  });
  const root = await openTopic('Two Pointer');
  const actions = topicActions(root);

  await waitFor(() => expect(actions.getByRole('button', { name: /Unarchive/i })).toBeInTheDocument());
  expect(actions.queryByRole('button', { name: /^Archive$/ })).toBeNull();
  expect(actions.getByRole('button', { name: /^Delete$/ })).toBeInTheDocument();

  fireEvent.click(actions.getByRole('button', { name: /^Delete$/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }));
  await waitFor(() => expect(deleteTrainerTopic).toHaveBeenCalledWith('col-1', 'topic-1'));
});

/* --------------------------------------------------------------- problems */

test('selecting a topic shows only problems in that collection AND topic', async () => {
  await openTopic('Two Pointer');

  await waitFor(() => expect(screen.getByText(/^Problems \(3\)$/)).toBeInTheDocument());
  // p1, p5 and p6 are all in col-1/topic-1.
  expect(screen.getByText('Two Sum')).toBeInTheDocument();
  expect(screen.getByText('Archived Task')).toBeInTheDocument();
  // Different topic.
  expect(screen.queryByText('Three Sum')).not.toBeInTheDocument();
  // Same topic, different collection: must not be misattributed.
  expect(screen.queryByText('Other Collection Problem')).not.toBeInTheDocument();
  // Unlinked.
  expect(screen.queryByText('Unlinked Task')).not.toBeInTheDocument();
});

test('search and filters narrow the table locally', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());
  const callsAfterLoad = getBatchProblems.mock.calls.length;

  fireEvent.change(screen.getByLabelText('Search problems'), { target: { value: 'hard' } });
  expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
  expect(screen.getByText('Hard Task')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Search problems'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Filter by difficulty'), { target: { value: 'HARD' } });
  expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
  expect(screen.getByText('Hard Task')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Filter by difficulty'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'DRAFT' } });
  expect(screen.getByText('Hard Task')).toBeInTheDocument();
  expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();

  // Filtering must not re-hit the API.
  expect(getBatchProblems.mock.calls.length).toBe(callsAfterLoad);
});

test('a topic with no problems shows an empty state, not an error', async () => {
  getBatchProblems.mockResolvedValue({ data: { data: [] } });
  await openTopic('Two Pointer');

  await waitFor(() => expect(screen.getByText('No problems yet')).toBeInTheDocument());
});

test('a problem load failure is reported with the server message', async () => {
  getBatchProblems.mockRejectedValue({
    response: { status: 500, data: { message: 'Internal server error' } },
  });
  await openTopic('Two Pointer');

  await waitFor(() => expect(screen.getByText(/Couldn.t load problems/)).toBeInTheDocument());
  expect(screen.getByText('Internal server error')).toBeInTheDocument();
});

test('editing a problem carries the collection and topic context', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

  fireEvent.click(problemRow('Two Sum').getByRole('button', { name: /^Edit$/ }));

  expect(mockNavigate).toHaveBeenCalledWith(
    '/trainer/batches/batch-1/problems/p1/edit?collectionId=col-1&topicId=topic-1'
  );
});

test('viewing a problem opens the trainer details route', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

  fireEvent.click(problemRow('Two Sum').getByRole('button', { name: /^View$/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/trainer/batches/batch-1/problems/p1');
});

test('archiving a problem confirms first, then calls the soft delete', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

  fireEvent.click(problemRow('Two Sum').getByRole('button', { name: /^Archive$/ }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(/Students will no longer see it/i);
  expect(dialog).toHaveTextContent(/submissions and its completion history are kept/i);
  expect(deleteProblem).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole('button', { name: /^Archive$/ }));
  await waitFor(() => expect(deleteProblem).toHaveBeenCalledWith('batch-1', 'p1'));
});

test('an archived problem offers Restore instead of Archive', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Archived Task')).toBeInTheDocument());

  const row = screen.getByText('Archived Task').closest('tr');
  expect(within(row).getByRole('button', { name: /^Restore$/ })).toBeTruthy();
  expect(within(row).queryByRole('button', { name: /^Archive$/ })).toBeNull();

  fireEvent.click(within(row).getByRole('button', { name: /^Restore$/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Restore$/ }));

  await waitFor(() => expect(unarchiveProblem).toHaveBeenCalledWith('batch-1', 'p5'));
});

test('cancelling a confirmation sends no request', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

  fireEvent.click(problemRow('Two Sum').getByRole('button', { name: /^Archive$/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(deleteProblem).not.toHaveBeenCalled();
});

/* ------------------------------------------------------------ JSON import */

test('the Add Problem dialog prefills the current collection and offers the four entry points', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /Add Problem/i })[0]);

  const dialog = await screen.findByRole('dialog');
  // Reached from within a collection, so the gate is pre-satisfied but still
  // changeable — and it never lists a collection the trainer does not own.
  const select = within(dialog).getByLabelText(/Collection/i);
  expect(select).toHaveValue('col-1');
  expect(Array.from(select.options).some((o) => /Admin Curriculum/.test(o.textContent))).toBe(false);

  expect(within(dialog).getByRole('button', { name: /Download Template/i })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: /Import JSON File/i })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: /Enter JSON Text/i })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: /Add Topic/i })).toBeInTheDocument();
});

test('clearing the collection in the dialog hides every entry point', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /Add Problem/i })[0]);
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Collection/i), { target: { value: '' } });

  expect(within(dialog).queryByRole('button', { name: /Download Template/i })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /Import JSON File/i })).not.toBeInTheDocument();
});

test('the template carries the selected topic name and never a batch or collection key', async () => {
  const blobs = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = vi.fn((blob) => {
    blobs.push(blob);
    return 'blob:mock';
  });
  URL.revokeObjectURL = vi.fn();

  try {
    await openTopic('Two Pointer');
    await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /Add Problem/i })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Download Template/i }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(downloadProblemTemplateFile).toHaveBeenCalledWith('batch-1', { asJson: true });

    const parsed = JSON.parse(await readBlob(blobs[blobs.length - 1]));
    // The grouped template names its Day. The collection is chosen in the UI at
    // import time and the batch comes from the route, so neither is written into
    // the file — a template cannot be edited into importing somewhere else.
    expect(parsed.topic).toBe('Two Pointer');
    expect(Array.isArray(parsed.problems)).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain('col-1');
    expect(JSON.stringify(parsed)).not.toContain('topic-1');
    expect(JSON.stringify(parsed)).not.toContain('batch');
  } finally {
    URL.createObjectURL = original;
  }
});

test('switching collection in the dialog stops the old topic name being offered', async () => {
  const blobs = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = vi.fn((blob) => {
    blobs.push(blob);
    return 'blob:mock';
  });
  URL.revokeObjectURL = vi.fn();

  try {
    await openTopic('Two Pointer');
    await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: /Add Problem/i })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Collection/i), { target: { value: 'col-2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Download Template/i }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const parsed = JSON.parse(await readBlob(blobs[blobs.length - 1]));
    // "Two Pointer" belongs to col-1. Naming it now would create a look-alike Day
    // inside col-2 rather than reusing the existing one, so the template keeps
    // its own example name instead.
    expect(parsed.topic).toBe('Arrays');
    expect(JSON.stringify(parsed)).not.toContain('Two Pointer');
  } finally {
    URL.createObjectURL = original;
  }
});

test('the import modal receives the selected collection and topic', async () => {
  await openTopic('Two Pointer');
  await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /Add Problem/i })[0]);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Import JSON File/i }));

  const modal = await screen.findByTestId('import-modal');
  expect(modal).toHaveAttribute('data-collection', 'col-1');
  expect(modal).toHaveAttribute('data-topic', 'topic-1');
});

/* ------------------------------------------------------- breadcrumb */

test('shows correct breadcrumb when a batch is selected', async () => {
  const root = renderPage();
  // Readiness probe: the workspace heading. Since the page split into a batch
  // picker and a batch workspace, only the picker is called
  // "Problems & Curriculum"; the workspace heading is "Problems".
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Problems' })).toBeInTheDocument());

  // Check breadcrumb items. Scoped to the breadcrumb because the workspace
  // heading is also called "Problems" now that the two views have separate titles.
  const crumb = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
  expect(crumb.getByText('Trainer')).toBeInTheDocument();
  expect(crumb.getByText('Problems')).toBeInTheDocument();
  // The batch name arrives with its own request, so wait for it rather than
  // assuming the workspace heading implies the batch has loaded.
  await waitFor(() => expect(screen.getByText('Alpha 2026')).toBeInTheDocument());

  // Verify breadcrumb hierarchy: Trainer / Problems / BatchName (not Trainer / Batches / ... / Problems)
  expect(screen.queryByText('Batches')).not.toBeInTheDocument();

  // Verify links
  const trainerLink = screen.getByRole('link', { name: 'Trainer' });
  expect(trainerLink).toHaveAttribute('href', '/trainer');

  const problemsLink = screen.getByRole('link', { name: 'Problems' });
  expect(problemsLink).toHaveAttribute('href', '/trainer/problems');

  // Batch name should not be a link (it's the current page)
  const batchBreadcrumb = screen.getByText('Alpha 2026');
  expect(batchBreadcrumb.tagName).toBe('SPAN');
});

test('shows correct breadcrumb when no batch is selected (general view)', async () => {
  const root = renderPage('/trainer/problems');
  await waitFor(() => expect(screen.getByText('Problems & Curriculum')).toBeInTheDocument());

  // Check breadcrumb items: only Trainer / Problems
  expect(screen.getByText('Trainer')).toBeInTheDocument();
  expect(screen.getByText('Problems')).toBeInTheDocument();

  // Problems should not be a link on the general view (it's the current page)
  const problemsBreadcrumb = screen.getByText('Problems');
  expect(problemsBreadcrumb.tagName).toBe('SPAN');
});

test('PROBLEMS breadcrumb links back to /trainer/problems', async () => {
  const root = renderPage('/trainer/batches/batch-1/problems');
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Problems' })).toBeInTheDocument());

  const problemsLink = screen.getByRole('link', { name: 'Problems' });
  expect(problemsLink).toHaveAttribute('href', '/trainer/problems');
});
