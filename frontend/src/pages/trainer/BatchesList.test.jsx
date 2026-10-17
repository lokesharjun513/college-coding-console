// Quick test to verify Trainer Batches page header and breadcrumb
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BatchesList from './BatchesList';
import { getTrainerBatches } from '../../api/trainer';

vi.mock('../../api/trainer', () => ({
  getTrainerBatches: vi.fn(),
}));

const mockBatches = [
  {
    id: 'batch-1',
    name: 'Alpha',
    code: 'ALPHA',
    studentCount: 10,
    status: 'ACTIVE',
    description: 'Test batch',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
  },
];

beforeEach(() => {
  getTrainerBatches.mockResolvedValue({ data: { success: true, data: mockBatches } });
});

test('renders breadcrumb and header correctly', async () => {
  render(
    <MemoryRouter initialEntries={['/trainer/batches']}>
      <BatchesList />
    </MemoryRouter>
  );
  // Wait for loading to finish
  await waitFor(() => expect(screen.getByRole('heading', { name: /Your Batches/i })).toBeInTheDocument());
  // Case-insensitive: the shared TrainerBreadcrumb uses aria-label="Breadcrumb"
  // while PageHeader uses "breadcrumb", and this assertion is about the
  // content, not which casing a component happens to use.
  const breadcrumb = screen.getByLabelText(/breadcrumb/i);
  expect(breadcrumb).toHaveTextContent('Trainer');
  expect(breadcrumb).toHaveTextContent('Batches');
});

test('the breadcrumb is identical in the loading, error and loaded states', async () => {
  const shapes = [];

  // cleanup() only runs between tests, so each render is unmounted by hand.
  // `settled` waits for the branch under test, otherwise the capture could run
  // while the loading state is still on screen and assert the same thing twice.
  const capture = async (settled) => {
    const view = render(
      <MemoryRouter initialEntries={['/trainer/batches']}>
        <BatchesList />
      </MemoryRouter>
    );
    if (settled) await waitFor(settled);
    shapes.push(screen.getByLabelText(/breadcrumb/i).textContent);
    view.unmount();
  };

  // Loading: never resolves, so the loading branch stays on screen.
  getTrainerBatches.mockReturnValue(new Promise(() => {}));
  await capture();

  // Error.
  getTrainerBatches.mockRejectedValue({ response: { data: { message: 'boom' } } });
  await capture(() => expect(screen.getByRole('alert')).toBeInTheDocument());

  // Loaded.
  getTrainerBatches.mockResolvedValue({ data: { success: true, data: mockBatches } });
  await capture(() => expect(screen.getByRole('heading', { name: /Your Batches/i })).toBeInTheDocument());

  // The page previously shipped three hand-rolled copies that had drifted apart
  // (uppercase "TRAINER / BATCH" in admin-* classes for the loaded state only).
  expect(new Set(shapes).size).toBe(1);
  expect(shapes[0]).toMatch(/Trainer/);
  expect(shapes[0]).toMatch(/Batches/);
});
