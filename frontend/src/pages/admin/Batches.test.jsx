// Focused checks for the Admin Batches table:
//   - no batch description is rendered in the table
//   - the batch name is a real, keyboard-accessible button
//   - clicking it navigates to the existing Batch Details route
//   - other columns and table alignment are unchanged
import React from 'react';
import { vi, beforeEach, test, expect } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Batches from './Batches';
import { createBatch, getBatches, getTrainers, updateBatch } from '../../api/admin';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../api/admin', () => ({
  getBatches: vi.fn(),
  createBatch: vi.fn(),
  updateBatch: vi.fn(),
  deleteBatch: vi.fn(),
  getTrainers: vi.fn(),
}));

const batch = (overrides = {}) => ({
  id: 'batch-1',
  name: 'Full Stack 2026',
  code: 'FS-2026-A',
  description: 'Backend and frontend foundations for the 2026 cohort.',
  status: 'ACTIVE',
  startDate: '2026-06-01',
  endDate: '2030-05-31',
  trainer: { id: 'trainer-1', name: 'Test Trainer', email: 'testtrainer@gmail.com' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getBatches.mockResolvedValue({ data: { success: true, data: [batch()] } });
  getTrainers.mockResolvedValue({ data: { success: true, data: [] } });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/batches']}>
      <Routes>
        <Route path="/admin/batches" element={<Batches />} />
        <Route path="/admin/batches/:batchId" element={<div>Batch Details Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const table = () => screen.getByRole('table');

// ── 1. Description removed from the table ──────────────────────────────────
test('no batch description is rendered anywhere in the table', async () => {
  renderPage();
  await screen.findByRole('button', { name: /View details for Full Stack 2026/ });

  expect(within(table()).queryByText('Backend and frontend foundations for the 2026 cohort.')).not.toBeInTheDocument();
  // Nor a Description column header.
  expect(within(table()).queryByRole('columnheader', { name: /description/i })).not.toBeInTheDocument();
  // The batch name itself is untouched.
  expect(within(table()).getByText('Full Stack 2026')).toBeInTheDocument();
});

test('a batch without a description renders identically', async () => {
  getBatches.mockResolvedValue({ data: { success: true, data: [batch({ description: '' })] } });
  renderPage();
  await screen.findByRole('button', { name: /View details for Full Stack 2026/ });
  expect(within(table()).getByText('Full Stack 2026')).toBeInTheDocument();
});

// ── 2. Batch name is a real button ─────────────────────────────────────────
test('the batch name renders as a real button with an accessible label', async () => {
  renderPage();
  const btn = await screen.findByRole('button', { name: 'View details for Full Stack 2026' });

  expect(btn.tagName).toBe('BUTTON');
  expect(btn).toHaveAttribute('type', 'button');
  expect(btn).toHaveClass('admin-batch-name-btn');
  expect(btn).toHaveTextContent('Full Stack 2026');
  expect(btn).toHaveAttribute('title', 'View Batch Details');
});

// ── 3. Navigation ──────────────────────────────────────────────────────────
test('clicking the batch name navigates to the batch details page', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /View details for Full Stack 2026/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/batches/batch-1');
});

test('each row navigates to its own batch', async () => {
  getBatches.mockResolvedValue({
    data: {
      success: true,
      data: [
        batch(),
        batch({ id: 'batch-2', name: 'Data Science 2027', code: 'DS-2027', description: 'other' }),
      ],
    },
  });
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: /View details for Data Science 2027/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/admin/batches/batch-2');
});

// ── 4. Other columns / layout unchanged ────────────────────────────────────
test('the remaining columns and their values are unchanged', async () => {
  renderPage();
  await screen.findByRole('button', { name: /View details for Full Stack 2026/ });

  const headers = within(table()).getAllByRole('columnheader').map((th) => th.textContent.trim());
  expect(headers).toEqual(['#', 'Batch Name', 'Code', 'Trainer', 'Timeline', 'Status', 'Actions']);

  expect(within(table()).getByText('FS-2026-A')).toBeInTheDocument();
  expect(within(table()).getByText('Test Trainer')).toBeInTheDocument();
  expect(within(table()).getByText('ACTIVE')).toBeInTheDocument();
  // Row actions are preserved.
  expect(within(table()).getAllByRole('button', { name: /Edit/i }).length).toBeGreaterThan(0);
  expect(within(table()).getAllByRole('button', { name: /Delete/i }).length).toBeGreaterThan(0);
});

test('the unassigned trainer affordance still works', async () => {
  getBatches.mockResolvedValue({ data: { success: true, data: [batch({ trainer: null })] } });
  renderPage();

  const assignBtn = await screen.findByRole('button', { name: 'Assign trainer to Full Stack 2026' });
  expect(assignBtn).toBeInTheDocument();
  expect(within(table()).getByText('Unassigned')).toBeInTheDocument();
});

// ── 5. Styling uses existing tokens ────────────────────────────────────────
test('the button reuses existing admin design tokens', async () => {
  const css = (await import('../../styles/pages/admin-batches.css?raw')).default;
  const rule = css.match(/\.admin-batch-name-btn \{([\s\S]*?)\}/)?.[1] ?? '';

  // Shared tokens, not hard-coded hex values.
  expect(rule).toMatch(/background:\s*var\(--admin-surface/);
  expect(rule).toMatch(/border:\s*1px solid var\(--admin-border-light/);
  expect(rule).toMatch(/border-radius:\s*var\(--admin-radius-lg/);
  expect(rule).toMatch(/box-shadow:\s*var\(--admin-shadow-sm/);
  expect(rule).toMatch(/color:\s*var\(--admin-text-primary/);
  expect(rule).toMatch(/transition:.*var\(--admin-transition-base/);
  expect(rule).toMatch(/font-family:\s*inherit/);

  // No new colours introduced in the rule body itself.
  const body = rule.replace(/\/\*.*?\*\//gs, '');
  expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(body).not.toMatch(/rgba?\(/);
});
// -- Edit modal actually submits ----------------------------------------------
//
// Regression: the <form> used to close inside admin-modal__body while the
// "Save Changes" button lived in admin-modal__footer, outside it. A
// type="submit" button that is not inside its form submits nothing, so every
// edit was silently discarded and no PATCH was ever sent.

test('the Save Changes button lives inside the form it submits', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Edit Batch/i }));

  const save = await screen.findByRole('button', { name: /Save Changes/i });
  // A submit button must be owned by a form, or clicking it is a no-op.
  expect(save).toHaveAttribute('type', 'submit');
  expect(save.closest('form')).not.toBeNull();
});

test('editing a batch and saving sends the edited values', async () => {
  updateBatch.mockResolvedValue({ data: { success: true, data: batch() } });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Edit Batch/i }));

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Batch Name/i), {
    target: { value: 'Renamed Batch' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Status/i), { target: { value: 'INACTIVE' } });

  fireEvent.click(within(dialog).getByRole('button', { name: /Save Changes/i }));

  await waitFor(() => expect(updateBatch).toHaveBeenCalledTimes(1));
  expect(updateBatch).toHaveBeenCalledWith(
    'batch-1',
    expect.objectContaining({ name: 'Renamed Batch', status: 'INACTIVE' })
  );
});

test('create uses the same form and sends createBatch', async () => {
  createBatch.mockResolvedValue({ data: { success: true, data: batch() } });
  renderPage();
  // The header action and the modal submit share the "Create Batch" label, so
  // open with the header one before the modal exists.
  fireEvent.click((await screen.findAllByRole('button', { name: /Create Batch/i }))[0]);

  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Batch Name/i), {
    target: { value: 'Brand New Batch' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Batch Code/i), { target: { value: 'BN-2026' } });

  fireEvent.click(within(dialog).getByRole('button', { name: /Create Batch/i }));

  await waitFor(() => expect(createBatch).toHaveBeenCalledTimes(1));
  expect(createBatch).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Brand New Batch', code: 'BN-2026' })
  );
});
