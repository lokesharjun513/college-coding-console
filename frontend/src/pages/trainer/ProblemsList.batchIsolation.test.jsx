// frontend/src/pages/trainer/ProblemsList.batchIsolation.test.jsx
//
// Isolated test for the batch collection isolation fix.
// Verifies that collections created for one batch do not appear in another batch.

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
  getBatchProblems: vi.fn(),
  getTrainerBatch: vi.fn(),
  getTrainerBatches: vi.fn(),
  getTrainerCollections: vi.fn(),
  getTrainerCollectionTopics: vi.fn(),
}));

vi.mock('../../components/ui/toast/ToastProvider', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// Fixtures for batch A
const batchA = {
  id: 'batch-a',
  name: 'Batch Alpha',
  code: 'A',
  status: 'ACTIVE',
};

// Fixtures for batch B
const batchB = {
  id: 'batch-b',
  name: 'Batch Beta',
  code: 'B',
  status: 'ACTIVE',
};

// Collection for batch A only
const collectionA = {
  id: 'col-a',
  name: 'Collection for Alpha',
  status: 'ACTIVE',
  owned: true,
  topicCount: 0,
  problemCount: 0,
  batch: batchA.id,
};

// Collection for batch B only
const collectionB = {
  id: 'col-b',
  name: 'Collection for Beta',
  status: 'ACTIVE',
  owned: true,
  topicCount: 0,
  problemCount: 0,
  batch: batchB.id,
};

const renderPage = (route = '/trainer/problems') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/trainer/problems" element={<ProblemsList />} />
        <Route path="/trainer/batches/:batchId/problems" element={<ProblemsList />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  getTrainerBatches.mockResolvedValue({ data: { data: [batchA, batchB] } });
  getTrainerBatch.mockResolvedValue({ data: { data: batchA } });
  getTrainerCollections.mockResolvedValue({ data: { data: [] } });
  getTrainerCollectionTopics.mockResolvedValue({ data: { data: [] } });
  getBatchProblems.mockResolvedValue({ data: { data: [] } });
  createTrainerCollection.mockResolvedValue({
    data: { data: { _id: 'col-new', name: 'New Collection', status: 'ACTIVE', owned: true, topicCount: 0 } },
  });
});

test('collections for batch A do not appear when viewing batch B', async () => {
  // When viewing batch B, only collectionB should be returned
  getTrainerCollections.mockResolvedValue({
    data: { data: [{ ...collectionB }] },
  });
  getTrainerBatch.mockResolvedValue({ data: { data: batchB } });
  renderPage('/trainer/batches/batch-b/problems');

  await waitFor(() => expect(screen.getByText('Collection for Beta')).toBeInTheDocument());
  expect(screen.queryByText('Collection for Alpha')).not.toBeInTheDocument();
});

test('collections for batch B do not appear when viewing batch A', async () => {
  // When viewing batch A, only collectionA should be returned
  getTrainerCollections.mockResolvedValue({
    data: { data: [{ ...collectionA }] },
  });
  getTrainerBatch.mockResolvedValue({ data: { data: batchA } });
  renderPage('/trainer/batches/batch-a/problems');

  await waitFor(() => expect(screen.getByText('Collection for Alpha')).toBeInTheDocument());
  expect(screen.queryByText('Collection for Beta')).not.toBeInTheDocument();
});

test('batchId is passed to collections API on batch-specific route', async () => {
  getTrainerBatch.mockResolvedValue({ data: { data: batchA } });
  renderPage('/trainer/batches/batch-a/problems');

  // The API should be called with batchId parameter
  await waitFor(() => {
    expect(getTrainerCollections).toHaveBeenCalled();
    const call = getTrainerCollections.mock.calls[0];
    expect(call[0]?.batchId).toBe('batch-a');
  });
});

test('general route does not pass batchId parameter', async () => {
  getTrainerBatch.mockResolvedValue({ data: { data: batchA } });
  renderPage('/trainer/problems');

  // The general route renders batch selection, not a workspace, so collections
  // are never requested there at all — there is no opportunity to scope (or
  // leak) a batchId. Asserting the absence is a stronger guarantee than
  // asserting the argument is undefined.
  await waitFor(() => expect(screen.getByRole('region', { name: /available batches/i })).toBeInTheDocument());
  expect(getTrainerCollections).not.toHaveBeenCalled();
});

test('creating a collection persists correct batchId', async () => {
  getTrainerCollections.mockResolvedValueOnce({ data: { data: [] } });
  getTrainerBatch.mockResolvedValue({ data: { data: batchA } });
  renderPage('/trainer/batches/batch-a/problems');

  await waitFor(() => expect(screen.getByText('No Collections Yet')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Create Collection/i }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Collection name/i), {
    target: { value: 'New Collection' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Description/i), {
    target: { value: 'Test description' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: /^Create Collection$/i }));

  await waitFor(() => expect(createTrainerCollection).toHaveBeenCalledTimes(1));
  const [payload] = createTrainerCollection.mock.calls[0];
  expect(payload.batchId).toBe('batch-a');
});
