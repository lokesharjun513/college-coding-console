// Focused coverage for the Trainer Problems Bulk Upload workflow.
//
// These tests deliberately use the REAL ProblemImportModal (unlike
// ProblemsList.test.jsx, which stubs it) because the point here is the actual
// import path: template generation, file import, pasted-text import, invalid
// JSON, row validation, and the refresh that follows a successful import.
//
// The JSON contract is the backend's own (backend/src/routes/trainer/problems.js
// POST /import): a flat array of `{ collectionId, topicId, problem }` rows, with
// collectionId/topicId optional per row and falling back to the request-level
// values the modal sends.
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProblemsList from './ProblemsList';
import {
  bulkImportProblems,
  downloadProblemTemplate,
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

vi.mock('../../components/ui/toast/ToastProvider', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../../api/trainer', () => ({
  bulkImportProblems: vi.fn(),
  downloadProblemTemplate: vi.fn(),
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

const TEMPLATE_ROW = {
  problem: {
    title: 'Two Sum',
    description: 'Find the pair that sums to the target.',
    difficulty: 'EASY',
  },
};

const VALID_ROW = {
  collectionId: '6ac7d722dcbd6a49cc3b719e',
  topicId: '6ac7d727dcbd6a49cc3b71b5',
  problem: { title: 'Imported One', description: 'd', difficulty: 'EASY' },
};

beforeEach(() => {
  vi.clearAllMocks();
  getTrainerBatch.mockResolvedValue({ data: { data: { id: 'batch-1', name: 'Alpha 2026' } } });
  getTrainerBatches.mockResolvedValue({ data: { data: [] } });
  getTrainerCollections.mockResolvedValue({
    data: {
      data: [
        {
          id: '6ac7d722dcbd6a49cc3b719e',
          name: 'Arrays & Strings',
          status: 'ACTIVE',
          owned: true,
          topicCount: 1,
          problemCount: 0,
        },
      ],
    },
  });
  getTrainerCollectionTopics.mockResolvedValue({
    data: {
      data: [
        { id: '6ac7d727dcbd6a49cc3b71b5', name: 'Two Pointer', status: 'ACTIVE', owned: true, order: 1, problemCount: 0 },
      ],
    },
  });
  getBatchProblems.mockResolvedValue({ data: { data: [] } });
  // The template endpoint returns a blob; without a resolved value every template
  // test failed inside fetchTemplateJson rather than exercising the download.
  downloadProblemTemplate.mockResolvedValue({
    data: JSON.stringify({
      topic: 'Arrays',
      problems: [{ title: 'Two Sum', description: 'd', difficulty: 'EASY' }],
    }),
  });
  bulkImportProblems.mockResolvedValue({
    data: {
      success: true,
      summary: { total: 1, created: 1, failed: 0 },
    },
  });
});

const renderPage = (route = '/trainer/batches/batch-1/problems?collectionId=6ac7d722dcbd6a49cc3b719e&topicId=6ac7d727dcbd6a49cc3b71b5') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/trainer/batches/:batchId/problems" element={<ProblemsList />} />
        <Route path="/trainer/problems" element={<ProblemsList />} />
      </Routes>
    </MemoryRouter>
  );

/** The collection name also appears in the breadcrumb, so scope to the panel. */
const collectionNamed = (name) =>
  within(document.querySelector('.admin-problems__collections-panel')).getByText(name);

/** "Import JSON" opens ProblemImportModal directly from the page (outside any dialog). */
const bulkButton = (root) =>
  Array.from(root.container.querySelectorAll('button')).find(
    (b) => /Import JSON/i.test(b.textContent) && b.closest('[role=dialog]') === null
  ) || null;

/** Open the ProblemImportModal from the workspace. */
const openBulkDialog = async (root = renderPage()) => {
  await waitFor(() => expect(collectionNamed('Arrays & Strings')).toBeInTheDocument());
  await waitFor(() => expect(bulkButton(root)).toBeTruthy());
  fireEvent.click(bulkButton(root));
  return { root, dialog: await screen.findByRole('dialog') };
};

/**
 * The import modal is a two-step confirm: "Import N problems" reveals
 * "Confirm import", which is what actually calls the API.
 */
const submitImport = async () => {
  const importModal = screen.getByRole('dialog');
  // findByRole, not getByRole: reading a file goes through the async FileReader
  // fallback, so the "Import N problems" button only appears once parsing has
  // settled. A synchronous lookup here is a race that passes only in isolation.
  const start = await within(importModal).findByRole('button', { name: /^Import \d+ problem/ });
  await waitFor(() => expect(start).not.toBeDisabled());
  fireEvent.click(start);
  const confirm = await within(importModal).findByRole('button', { name: /Confirm import/i });
  fireEvent.click(confirm);
};

/** jsdom here has no Blob.prototype.text(); read through FileReader. */
const readBlob = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });

const withTemplate = () => {
  const blobs = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = vi.fn((blob) => {
    blobs.push(blob);
    return 'blob:mock';
  });
  URL.revokeObjectURL = vi.fn();
  return { blobs, restore: () => { URL.createObjectURL = original; } };
};

/* ------------------------------------------------------------------ dialog */

test('Bulk Upload opens ProblemImportModal directly with context applied', async () => {
  renderPage('/trainer/batches/batch-1/problems?collectionId=6ac7d722dcbd6a49cc3b719e&topicId=6ac7d727dcbd6a49cc3b71b5');
  const { dialog } = await openBulkDialog();

  expect(dialog).toHaveTextContent('Bulk Import Problems');
  expect(dialog).toHaveTextContent('Download JSON Template');
  expect(dialog).toHaveTextContent('Import JSON File');
  expect(dialog).toHaveTextContent('Paste JSON');
  // It never asks for the collection or batch again.
  expect(dialog.querySelector('#add-problem-collection')).toBeNull();
  expect(within(dialog).queryByRole('button', { name: /Create Collection/i })).toBeNull();
});

/* ----------------------------------------------------------------- template */

test('Download Template generates the backend grouped schema with the topic name prefilled', async () => {
  const { blobs, restore } = withTemplate();
  try {
    renderPage('/trainer/batches/batch-1/problems?collectionId=6ac7d722dcbd6a49cc3b719e&topicId=6ac7d727dcbd6a49cc3b71b5');
    const { dialog } = await openBulkDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: /Download JSON Template/i }));

    await waitFor(() => expect(blobs.length).toBe(1));
    const parsed = JSON.parse(await readBlob(blobs[0]));

    // The backend's own grouped shape: { topic, problems }.
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.topic).toBe('Two Pointer');
    expect(Array.isArray(parsed.problems)).toBe(true);
    expect(parsed.problems[0]).toEqual(
      expect.objectContaining({ title: 'Two Sum', difficulty: 'EASY' })
    );
    // The collection is chosen in the UI at import time, and the batch comes
    // from the route. Neither is written into the file, so a template cannot be
    // edited into importing somewhere it does not belong.
    expect(JSON.stringify(parsed)).not.toContain('6ac7d722dcbd6a49cc3b719e');
    expect(JSON.stringify(parsed)).not.toContain('6ac7d727dcbd6a49cc3b71b5');
    expect(JSON.stringify(parsed)).not.toContain('batch');
  } finally {
    restore();
  }
});

test('a template names the selected topic, which the trainer can retype to target another', async () => {
  const { blobs, restore } = withTemplate();
  try {
    getTrainerCollectionTopics.mockResolvedValue({
      data: {
        data: [
          { id: '6ac7d727dcbd6a49cc3b71b5', name: 'Two Pointer', status: 'ACTIVE', owned: true, order: 1, problemCount: 0 },
          { id: '6ac7d727dcbd6a49cc3b71b6', name: 'Sliding Window', status: 'ACTIVE', owned: true, order: 2, problemCount: 0 },
        ],
      },
    });
    renderPage('/trainer/batches/batch-1/problems?collectionId=6ac7d722dcbd6a49cc3b719e&topicId=6ac7d727dcbd6a49cc3b71b5');
    const { dialog } = await openBulkDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: /Download JSON Template/i }));

    await waitFor(() => expect(blobs.length).toBe(1));
    const parsed = JSON.parse(await readBlob(blobs[0]));
    // Prefilled with the selected Day's name. Re-typing it is how a trainer
    // files the file under a different Day of the same training — and the
    // server creates that Day when the collection does not have it yet.
    expect(parsed.topic).toBe('Two Pointer');
  } finally {
    restore();
  }
});

/* ------------------------------------------------------- file / text import */

const openImportModal = async () => {
  const { dialog } = await openBulkDialog();
  // ProblemImportModal opens directly when Bulk Upload is clicked
  return dialog;
};

test('a grouped file is sent with its topic name and the page-selected collection', async () => {
  const modal = await openImportModal();
  const grouped = {
    topic: 'Sliding Window',
    problems: [VALID_ROW.problem, { ...VALID_ROW.problem, title: 'Longest Substring' }],
  };

  fireEvent.change(modal.querySelector('input[type="file"]'), {
    target: {
      files: [new File([JSON.stringify(grouped)], 'arrays.json', { type: 'application/json' })],
    },
  });

  await submitImport();

  await waitFor(() =>
    expect(bulkImportProblems).toHaveBeenCalledWith('batch-1', {
      topic: 'Sliding Window',
      // The collection is chosen once in the UI; the per-problem ids are gone.
      collectionId: '6ac7d722dcbd6a49cc3b719e',
      problems: grouped.problems,
    })
  );
});

test('Import JSON File sends the file rows with collection, topic and batch context', async () => {
  const modal = await openImportModal();

  fireEvent.change(modal.querySelector('input[type="file"]'), {
    target: {
      files: [new File([JSON.stringify([VALID_ROW])], 'rows.json', { type: 'application/json' })],
    },
  });

  await submitImport();

  await waitFor(() =>
    expect(bulkImportProblems).toHaveBeenCalledWith('batch-1', {
      // Legacy rows keep their {collectionId, topicId, problem} wrapper: the backend
      // accepts both that and a bare problem object (problems.js:786-789).
      problems: [VALID_ROW],
      // Context is supplied by the page, not asked of the trainer.
      collectionId: '6ac7d722dcbd6a49cc3b719e',
      topicId: '6ac7d727dcbd6a49cc3b71b5',
    })
  );
});

test('Import JSON Text uses the same validation and import path as the file', async () => {
  const modal = await openImportModal();

  fireEvent.change(modal.querySelector('textarea'), {
    target: { value: JSON.stringify([VALID_ROW]) },
  });

  await submitImport();

  await waitFor(() =>
    expect(bulkImportProblems).toHaveBeenCalledWith(
      'batch-1',
      expect.objectContaining({ problems: [VALID_ROW], collectionId: '6ac7d722dcbd6a49cc3b719e', topicId: '6ac7d727dcbd6a49cc3b71b5' })
    )
  );
});

/* -------------------------------------------------------------- validation */

test('invalid JSON is reported and nothing is sent', async () => {
  const modal = await openImportModal();
  // No separate Paste JSON button – textarea is always visible
  fireEvent.change(modal.querySelector('textarea'), { target: { value: '{ not json' } });

  await waitFor(() => expect(screen.getByText('This is not valid JSON.')).toBeInTheDocument());
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a row missing required problem fields is reported before import', async () => {
  const modal = await openImportModal();
  // No separate Paste JSON button – textarea is always visible
  fireEvent.change(modal.querySelector('textarea'), {
    target: {
      value: JSON.stringify([{ collectionId: '6ac7d722dcbd6a49cc3b719e', topicId: '6ac7d727dcbd6a49cc3b71b5', problem: { title: 'No description' } }]),
    },
  });

  await waitFor(() => expect(screen.getAllByText(/Missing required fields/i).length).toBeGreaterThan(0));
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a row supplying only one of collectionId/topicId reports the pairing error', async () => {
  const modal = await openImportModal();
  // No separate Paste JSON button – textarea is always visible
  fireEvent.change(modal.querySelector('textarea'), {
    target: {
      value: JSON.stringify([
        { collectionId: '6ac7d722dcbd6a49cc3b719e', problem: { title: 'Half Pair', description: 'd', difficulty: 'EASY' } },
      ]),
    },
  });

  await waitFor(() => expect(screen.getAllByText(/must be supplied together/i).length).toBeGreaterThan(0));
  expect(bulkImportProblems).not.toHaveBeenCalled();
});

test('a server-side row error is surfaced and is not silently swallowed', async () => {
  bulkImportProblems.mockResolvedValue({
    data: {
      success: true,
      summary: { total: 2, created: 1, failed: 1 },
      errors: [{ row: 2, message: 'Problem with this slug already exists in this batch' }],
    },
  });

  const modal = await openImportModal();
  // No separate Paste JSON button – textarea is always visible
  fireEvent.change(modal.querySelector('textarea'), {
    target: {
      value: JSON.stringify([
        VALID_ROW,
        { ...VALID_ROW, problem: { ...VALID_ROW.problem, title: 'Duplicate Title' } },
      ]),
    },
  });

  await submitImport();

  await waitFor(() =>
    expect(screen.getByText(/already exists in this batch/i)).toBeInTheDocument()
  );
});

/* ------------------------------------------------------- batch requirement */

test('the general route offers no import, because problems are batch-scoped', async () => {
  // After the split, /trainer/problems is batch selection only. Problems are
  // batch-scoped, so there is no collection panel to import into and no import
  // trigger to disable: the capability is absent rather than present-but-dead.
  const root = renderPage('/trainer/problems?collectionId=6ac7d722dcbd6a49cc3b719e');

  // The general route renders batch selection (empty here, as mocked) and
  // nothing else.
  await waitFor(() =>
    expect(screen.getByText('Problems & Curriculum')).toBeInTheDocument()
  );
  expect(screen.getByText(/No batches available/i)).toBeInTheDocument();

  // No batch-specific management at all.
  expect(root.container.querySelector('.admin-problems__collections-panel')).toBeNull();
  expect(bulkButton(root)).toBeNull();
  expect(screen.queryByRole('button', { name: /Import JSON/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

/* ------------------------------------------------------------- post-import */

test('a successful import refreshes problems, collections and topics', async () => {
  getBatchProblems.mockResolvedValue({ data: { data: [] } });

  const modal = await openImportModal();
  // No separate Paste JSON button – textarea is always visible
  fireEvent.change(modal.querySelector('textarea'), {
    target: { value: JSON.stringify([VALID_ROW]) },
  });
  const problemsBefore = getBatchProblems.mock.calls.length;
  const collectionsBefore = getTrainerCollections.mock.calls.length;
  const topicsBefore = getTrainerCollectionTopics.mock.calls.length;

  await submitImport();

  // Problems reload, the collection counts (KPI + per-collection meta) reload,
  // and the topic list reloads.
  await waitFor(() => expect(getBatchProblems.mock.calls.length).toBeGreaterThan(problemsBefore));
  await waitFor(() => expect(getTrainerCollections.mock.calls.length).toBeGreaterThan(collectionsBefore));
  await waitFor(() => expect(getTrainerCollectionTopics.mock.calls.length).toBeGreaterThan(topicsBefore));

  await waitFor(() =>
    expect(screen.getByText(/Topics, problems and counts are up to date/i)).toBeInTheDocument()
  );
});

test('only trainer-authorized endpoints are used by the bulk workflow', async () => {
  const modal = await openImportModal();
  // No separate Paste JSON button – textarea is always visible
  fireEvent.change(modal.querySelector('textarea'), {
    target: { value: JSON.stringify([VALID_ROW]) },
  });
  await submitImport();

  await waitFor(() => expect(bulkImportProblems).toHaveBeenCalled());
  // The batch is taken from the route, so the request is always the trainer's
  // own batch-scoped import endpoint.
  expect(bulkImportProblems.mock.calls[0][0]).toBe('batch-1');
});